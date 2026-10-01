import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLES } from "../packages/core/src";

const openDB = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("The demo must never open IndexedDB");
  }),
);
vi.mock("idb", () => ({ openDB }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("temporary public demo boundaries", () => {
  it.each(["true", "false"])(
    "blocks library and model requests before transport in hosted=%s",
    async (hosted) => {
      vi.stubGlobal("location", { pathname: "/demo" });
      vi.stubEnv("VITE_HOSTED", hosted);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const { api } = await import("../apps/web/src/api");
      expect(await api("/capabilities")).toMatchObject({
        storage: "memory",
        authenticated: false,
        ai: { available: false, model: "None" },
      });
      for (const path of [
        "/projects",
        "/projects/private",
        "/shares",
        "/ai/connector",
        "/ai/edits",
        "/auth/setup",
      ]) {
        await expect(api(path)).rejects.toMatchObject({ status: 403 });
        await expect(
          api(path, { method: "POST", body: "{}" }),
        ).rejects.toMatchObject({ status: 403 });
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(openDB).not.toHaveBeenCalled();
    },
  );

  it("never reads, archives, restores or writes an existing browser draft", async () => {
    vi.stubGlobal("location", { pathname: "/demo/" });
    const drafts = await import("../apps/web/src/drafts");
    const draft = {
      scene: structuredClone(EXAMPLES[0].scene),
      documentId: "demo",
      projectId: null,
      serverHead: null,
      name: "Temporary edit",
      outbox: [],
    };
    expect(await drafts.recoverDraft()).toBeUndefined();
    expect(await drafts.recentDrafts()).toEqual([]);
    await drafts.persistDraft(draft);
    await drafts.archiveDraft(draft);
    await drafts.updateArchivedHead("demo", "project", "revision");
    expect(openDB).not.toHaveBeenCalled();
  });

  it.each(["/", "/p/shared", "/demonstration", "/demo/other"])(
    "does not change the normal route %s",
    async (pathname) => {
      vi.stubGlobal("location", { pathname });
      expect((await import("../apps/web/src/demo-mode")).isPublicDemo).toBe(
        false,
      );
    },
  );
});
