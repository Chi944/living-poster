import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { buildServer } from "../apps/api/src/server";
import {
  assertLocalConfiguration,
  buildModelMessages,
  createOllamaProvider,
  interpretReply,
  modelReplySchema,
  type AiInput,
  type LocalProvider,
} from "../apps/api/src/provider";
import {
  EXAMPLES,
  validateScene,
  reviseScene,
} from "../packages/core/src/index";

function fixture() {
  return validateScene({
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    id: "scene-test",
    revision: { id: "rev-1", parentId: null },
    seed: 12,
    artboard: { width: 1080, height: 1350, background: "#ffffff" },
    timeline: { durationMs: 6000, fps: 30, loop: true },
    fonts: [{ id: "space-bold", assetHash: "bundled-v1" }],
    pointer: { mode: "disabled" },
    layers: [
      {
        id: "headline",
        kind: "text",
        name: "Headline",
        text: "TEST",
        fontId: "space-bold",
        fontSize: 100,
        lineHeight: 1,
        trackingEm: 0,
        align: "left",
        fill: "#000000",
        visible: true,
        locked: false,
        opacity: 1,
        layout: { x: 100, y: 200, rotationDeg: 0 },
        behaviors: [],
      },
      {
        id: "caption",
        kind: "text",
        name: "Caption",
        text: "Keep these words",
        fontId: "space-bold",
        fontSize: 20,
        lineHeight: 1,
        trackingEm: 0,
        align: "left",
        fill: "#000000",
        visible: true,
        locked: false,
        opacity: 1,
        layout: { x: 100, y: 400, rotationDeg: 0 },
        behaviors: [],
      },
    ],
  });
}
const input = (requestId = "request-1"): AiInput => ({
  requestId,
  scene: fixture(),
  selectedLayerIds: ["headline"],
  instruction: "Make the headline red",
  allowTextChanges: false,
  baseRevisionId: "rev-1",
  requestGeneration: 2,
  mutationEpoch: 5,
});
const fakeProvider: LocalProvider = {
  available: async () => ({ available: true }),
  generate: async () => ({
    result: {
      kind: "edit",
      operations: [{ type: "setFill", layerId: "headline", colour: "#ff0000" }],
      summary: "Updated Headline",
    },
    inputTokens: 20,
    outputTokens: 10,
  }),
};
let directory: string;
let app: Awaited<ReturnType<typeof buildServer>>;
let session: string;
const jsonHeaders = () => ({
  "content-type": "application/json",
  cookie: session,
});
const post = (url: string, payload: unknown) =>
  app.inject({
    method: "POST",
    url,
    headers: jsonHeaders(),
    payload: JSON.stringify(payload),
  });
