import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { validateScene } from "../../../packages/core/src/index";
import { openDatabase, transaction } from "./db";
import {
  assertLocalConfiguration,
  buildModelMessages,
  createOllamaProvider,
  type AiInput,
  type LocalProvider,
} from "./provider";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const identifier = z.string().min(1).max(100);
const passwordSchema = z
  .object({ password: z.string().min(10).max(128) })
  .strict();
const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scene: z.unknown(),
    operationId: identifier,
  })
  .strict();
const revisionSchema = z
  .object({
    scene: z.unknown(),
    expectedHeadRevisionId: identifier,
    operationId: identifier,
    label: z.string().trim().max(120).optional(),
  })
  .strict();
const aiSchema = z
  .object({
    requestId: identifier,
    scene: z.unknown(),
    selectedLayerIds: z.array(identifier).max(64),
    instruction: z.string().trim().min(1).max(2000),
    allowTextChanges: z.boolean(),
    baseRevisionId: identifier,
    requestGeneration: z.number().int().nonnegative(),
    mutationEpoch: z.number().int().nonnegative(),
  })
  .strict();
type Row = Record<string, any>;
class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
export interface ServerOptions {
  dataDir?: string;
  staticDir?: string;
  ollamaUrl?: string;
  model?: string;
  provider?: LocalProvider;
  maxQueue?: number;
  jobTimeoutMs?: number;
}

