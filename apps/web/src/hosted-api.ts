import { openDB } from "idb";
import { z } from "zod";
import {
  applyOperations,
  validateScene,
  type Scene,
} from "../../../packages/core/src";
import {
  assertLocalConfiguration,
  buildModelMessages,
  createOllamaProvider,
  type AiInput,
  type AiResult,
  type LocalProvider,
} from "../../api/src/provider";

/** Static hosting uses the visitor's IndexedDB. Nothing here requires a paid
 * service, a server account, or uploading a private draft to the host. */
export class HostedApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
type Project = {
  id: string;
  name: string;
  headRevisionId: string;
  updatedAt: string;
};
type Revision = {
  id: string;
  parentId: string | null;
  label: string;
  createdAt: string;
  scene: Scene;
};
type Connector = { url: string; model: string; enabled: boolean };
type Job = {
  requestId: string;
  input: AiInput;
  payload: string;
  status: "queued" | "running" | "completed" | "failed" | "indeterminate";
  model: string;
  createdAt: string;
  result?: AiResult;
  error?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  disposition?: "applied" | "superseded";
  appliedRevisionId?: string;
};
export type HostedState = {
  projects: { project: Project; revisions: Revision[] }[];
  operations: { id: string; payload: string; response: unknown }[];
  shares: { id: string; projectName: string; createdAt: string; url: string }[];
  jobs: Job[];
  connector: Connector;
};
export const emptyHostedState = (): HostedState => ({
  projects: [],
  operations: [],
  shares: [],
  jobs: [],
  connector: {
    url: "http://127.0.0.1:11434",
    model: "qwen3:4b",
    enabled: false,
  },
});
export interface HostedStore {
  read(): Promise<HostedState>;
  update<T>(fn: (state: HostedState) => T): Promise<T>;
}
export function createIndexedDbStore(
  name = "living-poster-hosted",
): HostedStore {
  const database = openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("runtime");
    },
  });
  return {
    async read() {
      return (
        (await (await database).get("runtime", "state")) ?? emptyHostedState()
      );
    },
    async update(fn) {
      const tx = (await database).transaction("runtime", "readwrite");
      try {
        const state: HostedState =
          (await tx.store.get("state")) ?? emptyHostedState();
        const result = fn(state);
        await tx.store.put(state, "state");
        await tx.done;
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* The failed transaction is already closed. */
        }
        await tx.done.catch(() => {});
        throw error;
      }
    },
  };
}
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
const MAX_BYTES = 256 * 1024;
const MAX_FRAGMENT = 360000;
const bytes = (text: string) => new TextEncoder().encode(text);
const toBase64 = (data: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < data.length; i += 8192)
    binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};