async function setup(
  provider = fakeProvider,
  extra: Record<string, unknown> = {},
) {
  app = await buildServer({ dataDir: directory, provider, ...extra });
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: { password: "a secure local password" },
  });
  expect(response.statusCode).toBe(200);
  session = response.headers["set-cookie"]!.toString().split(";")[0];
}
async function project() {
  const response = await post("/api/projects", {
    name: "Poster",
    scene: fixture(),
    operationId: "create-1",
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}
async function completed(id = "request-1") {
  for (let i = 0; i < 100; i++) {
    const res = await app.inject({
      url: `/api/ai/edits/${id}`,
      headers: { cookie: session },
    });
    if (!["queued", "running"].includes(res.json().status)) return res.json();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Test job did not finish");
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "living-poster-api-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (app) await app.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("local authentication and boundary protection", () => {
  it("bootstraps exactly one owner, stores no plaintext credentials, expires sessions on logout", async () => {
    await setup();
    const capabilities = (
      await app.inject({
        url: "/api/capabilities",
        headers: { cookie: session },
      })
    ).json();
    expect(capabilities).toMatchObject({
      free: true,
      authenticated: true,
      needsSetup: false,
      storage: "sqlite",
    });
    expect(
      (await post("/api/auth/setup", { password: "a different long password" }))
        .statusCode,
    ).toBe(409);
    expect((await app.inject({ url: "/api/projects" })).statusCode).toBe(401);
    const db = new DatabaseSync(join(directory, "living-poster.sqlite"));
    expect(db.prepare("SELECT * FROM owners").get()).not.toHaveProperty(
      "password",
    );
    expect(db.prepare("SELECT hash FROM sessions").get()?.hash).not.toBe(
      session.split("=")[1],
    );
    db.close();
    expect((await post("/api/auth/logout", {})).statusCode).toBe(200);
    expect(
      (await app.inject({ url: "/api/projects", headers: { cookie: session } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await post("/api/auth/login", { password: "a wrong local password" }))
        .statusCode,
    ).toBe(401);
    expect(
      (await post("/api/auth/login", { password: "a secure local password" }))
        .statusCode,
    ).toBe(200);
  });
  it("rejects foreign origins, DNS rebinding, non-JSON mutations and remote bootstrap", async () => {
    app = await buildServer({ dataDir: directory, provider: fakeProvider });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/setup",
          remoteAddress: "192.0.2.2",
          payload: { password: "a secure local password" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/setup",
          headers: { origin: "https://evil.example" },
          payload: { password: "a secure local password" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/capabilities",
          headers: { host: "evil.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/setup",
          headers: { "content-type": "text/plain" },
          payload: "{}",
        })
      ).statusCode,
    ).toBe(415);
  });
});

describe("transactional revisions and pinned shares", () => {
  it("deduplicates creates and saves, refuses ID collisions and stale heads", async () => {
    await setup();
    const created = await project();
    expect(
      (
        await post("/api/projects", {
          name: "Poster",
          scene: fixture(),
          operationId: "create-1",
        })
      ).json(),
    ).toEqual(created);
    expect(
      (
        await post("/api/projects", {
          name: "Different",
          scene: fixture(),
          operationId: "create-1",
        })
      ).statusCode,
    ).toBe(409);
    const next = reviseScene(fixture());
    next.layers[0].fill = "#ff0000";
    const body = {
      scene: next,
      operationId: "save-1",
      expectedHeadRevisionId: "rev-1",
      label: "Red",
    };
    const path = `/api/projects/${created.project.id}/revisions`;
    const saved = await post(path, body);
    expect(saved.statusCode).toBe(200);
    expect((await post(path, body)).json()).toEqual(saved.json());
    expect(
      (
        await post(path, {
          ...body,
          operationId: "save-stale",
          scene: reviseScene(fixture()),
        })
      ).statusCode,
    ).toBe(409);
    expect((await post(path, { ...body, label: "Changed" })).statusCode).toBe(
      409,
    );
    const revisions = (
      await app.inject({ url: path, headers: { cookie: session } })
    ).json().revisions;
    expect(revisions).toHaveLength(2);
    expect(
      revisions.find((r: any) => r.id === "rev-1").scene.layers[0].fill,
    ).toBe("#000000");
  });
  it("has one winner for simultaneous CAS updates and keeps rejected content out of history", async () => {
    await setup();
    const created = await project();
    const path = `/api/projects/${created.project.id}/revisions`;
    const responses = await Promise.all(
      ["a", "b"].map((id) =>
        post(path, {
          scene: reviseScene(fixture()),
          operationId: id,
          expectedHeadRevisionId: "rev-1",
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      (await app.inject({ url: path, headers: { cookie: session } })).json()
        .revisions,
    ).toHaveLength(2);
  });
  it("pins snapshot-only public presentations and revokes links", async () => {
    await setup();
    const created = await project();
    const share = await post("/api/shares", {
      projectId: created.project.id,
      revisionId: "rev-1",
    });
    expect(share.statusCode).toBe(200);
    const { id, token } = share.json();
    const next = reviseScene(fixture());
    next.layers[0].fill = "#ff0000";
    await post(`/api/projects/${created.project.id}/revisions`, {
      scene: next,
      operationId: "save-1",
      expectedHeadRevisionId: "rev-1",
    });
    const publicScene = (
      await app.inject({ url: `/api/presentations/${token}` })
    ).json();
    expect(Object.keys(publicScene).sort()).toEqual(["scene", "title"]);
    expect(publicScene.scene).toEqual(fixture());
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/shares/${id}`,
          headers: { cookie: session },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: `/api/presentations/${token}` })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({ url: "/api/shares", headers: { cookie: session } })
      ).json().shares[0].revoked,
    ).toBe(true);
  });
  it("isolates project, revision, share and instruction routes from a second database identity", async () => {
    await setup();
    const created = await project();
    const share = (
      await post("/api/shares", {
        projectId: created.project.id,
        revisionId: "rev-1",
      })
    ).json();
    await post("/api/ai/edits", input());
    await completed();
    // Public signup is closed. A direct fixture identity tests the underlying owner boundary.
    const db = new DatabaseSync(join(directory, "living-poster.sqlite"));
    const token = "b".repeat(64);
    db.prepare("INSERT INTO owners VALUES(?,?,?)").run(
      "owner-two",
      "unused-fixture-hash",
      "fixture-salt",
    );
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      createHash("sha256").update(token).digest("hex"),
      "owner-two",
      Date.now() + 100000,
    );
    db.close();
    session = `lp_session=${token}`;
    expect(
      (
        await app.inject({ url: "/api/projects", headers: { cookie: session } })
      ).json(),
    ).toEqual({ projects: [] });
    for (const path of [
      `/api/projects/${created.project.id}`,
      `/api/projects/${created.project.id}/revisions`,
      "/api/ai/edits/request-1",
    ])
      expect(
        (await app.inject({ url: path, headers: { cookie: session } }))
          .statusCode,
      ).toBe(404);
    expect(
      (
        await post(`/api/projects/${created.project.id}/revisions`, {
          scene: reviseScene(fixture()),
          operationId: "other",
          expectedHeadRevisionId: "rev-1",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post("/api/shares", {
          projectId: created.project.id,
          revisionId: "rev-1",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/shares/${share.id}`,
          headers: { cookie: session },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: "/api/ai/history",
          headers: { cookie: session },
        })
      ).json(),
    ).toEqual({ requests: [] });
  });
  it("rejects unknown scene keys and broken anchors without any stored project", async () => {
    await setup();
    expect(
      (
        await post("/api/projects", {
          name: "Bad",
          scene: { ...fixture(), secret: "not part of a scene" },
          operationId: "bad",
        })
      ).statusCode,
    ).toBe(400);
    const scene = fixture();
    scene.layers[0].behaviors = [
      {
        id: "b",
        enabled: true,
        type: "attract",
        scope: "layer",
        startMs: 0,
        endMs: 6000,
        params: {
          anchor: { type: "layer", layerId: "missing" },
          strength: 0.5,
          maxDistance: 100,
        },
      },
    ];
    expect(
      (await post("/api/projects", { name: "Bad", scene, operationId: "bad2" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({ url: "/api/projects", headers: { cookie: session } })
      ).json().projects,
    ).toHaveLength(0);
  });
});

describe("durable bounded local AI jobs", () => {
  it("calls the provider once for duplicate IDs, preserves stale metadata, and records disposition", async () => {
    const generate = vi.fn(fakeProvider.generate);
    await setup({ ...fakeProvider, generate });
    const payload = input();
    expect((await post("/api/ai/edits", payload)).statusCode).toBe(202);
    expect((await post("/api/ai/edits", payload)).statusCode).toBe(200);
    expect(
      (await post("/api/ai/edits", { ...payload, instruction: "Different" }))
        .statusCode,
    ).toBe(409);
    const done = await completed();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(done).toMatchObject({
      status: "completed",
      baseRevisionId: "rev-1",
      mutationEpoch: 5,
      requestGeneration: 2,
      cost: 0,
      input: payload,
    });
    expect(
      (
        await post("/api/ai/edits/request-1/disposition", {
          status: "superseded",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: "/api/ai/history",
          headers: { cookie: session },
        })
      ).json().requests[0].disposition,
    ).toBe("superseded");
    expect(fixture().layers[0].fill).toBe("#000000");
  });
  it("rejects invalid generated edits atomically and never retries", async () => {
    const generate = vi.fn(async () => ({
      result: {
        kind: "edit" as const,
        operations: [
          { type: "setFill" as const, layerId: "headline", colour: "#ff0000" },
          {
            type: "setText" as const,
            layerId: "caption",
            expectedOldText: "Keep these words",
            newText: "Oops",
          },
        ],
        summary: "Unsafe",
      },
    }));
    await setup({ ...fakeProvider, generate });
    await post("/api/ai/edits", input());
    const result = await completed();
    expect(result.status).toBe("failed");
    expect(result.result).toBeUndefined();
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("enforces queue bounds and aborts timed-out requests without automatic retry", async () => {
    const generate = vi.fn(
      (_input: AiInput, signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          }),
        ),
    );
    await setup(
      { ...fakeProvider, generate },
      { maxQueue: 1, jobTimeoutMs: 40 },
    );
    await post("/api/ai/edits", input());
    expect((await post("/api/ai/edits", input("request-2"))).statusCode).toBe(
      429,
    );
    expect((await completed()).status).toBe("indeterminate");
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("persists history over restart and marks interrupted ledger entries indeterminate", async () => {
    await setup();
    await post("/api/ai/edits", input());
    await completed();
    await app.close();
    const db = new DatabaseSync(join(directory, "living-poster.sqlite"));
    db.prepare("UPDATE ai_requests SET status='running',result=NULL").run();
    db.close();
    app = await buildServer({ dataDir: directory, provider: fakeProvider });
    const loaded = (
      await app.inject({
        url: "/api/ai/edits/request-1",
        headers: { cookie: session },
      })
    ).json();
    expect(loaded.status).toBe("indeterminate");
    expect(loaded.input).toEqual(input());
    expect((await post("/api/ai/edits", input())).json().status).toBe(
      "indeterminate",
    );
  });
  it("rejects metadata mismatches and unavailable models before recording any job", async () => {
    await setup({
      ...fakeProvider,
      available: async () => ({ available: false, reason: "Ollama stopped" }),
    });
    expect(
      (await post("/api/ai/edits", { ...input(), baseRevisionId: "wrong" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await post("/api/ai/edits", {
          ...input(),
          selectedLayerIds: ["missing"],
        })
      ).statusCode,
    ).toBe(400);
    expect((await post("/api/ai/edits", input())).statusCode).toBe(503);
    expect(
      (
        await app.inject({
          url: "/api/ai/history",
          headers: { cookie: session },
        })
      ).json().requests,
    ).toHaveLength(0);
  });
});

describe("local-model-only provider and structured output", () => {
  it("builds all six generic motions at the target layer, including a bounded orbit far from artboard center", () => {
    for (const motion of [
      "float",
      "orbit",
      "wave",
      "scatter",
      "attract",
      "repel",
    ]) {
      const result = interpretReply(
        {
          kind: "edit",
          actions: [{ action: "animate", layerId: "headline", motion }],
        },
        input(),
      );
      expect(result.kind).toBe("edit");
      if (result.kind !== "edit") throw new Error("Missing edit");
      const operation = result.operations[0];
      expect(operation.type).toBe("upsertBehavior");
      if (
        operation.type === "upsertBehavior" &&
        operation.behavior.type === "orbit"
      )
        expect(operation.behavior.params.anchor).toEqual({
          type: "point",
          x: 20,
          y: 200,
        });
    }
  });
  it("validates exact scalar actions, accumulates motion tuning, and excludes forbidden wording and target IDs", () => {
    const result = interpretReply(
      {
        plan: "Make only the requested changes.",
        kind: "edit",
        actions: [
          { action: "animate", layerId: "headline", motion: "float" },
          {
            action: "motionParameter",
            layerId: "headline",
            motion: "float",
            parameter: "amplitudeY",
            value: 37,
          },
          { action: "move", layerId: "caption", axis: "y", delta: 17 },
          { action: "fontSize", layerId: "caption", value: 29 },
        ],
      },
      input(),
    );
    expect(result.kind).toBe("edit");
    if (result.kind !== "edit") throw new Error("Missing edit");
    expect(result.operations[1]).toMatchObject({
      behavior: { params: { amplitudeX: 16, amplitudeY: 37 } },
    });
    expect(result.operations[2]).toEqual({
      type: "setLayout",
      layerId: "caption",
      changes: { y: 417 },
    });
    expect(result.operations[3]).toEqual({
      type: "setTypography",
      layerId: "caption",
      changes: { fontSize: 29 },
    });
    expect(() =>
      modelReplySchema(input()).parse({
        kind: "edit",
        actions: [{ action: "rewrite", layerId: "headline", text: "No" }],
      }),
    ).toThrow();
    expect(() =>
      interpretReply(
        {
          kind: "edit",
          actions: [
            { action: "colour", layerId: "invented", value: "#112233" },
          ],
        },
        input(),
      ),
    ).toThrow();
    expect(() =>
      interpretReply(
        {
          kind: "edit",
          actions: [
            {
              action: "animate",
              layerId: "headline",
              motion: "float",
              radius: 100,
            },
          ],
        },
        input(),
      ),
    ).toThrow();
  });
  it("keeps complete layers while excluding private metadata and pointer paths, and bounds the input without truncating", () => {
    const payload = input();
    const messages = buildModelMessages(payload);
    const content = JSON.parse(messages[1].content);
    expect(content.scene.layers).toEqual(payload.scene.layers);
    expect(Object.keys(content.scene).sort()).toEqual([
      "artboard",
      "layers",
      "timeline",
    ]);
    const huge = input();
    huge.scene.layers = Array.from({ length: 32 }, (_, i) => ({
      ...fixture().layers[0],
      id: `layer-${i}`,
    }));
    expect(() => buildModelMessages(huge)).toThrow("too large");
    for (const example of EXAMPLES)
      expect(() =>
        buildModelMessages({
          ...input(),
          scene: example.scene,
          instruction: "Give the headline a gentle float.",
        }),
      ).not.toThrow();
  });
  it("rejects remote origins, credentials, paths and cloud model tags", () => {
    for (const endpoint of [
      "https://ollama.com",
      "http://192.168.1.2:11434",
      "http://user:pass@localhost:11434",
      "http://127.0.0.1:11434/proxy",
    ])
      expect(() => assertLocalConfiguration(endpoint, "qwen3:4b")).toThrow();
    expect(() =>
      assertLocalConfiguration("http://127.0.0.1:11434", "qwen3:cloud"),
    ).toThrow();
    expect(assertLocalConfiguration("http://127.0.0.1:11434", "qwen3:4b")).toBe(
      "http://127.0.0.1:11434",
    );
  });
  it("refuses cloud metadata even under an innocuous local alias", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ remote_host: "https://ollama.com" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(
      createOllamaProvider("http://127.0.0.1:11434", "local-alias").generate(
        input(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("Cloud");
    vi.unstubAllGlobals();
  });
  it("distinguishes a missing local model from a temporarily unavailable Ollama server", async () => {
    try {
      for (const [status, message] of [
        [404, "The selected local model is not installed."],
        [
          503,
          "Ollama could not inspect the local model (HTTP 503). Try again after Ollama is ready.",
        ],
      ] as const) {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => new Response("{}", { status })),
        );
        await expect(
          createOllamaProvider("http://127.0.0.1:11434", "qwen3:4b").generate(
            input(),
            new AbortController().signal,
          ),
        ).rejects.toThrow(message);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("reports invalid model JSON actions concisely without returning validation internals", async () => {
    const mockedFetch = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/api/show")
              ? {}
              : {
                  done: true,
                  done_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      plan: "An invalid model proposal.",
                      kind: "edit",
                      actions: [
                        { action: "unavailable-action", layerId: "headline" },
                      ],
                    }),
                  },
                },
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", mockedFetch);
    try {
      await expect(
        createOllamaProvider("http://127.0.0.1:11434", "qwen3:4b").generate(
          input(),
          new AbortController().signal,
        ),
      ).rejects.toThrow(
        "The local model proposed an invalid action or layer reference. Try a narrower instruction; your poster is unchanged.",
      );
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("translates actual model intents into narrow edits while preserving every unrelated property", () => {
    const result = interpretReply(
      {
        kind: "edit",
        actions: [
          { action: "animate", layerId: "headline", motion: "float" },
          { action: "move", layerId: "caption", axis: "y", delta: 40 },
        ],
      },
      input(),
    );
    expect(result.kind).toBe("edit");
    if (result.kind !== "edit") throw new Error("Wrong result");
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0]).toMatchObject({
      type: "upsertBehavior",
      layerId: "headline",
      behavior: { type: "float", params: { amplitudeX: 16, amplitudeY: 28 } },
    });
    expect(result.operations[1]).toEqual({
      type: "setLayout",
      layerId: "caption",
      changes: { y: 440 },
    });
    expect(() =>
      interpretReply(
        {
          kind: "edit",
          actions: [
            { action: "rewrite", layerId: "headline", text: "New words" },
          ],
        },
        input(),
      ),
    ).toThrow();
    expect(
      interpretReply({ kind: "clarify", question: "Which layer?" }, input()),
    ).toEqual({ kind: "clarify", question: "Which layer?" });
  });
});
