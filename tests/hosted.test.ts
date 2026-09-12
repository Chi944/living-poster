import { afterEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import {
  createHostedApi,
  decodePresentation,
  emptyHostedState,
  encodePresentation,
  type HostedState,
  type HostedStore,
} from "../apps/web/src/hosted-api";
import { EXAMPLES, reviseScene, type Scene } from "../packages/core/src";
import type { AiInput, LocalProvider } from "../apps/api/src/provider";

function memoryStore(initial = emptyHostedState()): HostedStore {
  let state = structuredClone(initial);
  let chain = Promise.resolve();
  return {
    async read() {
      await chain;
      return structuredClone(state);
    },
    update(fn) {
      const result = chain.then(() => {
        const copy = structuredClone(state);
        const result = fn(copy);
        state = structuredClone(copy);
        return structuredClone(result);
      });
      chain = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
}
const runtimes: ReturnType<typeof createHostedApi>[] = [];
const create = (options: Parameters<typeof createHostedApi>[0] = {}) => {
  const value = createHostedApi({
    store: memoryStore(),
    locks: null,
    ...options,
  });
  runtimes.push(value);
  return value;
};
const post = (
  runtime: ReturnType<typeof createHostedApi>,
  path: string,
  body: unknown,
) => runtime.request(path, { method: "POST", body: JSON.stringify(body) });
const scene = () => structuredClone(EXAMPLES[0].scene);
const aiInput = (requestId = "ai-first"): AiInput => {
  const value = scene();
  return {
    requestId,
    scene: value,
    selectedLayerIds: [value.layers[0].id],
    instruction: "Make the selected layer red",
    allowTextChanges: false,
    baseRevisionId: value.revision.id,
    requestGeneration: 7,
    mutationEpoch: 13,
  };
};
const provider: LocalProvider = {
  available: async () => ({ available: true }),
  generate: async (input) => ({
    result: {
      kind: "edit",
      operations: [
        {
          type: "setFill",
          layerId: input.selectedLayerIds[0],
          colour: "#ff0000",
        },
      ],
      summary: "Made the selected layer red",
    },
    inputTokens: 15,
    outputTokens: 12,
  }),
};
const connect = (runtime: ReturnType<typeof createHostedApi>) =>
  post(runtime, "/ai/connector", {
    url: "http://127.0.0.1:11434",
    model: "qwen3:4b",
  });
const waitJob = async (
  runtime: ReturnType<typeof createHostedApi>,
  requestId = "ai-first",
) => {
  await vi.waitFor(
    async () =>
      expect(
        (await runtime.request(`/ai/edits/${requestId}`)).status,
      ).not.toMatch(/^(queued|running)$/),
    { timeout: 3000 },
  );
  return runtime.request(`/ai/edits/${requestId}`);
};
function fakeLocks() {
  let held = false;
  return {
    request: vi.fn(
      async (
        name: string,
        _options: unknown,
        callback: (lock: Lock | null) => unknown,
      ) => {
        if (held) return callback(null);
        held = true;
        try {
          return await callback({ name, mode: "exclusive" } as Lock);
        } finally {
          held = false;
        }
      },
    ),
    query: vi.fn(async () => ({
      held: held
        ? [{ name: "living-poster-hosted-ollama", mode: "exclusive" }]
        : [],
      pending: [],
    })),
  } as unknown as LockManager;
}
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  vi.restoreAllMocks();
});

describe("free hosted browser runtime", () => {
  it("requires no password and makes no model request before explicit connection, including after a reload", async () => {
    const state = emptyHostedState();
    state.connector.enabled = true;
    const factory = vi.fn(() => provider);
    const runtime = create({
      store: memoryStore(state),
      providerFactory: factory,
    });
    const capabilities = await runtime.request("/capabilities");
    expect(capabilities).toMatchObject({
      free: true,
      authenticated: true,
      needsSetup: false,
      storage: "indexeddb",
      runtime: "browser",
      sharePolicy: "portable",
      ai: { available: false },
    });
    expect(factory).not.toHaveBeenCalled();
    await expect(post(runtime, "/ai/edits", aiInput())).rejects.toMatchObject({
      status: 503,
    });
    expect(factory).not.toHaveBeenCalled();
    await connect(runtime);
    expect((await runtime.request("/capabilities")).ai.available).toBe(true);
  });

  it("saves named revisions atomically, checks the head, and preserves idempotent responses after later edits", async () => {
    const runtime = create();
    const initial = scene();
    const request = {
      name: "Private browser poster",
      scene: initial,
      operationId: "create-one",
    };
    const created = await post(runtime, "/projects", request);
    const changed = reviseScene(initial);
    changed.artboard.background = "#ffffff";
    const revision = {
      scene: changed,
      expectedHeadRevisionId: initial.revision.id,
      operationId: "revision-one",
      label: "White paper",
    };
    const saved = await post(
      runtime,
      `/projects/${created.project.id}/revisions`,
      revision,
    );
    expect(saved.headRevisionId).toBe(changed.revision.id);
    expect(
      await post(
        runtime,
        `/projects/${created.project.id}/revisions`,
        revision,
      ),
    ).toEqual(saved);
    expect(await post(runtime, "/projects", request)).toEqual(created);
    await expect(
      post(runtime, `/projects/${created.project.id}/revisions`, {
        ...revision,
        scene: reviseScene(changed),
        operationId: "stale-save",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const history = await runtime.request(
      `/projects/${created.project.id}/revisions`,
    );
    expect(history.revisions).toHaveLength(2);
    expect(history.revisions[0]).toMatchObject({
      label: "White paper",
      parentId: initial.revision.id,
    });
    expect(history.revisions[1].scene).toEqual(initial);
    const duplicateId = { ...request, name: "Different content" };
    await expect(post(runtime, "/projects", duplicateId)).rejects.toMatchObject(
      { status: 409 },
    );
  });

  it("allows one concurrent revision winner and persists data into another runtime", async () => {
    const store = memoryStore();
    const first = create({ store });
    const second = create({ store });
    const initial = scene();
    const saved = await post(first, "/projects", {
      name: "Across tabs",
      scene: initial,
      operationId: "create",
    });
    const writes = await Promise.allSettled(
      [first, second].map((runtime, i) =>
        post(runtime, `/projects/${saved.project.id}/revisions`, {
          scene: reviseScene(initial),
          expectedHeadRevisionId: initial.revision.id,
          operationId: `tab-${i}`,
        }),
      ),
    );
    expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await second.request("/projects")).projects).toHaveLength(1);
    expect(
      (await second.request(`/projects/${saved.project.id}/revisions`))
        .revisions,
    ).toHaveLength(2);
  });

  it("shares an immutable portable snapshot and honestly removes only the local listing", async () => {
    const runtime = create();
    const initial = scene();
    const created = await post(runtime, "/projects", {
      name: "Portable poster",
      scene: initial,
      operationId: "create",
    });
    const share = await post(runtime, "/shares", {
      projectId: created.project.id,
      revisionId: initial.revision.id,
    });
    const guest = create({ fragment: () => share.url.split("#")[1] });
    expect((await guest.request("/presentations/shared")).scene).toEqual(
      initial,
    );
    const edited = reviseScene(initial);
    edited.artboard.background = "#010203";
    await post(runtime, `/projects/${created.project.id}/revisions`, {
      scene: edited,
      expectedHeadRevisionId: initial.revision.id,
      operationId: "edit",
    });
    expect(
      (await guest.request("/presentations/shared")).scene.artboard.background,
    ).toBe(initial.artboard.background);
    expect(
      await runtime.request(`/shares/${share.id}`, { method: "DELETE" }),
    ).toMatchObject({ removedFromList: true, revoked: false });
    expect((await runtime.request("/shares")).shares).toEqual([]);
    expect((await guest.request("/presentations/shared")).title).toBe(
      "Portable poster",
    );
  });

  it("never contacts a remote endpoint or a cloud model even with a caller-supplied connector", async () => {
    const factory = vi.fn(() => provider);
    const runtime = create({ providerFactory: factory });
    await expect(
      post(runtime, "/ai/connector", {
        url: "https://api.example.com",
        model: "qwen3:4b",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      post(runtime, "/ai/connector", {
        url: "http://127.0.0.1:11434",
        model: "model-cloud",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      post(runtime, "/ai/connector", {
        url: "http://127.0.0.1:11434/other",
        model: "qwen3:4b",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(factory).not.toHaveBeenCalled();
  });

  it("deduplicates real provider dispatch, returns captured metadata, and validates applied disposition", async () => {
    const generate = vi.fn(provider.generate);
    const runtime = create({
      providerFactory: () => ({ ...provider, generate }),
    });
    await connect(runtime);
    const input = aiInput();
    await Promise.all([
      post(runtime, "/ai/edits", input),
      post(runtime, "/ai/edits", input),
    ]);
    const completed = await waitJob(runtime);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(completed).toMatchObject({
      status: "completed",
      baseRevisionId: input.baseRevisionId,
      requestGeneration: 7,
      mutationEpoch: 13,
      inputTokens: 15,
      outputTokens: 12,
      cost: 0,
    });
    expect(completed.input.scene).toEqual(input.scene);
    await expect(
      post(runtime, "/ai/edits", {
        ...input,
        instruction: "Something different",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      post(runtime, "/ai/edits/ai-first/disposition", { status: "applied" }),
    ).rejects.toMatchObject({ status: 400 });
    await post(runtime, "/ai/edits/ai-first/disposition", {
      status: "applied",
      appliedRevisionId: "new-applied-revision",
    });
    expect((await runtime.request("/ai/history")).requests[0]).toMatchObject({
      disposition: "applied",
      appliedRevisionId: "new-applied-revision",
    });
  });

  it("validates metadata and rejects invalid generated operations before completing a job", async () => {
    const runtime = create({
      providerFactory: () => ({
        ...provider,
        generate: async () => ({
          result: {
            kind: "edit",
            operations: [
              { type: "setFill", layerId: "missing-layer", colour: "#ff0000" },
            ],
            summary: "Invalid edit",
          },
        }),
      }),
    });
    await connect(runtime);
    await expect(
      post(runtime, "/ai/edits", {
        ...aiInput(),
        baseRevisionId: "wrong-revision",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      post(runtime, "/ai/edits", {
        ...aiInput(),
        selectedLayerIds: ["missing"],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await post(runtime, "/ai/edits", aiInput());
    expect((await waitJob(runtime)).status).toBe("failed");
    await expect(
      post(runtime, "/ai/edits/ai-first/disposition", {
        status: "applied",
        appliedRevisionId: "revision",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps the queue bounded and executes requests one at a time", async () => {
    let finish: (() => void) | undefined;
    let concurrent = 0;
    let peak = 0;
    const generate = vi.fn(async (input: AiInput) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      concurrent--;
      return provider.generate(input, new AbortController().signal);
    });
    const runtime = create({
      providerFactory: () => ({ ...provider, generate }),
    });
    await connect(runtime);
    for (let i = 0; i < 8; i++)
      await post(runtime, "/ai/edits", aiInput(`queue-${i}`));
    await expect(
      post(runtime, "/ai/edits", aiInput("queue-overflow")),
    ).rejects.toMatchObject({ status: 429 });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    finish!();
    await waitJob(runtime, "queue-0");
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    expect(peak).toBe(1);
    await runtime.request("/ai/connector", { method: "DELETE" });
    finish!();
    await waitJob(runtime, "queue-1");
    const history = (await runtime.request("/ai/history")).requests;
    expect(
      history.filter((j: any) => j.status === "indeterminate"),
    ).toHaveLength(7);
  });

  it("marks interrupted persisted requests indeterminate without replaying them", async () => {
    const state: HostedState = emptyHostedState();
    const input = aiInput();
    state.jobs.push({
      requestId: input.requestId,
      input,
      payload: "captured",
      status: "running",
      model: "qwen3:4b",
      createdAt: new Date().toISOString(),
    });
    const factory = vi.fn(() => provider);
    const runtime = create({
      store: memoryStore(state),
      providerFactory: factory,
    });
    expect((await runtime.request("/ai/history")).requests[0]).toMatchObject({
      status: "indeterminate",
      input,
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("times out local inference without retrying it", async () => {
    const generate = vi.fn(
      async (_input: AiInput, signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        ),
    );
    const runtime = create({
      providerFactory: () => ({ ...provider, generate }),
      timeoutMs: 25,
    });
    await connect(runtime);
    await post(runtime, "/ai/edits", aiInput());
    expect((await waitJob(runtime)).status).toBe("indeterminate");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("holds the runner lock during recovery and leaves another live tab's inference untouched", async () => {
    const store = memoryStore();
    const locks = fakeLocks();
    let finish!: () => void;
    const generate = vi.fn(async (input: AiInput) => {
      await new Promise<void>((done) => {
        finish = done;
      });
      return provider.generate(input, new AbortController().signal);
    });
    const first = create({
      store,
      locks,
      providerFactory: () => ({ ...provider, generate }),
    });
    await connect(first);
    await post(first, "/ai/edits", aiInput());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const second = create({ store, locks, providerFactory: () => provider });
    await connect(second);
    expect((await second.request("/ai/edits/ai-first")).status).toBe("running");
    await expect(
      post(second, "/ai/edits", aiInput("another-tab")),
    ).rejects.toMatchObject({ status: 429 });
    expect(locks.query).not.toHaveBeenCalled();
    finish();
    expect((await waitJob(first)).status).toBe("completed");
  });

  it("does not enqueue a request disconnected while acquiring its runner lease", async () => {
    let allowLease!: () => void;
    let requests = 0;
    const real = fakeLocks();
    const locks = {
      request: async (
        name: string,
        options: unknown,
        callback: (lock: Lock | null) => unknown,
      ) => {
        requests++;
        if (requests === 2)
          await new Promise<void>((done) => {
            allowLease = done;
          });
        return (real.request as any)(name, options, callback);
      },
      query: real.query,
    } as unknown as LockManager;
    const generate = vi.fn(provider.generate);
    const runtime = create({
      locks,
      providerFactory: () => ({ ...provider, generate }),
    });
    await connect(runtime);
    const submitted = post(runtime, "/ai/edits", aiInput());
    const rejected = expect(submitted).rejects.toMatchObject({ status: 503 });
    await vi.waitFor(() => expect(allowLease).toBeTypeOf("function"));
    await runtime.request("/ai/connector", { method: "DELETE" });
    allowLease();
    await rejected;
    expect(generate).not.toHaveBeenCalled();
    expect((await runtime.request("/ai/history")).requests).toEqual([]);
  });

  it("does not reconnect after a slower connection probe is superseded by Disconnect", async () => {
    let finish!: () => void;
    const runtime = create({
      providerFactory: () => ({
        ...provider,
        available: async () => {
          await new Promise<void>((done) => {
            finish = done;
          });
          return { available: true };
        },
      }),
    });
    const connecting = connect(runtime);
    const rejected = expect(connecting).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await runtime.request("/ai/connector", { method: "DELETE" });
    finish();
    await rejected;
    expect((await runtime.request("/capabilities")).ai.available).toBe(false);
  });
});

describe("portable shared poster decoder", () => {
  it("round trips all starter canvases with compressed data and inert markup as text", async () => {
    for (const example of EXAMPLES)
      expect(
        (
          await decodePresentation(
            await encodePresentation(example.title, example.scene),
          )
        ).scene,
      ).toEqual(example.scene);
    const value: Scene = scene();
    const text = value.layers.find((l) => l.kind === "text")!;
    if (text.kind === "text") text.text = "<script>alert(1)</script>";
    const decoded = await decodePresentation(
      await encodePresentation("<img onerror=alert(1)>", value),
    );
    expect(decoded.title).toBe("<img onerror=alert(1)>");
    expect(decoded.scene.layers.find((l) => l.id === text.id)).toMatchObject({
      text: "<script>alert(1)</script>",
    });
  });
  it("rejects malformed links, invalid scenes, and compressed payloads that expand past the limit", async () => {
    await expect(decodePresentation("#bad-link")).rejects.toMatchObject({
      status: 400,
    });
    const invalid = Buffer.from(
      JSON.stringify({ title: "Invalid", scene: { schemaVersion: 99 } }),
    ).toString("base64url");
    await expect(
      decodePresentation(`v1.json.${invalid}`),
    ).rejects.toMatchObject({ status: 400 });
    const bomb = deflateSync("x".repeat(262145)).toString("base64url");
    await expect(decodePresentation(`v1.deflate.${bomb}`)).rejects.toThrow(
      /256 KB/,
    );
    await expect(
      decodePresentation(`v1.json.${"x".repeat(360001)}`),
    ).rejects.toMatchObject({ status: 400 });
  });
});