export async function buildServer(options: ServerOptions = {}) {
  const model =
    options.model ??
    process.env.LP_MODEL ??
    process.env.OLLAMA_MODEL ??
    "qwen3:4b";
  const ollamaUrl =
    options.ollamaUrl ??
    process.env.LP_OLLAMA_URL ??
    process.env.OLLAMA_URL ??
    "http://127.0.0.1:11434";
  assertLocalConfiguration(ollamaUrl, model);
  const provider = options.provider ?? createOllamaProvider(ollamaUrl, model);
  const db = openDatabase(options.dataDir ?? process.env.LP_DATA_DIR ?? "data");
  const app = Fastify({
    logger: false,
    bodyLimit: 256 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  const get = (sql: string, ...params: any[]) =>
    db.prepare(sql).get(...params) as Row | undefined;
  const all = (sql: string, ...params: any[]) =>
    db.prepare(sql).all(...params) as Row[];
  const run = (sql: string, ...params: any[]) => db.prepare(sql).run(...params);
  let closing = false;
  let active = false;
  let activeController: AbortController | undefined;
  let activePromise: Promise<void> | undefined;
  const queue: { ownerId: string; input: AiInput }[] = [];
  const attempts = new Map<string, { count: number; reset: number }>();
  const sessionOwner = (req: FastifyRequest) => {
    const token = req.cookies.lp_session;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return get(
      "SELECT owner_id FROM sessions WHERE hash=? AND expires_at>?",
      hash(token),
      Date.now(),
    )?.owner_id as string | undefined;
  };
  const owner = (req: FastifyRequest) => {
    const found = sessionOwner(req);
    if (!found)
      throw new ApiError(
        401,
        "Sign in to use saved projects and local AI.",
        "UNAUTHENTICATED",
      );
    return found;
  };
  const ownProject = (ownerId: string, id: string) => {
    const p = get(
      "SELECT * FROM projects WHERE id=? AND owner_id=?",
      id,
      ownerId,
    );
    if (!p) throw new ApiError(404, "Project not found.", "NOT_FOUND");
    return p;
  };
  const projectDto = (p: Row) => ({
    id: p.id,
    name: p.name,
    headRevisionId: p.head_revision_id,
    updatedAt: p.updated_at,
  });
  const dedupe = (
    ownerId: string,
    operationId: string,
    payload: unknown,
    fn: () => unknown,
  ) =>
    transaction(db, () => {
      const digest = hash(canonical(payload));
      const prior = get(
        "SELECT * FROM operations WHERE owner_id=? AND operation_id=?",
        ownerId,
        operationId,
      );
      if (prior) {
        if (prior.payload_hash !== digest)
          throw new ApiError(
            409,
            "This operation ID already belongs to different content.",
            "IDEMPOTENCY_COLLISION",
          );
        return JSON.parse(prior.response);
      }
      const response = fn();
      run(
        "INSERT INTO operations VALUES(?,?,?,?)",
        ownerId,
        operationId,
        digest,
        JSON.stringify(response),
      );
      return response;
    });
  const aiDto = (r: Row) => {
    const input = JSON.parse(r.input);
    return {
      requestId: r.request_id,
      status: r.status,
      input,
      ...Object.fromEntries(
        [
          "baseRevisionId",
          "requestGeneration",
          "mutationEpoch",
          "selectedLayerIds",
        ].map((k) => [k, input[k]]),
      ),
      ...(r.result ? { result: JSON.parse(r.result) } : {}),
      ...(r.error ? { error: r.error } : {}),
      model: r.model,
      createdAt: r.created_at,
      latencyMs: r.latency_ms,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cost: 0,
      disposition: r.disposition,
      appliedRevisionId: r.applied_revision_id,
    };
  };
  const drain = () => {
    if (active || closing || !queue.length) return;
    active = true;
    const job = queue.shift()!;
    activeController = new AbortController();
    const controller = activeController;
    const timeout = setTimeout(
      () => controller.abort(),
      options.jobTimeoutMs ?? 120000,
    );
    const start = Date.now();
    run(
      "UPDATE ai_requests SET status='running' WHERE owner_id=? AND request_id=?",
      job.ownerId,
      job.input.requestId,
    );
    activePromise = (async () => {
      try {
        const { result, inputTokens, outputTokens } = await provider.generate(
          job.input,
          controller.signal,
        );
        // Provider adapters are also untrusted at the route boundary.
        if (result.kind === "edit") {
          const { applyOperations } = await import(
            "../../../packages/core/src/index"
          );
          validateScene(
            applyOperations(job.input.scene, result.operations, {
              allowTextChanges: job.input.allowTextChanges,
            }).scene,
          );
        } else if (result.kind !== "clarify" && result.kind !== "unsupported")
          throw new Error("Unsupported model response.");
        run(
          "UPDATE ai_requests SET status='completed',result=?,latency_ms=?,input_tokens=?,output_tokens=? WHERE owner_id=? AND request_id=?",
          JSON.stringify(result),
          Date.now() - start,
          inputTokens ?? null,
          outputTokens ?? null,
          job.ownerId,
          job.input.requestId,
        );
      } catch (error) {
        const indeterminate = controller.signal.aborted;
        const message = indeterminate
          ? "The model request was interrupted or timed out. No edit was applied."
          : error instanceof Error
            ? error.message.slice(0, 400)
            : "Local model request failed.";
        run(
          "UPDATE ai_requests SET status=?,error=?,latency_ms=? WHERE owner_id=? AND request_id=?",
          indeterminate ? "indeterminate" : "failed",
          message,
          Date.now() - start,
          job.ownerId,
          job.input.requestId,
        );
      } finally {
        clearTimeout(timeout);
        active = false;
        activeController = undefined;
        if (!closing) drain();
      }
    })();
  };
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY");
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    const host = req.headers.host ?? "";
    if (!host || /[\s/@\\]/.test(host))
      throw new ApiError(400, "Invalid host.", "INVALID_HOST");
    // With the default loopback listener, reject DNS rebinding hostnames too.
    const hostName = host.startsWith("[")
      ? host.slice(0, host.indexOf("]") + 1)
      : host.split(":")[0];
    const configuredHost = process.env.LP_PUBLIC_HOST;
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(hostName) &&
      hostName !== configuredHost
    )
      throw new ApiError(
        403,
        "This host is not configured for Living Poster.",
        "INVALID_HOST",
      );
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new ApiError(
          403,
          "Cross-site requests are not allowed.",
          "ORIGIN_REJECTED",
        );
      if (
        req.headers.origin &&
        req.headers.origin !== `${req.protocol}://${host}`
      )
        throw new ApiError(
          403,
          "Use the app from the same origin.",
          "ORIGIN_REJECTED",
        );
      if (
        req.method !== "DELETE" &&
        !req.headers["content-type"]
          ?.toLowerCase()
          .startsWith("application/json")
      )
        throw new ApiError(415, "Send application/json.", "JSON_REQUIRED");
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")
          .slice(0, 600),
        code: "INVALID_DATA",
      });
    if (error instanceof ApiError)
      return reply
        .code(error.statusCode)
        .send({ error: error.message, code: error.code });
    const e = error as Error & { statusCode?: number };
    if (e.statusCode && e.statusCode < 500)
      return reply
        .code(e.statusCode)
        .send({ error: e.message, code: "INVALID_REQUEST" });
    // Domain validation is reported without internals or SQL details.
    if (
      /scene|layer|behavior|revision|font|anchor|pointer|text|invalid|limit|unsupported/i.test(
        e.message ?? "",
      ) &&
      !/sqlite|sql|constraint/i.test(e.message)
    )
      return reply
        .code(400)
        .send({ error: e.message.slice(0, 600), code: "INVALID_DATA" });
    return reply.code(500).send({
      error: "The local server could not complete this request.",
      code: "INTERNAL_ERROR",
    });
  });
  app.get("/api/capabilities", async (req) => ({
    free: true,
    authenticated: !!sessionOwner(req),
    needsSetup: !get("SELECT id FROM owners LIMIT 1"),
    ai: { ...(await provider.available()), model },
    storage: "sqlite",
  }));
  const setSession = (ownerId: string, reply: any) => {
    const token = randomBytes(32).toString("hex");
    const age = 7 * 24 * 60 * 60;
    run("DELETE FROM sessions WHERE expires_at<?", Date.now());
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      ownerId,
      Date.now() + age * 1000,
    );
    reply.setCookie("lp_session", token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: age,
      secure: reply.request.protocol === "https",
    });
  };
  const limitLogin = (req: FastifyRequest) => {
    const now = Date.now();
    const key = req.ip;
    const previous = attempts.get(key);
    const state =
      previous && previous.reset > now
        ? previous
        : { count: 0, reset: now + 15 * 60 * 1000 };
    if (++state.count > 20)
      throw new ApiError(
        429,
        "Too many login attempts. Try again in 15 minutes.",
        "RATE_LIMITED",
      );
    attempts.set(key, state);
  };
  app.post("/api/auth/setup", async (req, reply) => {
    const { password } = passwordSchema.parse(req.body);
    limitLogin(req);
    if (
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip) ||
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
        req.headers.host ?? "",
      )
    )
      throw new ApiError(
        403,
        "Initial setup must be performed on this computer.",
        "LOCAL_SETUP_ONLY",
      );
    const ownerId = transaction(db, () => {
      if (get("SELECT id FROM owners LIMIT 1"))
        throw new ApiError(
          409,
          "This installation already has an owner. Sign in instead.",
          "ALREADY_CONFIGURED",
        );
      const salt = randomBytes(16).toString("hex");
      const id = randomUUID();
      run(
        "INSERT INTO owners VALUES(?,?,?)",
        id,
        scryptSync(password, salt, 64).toString("hex"),
        salt,
      );
      return id;
    });
    setSession(ownerId, reply);
    return { ok: true };
  });
  app.post("/api/auth/login", async (req, reply) => {
    const { password } = passwordSchema.parse(req.body);
    limitLogin(req);
    const stored = get("SELECT * FROM owners LIMIT 1");
    const candidate = scryptSync(
      password,
      stored?.salt ?? "unconfigured-local-installation",
      64,
    );
    if (
      !stored ||
      !timingSafeEqual(candidate, Buffer.from(stored.password_hash, "hex"))
    )
      throw new ApiError(401, "Incorrect password.", "INVALID_CREDENTIALS");
    setSession(stored.id, reply);
    attempts.delete(req.ip);
    return { ok: true };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies.lp_session)
      run("DELETE FROM sessions WHERE hash=?", hash(req.cookies.lp_session));
    reply.clearCookie("lp_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/projects", async (req) => ({
    projects: all(
      "SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC",
      owner(req),
    ).map(projectDto),
  }));
  app.post("/api/projects", async (req) => {
    const ownerId = owner(req);
    const body = createProjectSchema.parse(req.body);
    const scene = validateScene(body.scene);
    return dedupe(
      ownerId,
      body.operationId,
      { route: "create", ...body },
      () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        run(
          "INSERT INTO projects VALUES(?,?,?,?,?)",
          id,
          ownerId,
          body.name,
          scene.revision.id,
          now,
        );
        run(
          "INSERT INTO revisions VALUES(?,?,?,?,?,?)",
          scene.revision.id,
          id,
          null,
          "Initial version",
          now,
          JSON.stringify(scene),
        );
        return {
          project: {
            id,
            name: body.name,
            headRevisionId: scene.revision.id,
            updatedAt: now,
          },
          scene,
        };
      },
    );
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const p = ownProject(owner(req), req.params.id);
    return {
      project: projectDto(p),
      scene: JSON.parse(
        get(
          "SELECT scene FROM revisions WHERE project_id=? AND id=?",
          p.id,
          p.head_revision_id,
        )!.scene,
      ),
    };
  });
  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const ownerId = owner(req);
    const p = ownProject(ownerId, req.params.id);
    const { name } = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .parse(req.body);
    run(
      "UPDATE projects SET name=?,updated_at=? WHERE id=? AND owner_id=?",
      name,
      new Date().toISOString(),
      p.id,
      ownerId,
    );
    return { project: projectDto(ownProject(ownerId, p.id)) };
  });
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/revisions",
    async (req) => {
      const ownerId = owner(req);
      ownProject(ownerId, req.params.id);
      const body = revisionSchema.parse(req.body);
      const scene = validateScene(body.scene);
      return dedupe(
        ownerId,
        body.operationId,
        { route: "revision", projectId: req.params.id, ...body },
        () => {
          const p = ownProject(ownerId, req.params.id);
          if (p.head_revision_id !== body.expectedHeadRevisionId)
            throw new ApiError(
              409,
              "The saved project changed in another tab. Save your draft as a new project to preserve both versions.",
              "STALE_HEAD",
            );
          if (
            scene.revision.id === p.head_revision_id ||
            get(
              "SELECT id FROM revisions WHERE project_id=? AND id=?",
              p.id,
              scene.revision.id,
            )
          )
            throw new ApiError(
              409,
              "Revision snapshots are immutable. Create a fresh revision.",
              "REVISION_EXISTS",
            );
          const now = new Date().toISOString();
          run(
            "INSERT INTO revisions VALUES(?,?,?,?,?,?)",
            scene.revision.id,
            p.id,
            p.head_revision_id,
            body.label ?? "Edit",
            now,
            JSON.stringify(scene),
          );
          run(
            "UPDATE projects SET head_revision_id=?,updated_at=? WHERE id=? AND head_revision_id=?",
            scene.revision.id,
            now,
            p.id,
            body.expectedHeadRevisionId,
          );
          return {
            revisionId: scene.revision.id,
            headRevisionId: scene.revision.id,
          };
        },
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/revisions",
    async (req) => {
      const p = ownProject(owner(req), req.params.id);
      return {
        revisions: all(
          "SELECT * FROM revisions WHERE project_id=? ORDER BY created_at DESC,rowid DESC",
          p.id,
        ).map((r) => ({
          id: r.id,
          parentId: r.parent_id,
          label: r.label,
          createdAt: r.created_at,
          scene: JSON.parse(r.scene),
        })),
      };
    },
  );
  app.post("/api/shares", async (req) => {
    const ownerId = owner(req);
    const body = z
      .object({ projectId: identifier, revisionId: identifier })
      .strict()
      .parse(req.body);
    const p = ownProject(ownerId, body.projectId);
    const revision = get(
      "SELECT scene FROM revisions WHERE project_id=? AND id=?",
      p.id,
      body.revisionId,
    );
    if (!revision) throw new ApiError(404, "Revision not found.", "NOT_FOUND");
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    run(
      "INSERT INTO shares VALUES(?,?,?,?,?,?,?,?,0)",
      id,
      ownerId,
      p.id,
      hash(token),
      token,
      p.name,
      revision.scene,
      new Date().toISOString(),
    );
    return { id, token, url: `/p/${token}` };
  });
  app.get("/api/shares", async (req) => ({
    shares: all(
      "SELECT * FROM shares WHERE owner_id=? ORDER BY created_at DESC",
      owner(req),
    ).map((s) => ({
      id: s.id,
      projectName: s.title,
      createdAt: s.created_at,
      revoked: !!s.revoked,
      url: `/p/${s.token}`,
    })),
  }));
  app.delete<{ Params: { id: string } }>("/api/shares/:id", async (req) => {
    const ownerId = owner(req);
    if (
      !get(
        "SELECT id FROM shares WHERE owner_id=? AND id=?",
        ownerId,
        req.params.id,
      )
    )
      throw new ApiError(404, "Share not found.", "NOT_FOUND");
    run(
      "UPDATE shares SET revoked=1 WHERE owner_id=? AND id=?",
      ownerId,
      req.params.id,
    );
    return { ok: true };
  });
  app.get<{ Params: { token: string } }>(
    "/api/presentations/:token",
    async (req) => {
      const s = get(
        "SELECT title,scene FROM shares WHERE token_hash=? AND revoked=0",
        hash(req.params.token),
      );
      if (!s)
        throw new ApiError(
          404,
          "This presentation does not exist or its link was revoked.",
          "NOT_FOUND",
        );
      return { title: s.title, scene: JSON.parse(s.scene) };
    },
  );
  app.post("/api/ai/edits", async (req, reply) => {
    const ownerId = owner(req);
    const parsed = aiSchema.parse(req.body);
    const scene = validateScene(parsed.scene);
    const input: AiInput = { ...parsed, scene };
    if (
      input.baseRevisionId !== scene.revision.id ||
      new Set(input.selectedLayerIds).size !== input.selectedLayerIds.length ||
      input.selectedLayerIds.some(
        (id) => !scene.layers.some((l) => l.id === id),
      )
    )
      throw new ApiError(
        400,
        "Request metadata must match the submitted scene.",
        "INVALID_METADATA",
      );
    const payloadHash = hash(canonical(input));
    const prior = get(
      "SELECT * FROM ai_requests WHERE owner_id=? AND request_id=?",
      ownerId,
      input.requestId,
    );
    if (prior) {
      if (prior.payload_hash !== payloadHash)
        throw new ApiError(
          409,
          "This request ID already belongs to a different instruction or scene.",
          "IDEMPOTENCY_COLLISION",
        );
      return { requestId: input.requestId, status: prior.status };
    }
    buildModelMessages(input);
    if (queue.length + (active ? 1 : 0) >= (options.maxQueue ?? 8))
      throw new ApiError(
        429,
        "The local model queue is full. Try again after a request finishes.",
        "QUEUE_FULL",
      );
    const availability = await provider.available();
    if (!availability.available)
      throw new ApiError(
        503,
        availability.reason ?? "Local model unavailable.",
        "MODEL_UNAVAILABLE",
      );
    // Availability is asynchronous: recheck before the atomic insert.
    const raced = get(
      "SELECT * FROM ai_requests WHERE owner_id=? AND request_id=?",
      ownerId,
      input.requestId,
    );
    if (raced) {
      if (raced.payload_hash !== payloadHash)
        throw new ApiError(
          409,
          "This request ID has different content.",
          "IDEMPOTENCY_COLLISION",
        );
      return { requestId: input.requestId, status: raced.status };
    }
    if (queue.length + (active ? 1 : 0) >= (options.maxQueue ?? 8))
      throw new ApiError(429, "The local model queue is full.", "QUEUE_FULL");
    run(
      "INSERT INTO ai_requests(owner_id,request_id,payload_hash,input,status,model,created_at) VALUES(?,?,?,?,'queued',?,?)",
      ownerId,
      input.requestId,
      payloadHash,
      JSON.stringify(input),
      model,
      new Date().toISOString(),
    );
    queue.push({ ownerId, input });
    setImmediate(drain);
    reply.code(202);
    return { requestId: input.requestId, status: "queued" };
  });
  app.get<{ Params: { id: string } }>("/api/ai/edits/:id", async (req) => {
    const row = get(
      "SELECT * FROM ai_requests WHERE owner_id=? AND request_id=?",
      owner(req),
      req.params.id,
    );
    if (!row) throw new ApiError(404, "AI request not found.", "NOT_FOUND");
    return aiDto(row);
  });
  app.get("/api/ai/history", async (req) => ({
    requests: all(
      "SELECT * FROM ai_requests WHERE owner_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
      owner(req),
    ).map(aiDto),
  }));
  app.post<{ Params: { id: string } }>(
    "/api/ai/edits/:id/disposition",
    async (req) => {
      const ownerId = owner(req);
      const body = z
        .object({
          status: z.enum(["applied", "superseded"]),
          appliedRevisionId: identifier.optional(),
        })
        .strict()
        .parse(req.body);
      const row = get(
        "SELECT * FROM ai_requests WHERE owner_id=? AND request_id=?",
        ownerId,
        req.params.id,
      );
      if (!row) throw new ApiError(404, "AI request not found.", "NOT_FOUND");
      if (
        body.status === "applied" &&
        (row.status !== "completed" ||
          JSON.parse(row.result ?? "{}").kind !== "edit" ||
          !body.appliedRevisionId)
      )
        throw new ApiError(
          400,
          "Only a completed edit can be linked to an applied revision.",
          "INVALID_DISPOSITION",
        );
      run(
        "UPDATE ai_requests SET disposition=?,applied_revision_id=? WHERE owner_id=? AND request_id=?",
        body.status,
        body.appliedRevisionId ?? null,
        ownerId,
        req.params.id,
      );
      return { ok: true };
    },
  );
  const staticDir = resolve(options.staticDir ?? "dist/web");
  if (existsSync(staticDir)) {
    await app.register(staticPlugin, {
      root: staticDir,
      index: ["index.html"],
      list: false,
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Route not found." })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", async () => {
    closing = true;
    activeController?.abort();
    await activePromise;
    db.close();
  });
  return app;
}