async function boundedRead(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new HostedApiError(
          "This shared poster exceeds the 256 KB limit.",
          400,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
export async function encodePresentation(title: string, scene: Scene) {
  const data = bytes(
    JSON.stringify({ title: name.parse(title), scene: validateScene(scene) }),
  );
  if (data.length > MAX_BYTES)
    throw new HostedApiError(
      "This poster is too large for a portable link. Export an HTML file instead.",
      400,
    );
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([data])
      .stream()
      .pipeThrough(new CompressionStream("deflate"));
    return `v1.deflate.${toBase64(await boundedRead(stream, MAX_BYTES + 1024))}`;
  }
  return `v1.json.${toBase64(data)}`;
}
export async function decodePresentation(fragment: string) {
  const value = fragment.replace(/^#/, "");
  if (value.length > MAX_FRAGMENT)
    throw new HostedApiError("This shared poster link is too large.", 400);
  const match = /^v1\.(deflate|json)\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!match)
    throw new HostedApiError(
      "This portable poster link is incomplete or invalid.",
      400,
    );
  try {
    const encoded = Uint8Array.from(
      atob(match[2].replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    let data: Uint8Array = encoded;
    if (match[1] === "deflate") {
      if (typeof DecompressionStream === "undefined")
        throw new HostedApiError(
          "Open this compressed poster link in a current browser.",
          400,
        );
      data = await boundedRead(
        new Blob([encoded])
          .stream()
          .pipeThrough(new DecompressionStream("deflate")),
        MAX_BYTES,
      );
    }
    if (data.length > MAX_BYTES)
      throw new HostedApiError(
        "This shared poster exceeds the 256 KB limit.",
        400,
      );
    const parsed = z
      .object({ title: name, scene: z.unknown() })
      .strict()
      .parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
      );
    return { title: parsed.title, scene: validateScene(parsed.scene) };
  } catch (error) {
    if (error instanceof HostedApiError) throw error;
    throw new HostedApiError(
      "This portable poster link is damaged or contains an invalid scene.",
      400,
    );
  }
}
const jobDto = ({ payload: _payload, ...job }: Job) => ({
  ...job,
  baseRevisionId: job.input.baseRevisionId,
  requestGeneration: job.input.requestGeneration,
  mutationEpoch: job.input.mutationEpoch,
  selectedLayerIds: job.input.selectedLayerIds,
  cost: 0,
});
const jobSchema = z
  .object({
    requestId: id,
    scene: z.unknown(),
    selectedLayerIds: z.array(id).max(64),
    instruction: z.string().trim().min(1).max(2000),
    allowTextChanges: z.boolean(),
    baseRevisionId: id,
    requestGeneration: z.number().int().nonnegative(),
    mutationEpoch: z.number().int().nonnegative(),
  })
  .strict();
const RUNNER_LOCK = "living-poster-hosted-ollama";
type RuntimeOptions = {
  store?: HostedStore;
  providerFactory?: (url: string, model: string) => LocalProvider;
  fragment?: () => string;
  locks?: LockManager | null;
  timeoutMs?: number;
};

export function createHostedApi(options: RuntimeOptions = {}) {
  const store = options.store ?? createIndexedDbStore();
  const providerFactory = options.providerFactory ?? createOllamaProvider;
  const locks =
    options.locks === undefined ? globalThis.navigator?.locks : options.locks;
  const queue: { input: AiInput; provider: LocalProvider }[] = [];
  let active = false;
  let disposed = false;
  let controller: AbortController | undefined;
  let releaseLease: (() => void) | undefined;
  let acquiring: Promise<void> | undefined;
  let reservations = 0;
  let connectionGeneration = 0;
  let connection: { available: boolean; reason?: string } = {
    available: false,
    reason:
      "Connect your own local Ollama in Studio settings. Manual editing and exports are ready.",
  };
  const initialized = (async () => {
    // Another live tab keeps its requests. With no runner lock, interrupted
    // requests are durable evidence, never automatically sent to the model again.
    const recover = () =>
      store.update((state) => {
        for (const job of state.jobs)
          if (job.status === "queued" || job.status === "running") {
            job.status = "indeterminate";
            job.error =
              "The page closed before this request finished. No result was applied; submit a new instruction to retry.";
          }
      });
    if (locks)
      await locks.request(RUNNER_LOCK, { ifAvailable: true }, async (lock) => {
        if (lock) await recover();
      });
    else await recover();
  })();
  async function lease() {
    if (releaseLease || !locks) return;
    if (acquiring) return acquiring;
    acquiring = new Promise<void>((resolve, reject) => {
      void locks
        .request(RUNNER_LOCK, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            reject(
              new HostedApiError(
                "Another tab is using the local model. Finish its request before starting one here.",
                429,
              ),
            );
            return;
          }
          const held = new Promise<void>((done) => {
            releaseLease = done;
          });
          resolve();
          await held;
        })
        .catch(reject);
    });
    try {
      await acquiring;
    } finally {
      acquiring = undefined;
    }
  }
  function releaseIfIdle() {
    if (!active && !queue.length && !reservations) {
      const release = releaseLease;
      releaseLease = undefined;
      release?.();
    }
  }
  async function drain() {
    if (active) return;
    if (disposed) {
      releaseIfIdle();
      return;
    }
    const next = queue.shift();
    if (!next) {
      releaseIfIdle();
      return;
    }
    active = true;
    controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(
      () => controller?.abort(),
      options.timeoutMs ?? 120000,
    );
    const started = Date.now();
    try {
      await store.update((state) => {
        state.jobs.find((j) => j.requestId === next.input.requestId)!.status =
          "running";
      });
      const output = await next.provider.generate(next.input, signal);
      if (signal.aborted || disposed)
        throw new Error("The local request was interrupted.");
      if (output.result.kind === "edit")
        applyOperations(next.input.scene, output.result.operations, {
          allowTextChanges: next.input.allowTextChanges,
        });
      await store.update((state) =>
        Object.assign(
          state.jobs.find((j) => j.requestId === next.input.requestId)!,
          output,
          { status: "completed", latencyMs: Date.now() - started },
        ),
      );
    } catch (error) {
      await store.update((state) =>
        Object.assign(
          state.jobs.find((j) => j.requestId === next.input.requestId)!,
          {
            status: signal.aborted || disposed ? "indeterminate" : "failed",
            latencyMs: Date.now() - started,
            error:
              signal.aborted || disposed
                ? "The local request was interrupted or timed out. Nothing was applied. Submit a new instruction to try again."
                : error instanceof Error
                  ? error.message.slice(0, 600)
                  : "The local model could not complete this request.",
          },
        ),
      );
    } finally {
      clearTimeout(timer);
      controller = undefined;
      active = false;
      void drain();
    }
  }
  const dedupe = <T>(
    state: HostedState,
    operationId: string,
    payload: unknown,
    action: () => T,
  ): T => {
    const serial = canonical(payload);
    const prior = state.operations.find((o) => o.id === operationId);
    if (prior) {
      if (prior.payload !== serial)
        throw new HostedApiError(
          "This operation ID already belongs to different content.",
          409,
        );
      return prior.response as T;
    }
    const response = action();
    state.operations.push({
      id: operationId,
      payload: serial,
      response: structuredClone(response),
    });
    return response;
  };
  function project(state: HostedState, projectId: string) {
    const value = state.projects.find((p) => p.project.id === projectId);
    if (!value)
      throw new HostedApiError(
        "Project not found in this browser profile.",
        404,
      );
    return value;
  }
  async function request(
    path: string,
    options: RequestInit = {},
  ): Promise<any> {
    await initialized;
    if (disposed)
      throw new HostedApiError(
        "This editor session has ended. Reload the page.",
        410,
      );
    const method = options.method?.toUpperCase() ?? "GET";
    let body: any = {};
    if (options.body !== undefined) {
      if (
        typeof options.body !== "string" ||
        bytes(options.body).length > MAX_BYTES
      )
        throw new HostedApiError("The request exceeds the 256 KB limit.", 400);
      try {
        body = JSON.parse(options.body);
      } catch {
        throw new HostedApiError("Send a valid JSON request.", 400);
      }
    }
    if (path === "/capabilities" && method === "GET") {
      const state = await store.read();
      return {
        free: true,
        authenticated: true,
        needsSetup: false,
        runtime: "browser",
        storage: "indexeddb",
        sharePolicy: "portable",
        ai: {
          ...connection,
          model: state.connector.model,
          connector: { ...state.connector, enabled: connection.available },
        },
      };
    }
    if (path === "/ai/connector" && method === "POST") {
      const generation = ++connectionGeneration;
      const config = z
        .object({ url: z.string().max(200), model: z.string().max(100) })
        .strict()
        .parse(body);
      const origin = assertLocalConfiguration(config.url, config.model);
      const provider = providerFactory(origin, config.model);
      const result = await provider.available();
      if (generation !== connectionGeneration || disposed)
        throw new HostedApiError(
          "A newer connection change superseded this attempt.",
          409,
        );
      connection = result.available
        ? result
        : {
            available: false,
            reason: `${result.reason ?? "Ollama could not connect."} Allow this website in OLLAMA_ORIGINS, restart Ollama, and allow local-network access in your browser.`,
          };
      await store.update((state) => {
        state.connector = {
          url: origin,
          model: config.model,
          enabled: result.available,
        };
      });
      return { ...connection, model: config.model };
    }
    if (path === "/ai/connector" && method === "DELETE") {
      connectionGeneration++;
      connection = {
        available: false,
        reason:
          "Local AI is disconnected. Connect in Studio settings when needed.",
      };
      await store.update((state) => {
        state.connector.enabled = false;
      });
      controller?.abort();
      for (const item of queue.splice(0))
        await store.update((state) => {
          const job = state.jobs.find(
            (j) => j.requestId === item.input.requestId,
          )!;
          job.status = "indeterminate";
          job.error = "Local AI was disconnected before this request ran.";
        });
      releaseIfIdle();
      return { ok: true };
    }
    if (path.startsWith("/auth/")) return { ok: true };
    if (path === "/projects" && method === "GET")
      return {
        projects: (await store.read()).projects
          .map((p) => p.project)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      };
    if (path === "/projects" && method === "POST") {
      const parsed = z
        .object({ name, scene: z.unknown(), operationId: id })
        .strict()
        .parse(body);
      const scene = validateScene(parsed.scene);
      return store.update((state) =>
        dedupe(state, parsed.operationId, { path, ...parsed }, () => {
          const now = new Date().toISOString();
          const value: Project = {
            id: crypto.randomUUID(),
            name: parsed.name,
            headRevisionId: scene.revision.id,
            updatedAt: now,
          };
          state.projects.push({
            project: value,
            revisions: [
              {
                id: scene.revision.id,
                parentId: null,
                label: "Initial version",
                createdAt: now,
                scene,
              },
            ],
          });
          return { project: value, scene };
        }),
      );
    }
    const projectMatch = /^\/projects\/([^/]+)(\/revisions)?$/.exec(path);
    if (projectMatch) {
      const projectId = projectMatch[1];
      if (!projectMatch[2] && method === "GET") {
        const value = project(await store.read(), projectId);
        return {
          project: value.project,
          scene: value.revisions.find(
            (r) => r.id === value.project.headRevisionId,
          )!.scene,
        };
      }
      if (!projectMatch[2] && method === "PATCH") {
        const parsed = z.object({ name }).strict().parse(body);
        return store.update((state) => {
          const value = project(state, projectId).project;
          Object.assign(value, {
            name: parsed.name,
            updatedAt: new Date().toISOString(),
          });
          return { project: value };
        });
      }
      if (projectMatch[2] && method === "GET")
        return {
          revisions: [
            ...project(await store.read(), projectId).revisions,
          ].reverse(),
        };
      if (projectMatch[2] && method === "POST") {
        const parsed = z
          .object({
            scene: z.unknown(),
            expectedHeadRevisionId: id,
            operationId: id,
            label: z.string().trim().max(120).optional(),
          })
          .strict()
          .parse(body);
        const scene = validateScene(parsed.scene);
        return store.update((state) =>
          dedupe(state, parsed.operationId, { path, ...parsed }, () => {
            const value = project(state, projectId);
            if (value.project.headRevisionId !== parsed.expectedHeadRevisionId)
              throw new HostedApiError(
                "The saved project changed in another tab. Save your draft as a new project to preserve both versions.",
                409,
              );
            if (value.revisions.some((r) => r.id === scene.revision.id))
              throw new HostedApiError(
                "Revision snapshots are immutable. Create a fresh revision.",
                409,
              );
            const now = new Date().toISOString();
            value.revisions.push({
              id: scene.revision.id,
              parentId: value.project.headRevisionId,
              label: parsed.label || "Edit",
              createdAt: now,
              scene,
            });
            value.project.headRevisionId = scene.revision.id;
            value.project.updatedAt = now;
            return {
              revisionId: scene.revision.id,
              headRevisionId: scene.revision.id,
            };
          }),
        );
      }
    }
    if (path === "/shares" && method === "POST") {
      const parsed = z
        .object({ projectId: id, revisionId: id })
        .strict()
        .parse(body);
      const value = project(await store.read(), parsed.projectId);
      const revision = value.revisions.find((r) => r.id === parsed.revisionId);
      if (!revision) throw new HostedApiError("Revision not found.", 404);
      const token = await encodePresentation(
        value.project.name,
        revision.scene,
      );
      const share = {
        id: crypto.randomUUID(),
        projectName: value.project.name,
        createdAt: new Date().toISOString(),
        url: `/p/shared#${token}`,
      };
      await store.update((state) => {
        state.shares.push(share);
      });
      return { id: share.id, token, url: share.url, portable: true };
    }
    if (path === "/shares" && method === "GET")
      return {
        shares: [...(await store.read()).shares]
          .reverse()
          .map((s) => ({ ...s, revoked: false, portable: true })),
      };
    const shareMatch = /^\/shares\/([^/]+)$/.exec(path);
    if (shareMatch && method === "DELETE")
      return store.update((state) => {
        if (!state.shares.some((s) => s.id === shareMatch[1]))
          throw new HostedApiError("Share not found.", 404);
        state.shares = state.shares.filter((s) => s.id !== shareMatch[1]);
        return { ok: true, removedFromList: true, revoked: false };
      });
    if (path === "/presentations/shared" && method === "GET")
      return decodePresentation(optionsFragment());
    if (path === "/ai/history" && method === "GET")
      return {
        requests: [...(await store.read()).jobs]
          .reverse()
          .slice(0, 100)
          .map(jobDto),
      };
    const jobMatch = /^\/ai\/edits\/([^/]+)(\/disposition)?$/.exec(path);
    if (jobMatch) {
      if (!jobMatch[2] && method === "GET") {
        const value = (await store.read()).jobs.find(
          (j) => j.requestId === jobMatch[1],
        );
        if (!value) throw new HostedApiError("AI request not found.", 404);
        return jobDto(value);
      }
      if (jobMatch[2] && method === "POST") {
        const parsed = z
          .object({
            status: z.enum(["applied", "superseded"]),
            appliedRevisionId: id.optional(),
          })
          .strict()
          .parse(body);
        return store.update((state) => {
          const value = state.jobs.find((j) => j.requestId === jobMatch[1]);
          if (!value) throw new HostedApiError("AI request not found.", 404);
          if (
            parsed.status === "applied" &&
            (value.status !== "completed" ||
              value.result?.kind !== "edit" ||
              !parsed.appliedRevisionId)
          )
            throw new HostedApiError(
              "Only a completed edit can be linked to an applied revision.",
              400,
            );
          value.disposition = parsed.status;
          value.appliedRevisionId = parsed.appliedRevisionId;
          return { ok: true };
        });
      }
    }
    if (path === "/ai/edits" && method === "POST") {
      const parsed = jobSchema.parse(body);
      const input: AiInput = { ...parsed, scene: validateScene(parsed.scene) };
      if (
        input.baseRevisionId !== input.scene.revision.id ||
        new Set(input.selectedLayerIds).size !==
          input.selectedLayerIds.length ||
        input.selectedLayerIds.some(
          (selected) =>
            !input.scene.layers.some((layer) => layer.id === selected),
        )
      )
        throw new HostedApiError(
          "Request metadata must match the submitted scene.",
          400,
        );
      const payload = canonical(input);
      const state = await store.read();
      const previous = state.jobs.find((j) => j.requestId === input.requestId);
      if (previous) {
        if (previous.payload !== payload)
          throw new HostedApiError(
            "This request ID already belongs to a different instruction or scene.",
            409,
          );
        return { requestId: previous.requestId, status: previous.status };
      }
      if (!state.connector.enabled || !connection.available)
        throw new HostedApiError(
          "Connect your local Ollama in Studio settings before using language edits.",
          503,
        );
      const inputConnector = { ...state.connector };
      buildModelMessages(input);
      if (queue.length + (active ? 1 : 0) + reservations >= 8)
        throw new HostedApiError(
          "The local model queue is full. Try again after a request finishes.",
          429,
        );
      reservations++;
      try {
        await lease();
        const inserted = await store.update((state) => {
          const raced = state.jobs.find((j) => j.requestId === input.requestId);
          if (raced) {
            if (raced.payload !== payload)
              throw new HostedApiError(
                "This request ID already belongs to different content.",
                409,
              );
            return { fresh: false, status: raced.status };
          }
          if (disposed || !connection.available || !state.connector.enabled)
            throw new HostedApiError(
              "Local AI was disconnected before this request could be queued.",
              503,
            );
          if (
            state.connector.url !== inputConnector.url ||
            state.connector.model !== inputConnector.model
          )
            throw new HostedApiError(
              "The local model connection changed. Submit this instruction again.",
              409,
            );
          state.jobs.push({
            requestId: input.requestId,
            input,
            payload,
            status: "queued",
            model: state.connector.model,
            createdAt: new Date().toISOString(),
          });
          return { fresh: true, status: "queued" };
        });
        if (inserted.fresh) {
          if (disposed || !connection.available) {
            await store.update((state) => {
              const job = state.jobs.find(
                (j) => j.requestId === input.requestId,
              )!;
              job.status = "indeterminate";
              job.error = "Local AI was disconnected before this request ran.";
            });
            return { requestId: input.requestId, status: "indeterminate" };
          }
          queue.push({
            input,
            provider: providerFactory(inputConnector.url, inputConnector.model),
          });
          void drain();
        }
        return { requestId: input.requestId, status: inserted.status };
      } finally {
        reservations--;
        releaseIfIdle();
      }
    }
    throw new HostedApiError("This browser route was not found.", 404);
  }
  const optionsFragment =
    options.fragment ?? (() => globalThis.location?.hash ?? "");
  return {
    async request(path: string, init?: RequestInit) {
      try {
        return await request(path, init);
      } catch (error) {
        if (error instanceof HostedApiError) throw error;
        if (error instanceof z.ZodError)
          throw new HostedApiError(
            error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
              .slice(0, 600),
            400,
          );
        if (
          error instanceof DOMException &&
          [
            "QuotaExceededError",
            "UnknownError",
            "InvalidStateError",
            "SecurityError",
          ].includes(error.name)
        )
          throw new HostedApiError(
            "Browser storage is unavailable or full. Export your poster to preserve it, then check this site's storage permissions.",
            507,
          );
        throw new HostedApiError(
          error instanceof Error
            ? error.message
            : "The browser could not complete this request.",
          400,
        );
      }
    },
    dispose() {
      disposed = true;
      connectionGeneration++;
      controller?.abort();
      queue.length = 0;
      releaseIfIdle();
    },
  };
}
let runtime: ReturnType<typeof createHostedApi> | undefined;
export const hostedRequest = (path: string, options?: RequestInit) =>
  (runtime ??= createHostedApi()).request(path, options);
