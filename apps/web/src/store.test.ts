import { beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  Object.defineProperty(globalThis, "matchMedia", {
    value: () => ({ matches: true }),
    configurable: true,
  });
});
const transport = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./api", () => ({
  api: vi.fn(),
  post: transport.post,
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
vi.mock("./drafts", () => ({
  persistDraft: vi.fn(async () => {}),
  recoverDraft: vi.fn(async () => undefined),
  archiveDraft: vi.fn(async () => {}),
  updateArchivedHead: vi.fn(async () => {}),
}));
import {
  EXAMPLES,
  cloneScene,
  newId,
  defaultBehavior,
  compileScene,
  evaluateScene,
} from "../../../packages/core/src";
import { useEditor, setGeometryValidation, previewPointerRef } from "./store";
import { ApiError } from "./api";
beforeEach(() => {
  transport.post.mockReset();
  setGeometryValidation(null);
  useEditor.setState({
    scene: cloneScene(EXAMPLES[0].scene),
    selected: ["gravity-headline"],
    past: [],
    future: [],
    gesture: null,
    gestureBounds: null,
    mutationEpoch: 0,
    requestGeneration: 0,
    affected: [],
    documentId: newId(),
    projectId: null,
    serverHead: null,
    outbox: [],
    playing: false,
    recording: false,
    pausedPointer: undefined,
  });
});
describe("editing after motion preview and pointer recording", () => {
  it("manual edits and rejected changes always release recording without replacing the previous pointer path", () => {
    const originalPath = cloneScene(useEditor.getState().scene).pointer;
    useEditor.getState().beginRecording();
    expect(useEditor.getState().recording).toBe(true);
    useEditor.getState().commit((scene) => {
      scene.layers[0].fill = "#123456";
    });
    expect(useEditor.getState().recording).toBe(false);
    expect(useEditor.getState().playing).toBe(false);
    expect(useEditor.getState().scene.pointer).toEqual(originalPath);
    useEditor.getState().beginRecording();
    setGeometryValidation(() => {
      throw new Error("Text does not fit");
    });
    expect(useEditor.getState().commit(() => {})).toBe(false);
    expect(useEditor.getState().recording).toBe(false);
    expect(useEditor.getState().gesture).toBeNull();
  });
  it("pause, selection, undo and redo all recover a partially recorded loop", () => {
    useEditor.getState().commit((scene) => {
      scene.layers[0].fill = "#123456";
    });
    for (const action of [
      () => useEditor.getState().setPlayback(false),
      () => useEditor.getState().select("gravity-headline"),
      () => useEditor.getState().undo(),
      () => useEditor.getState().redo(),
    ]) {
      useEditor.getState().beginRecording();
      action();
      expect(useEditor.getState().recording).toBe(false);
      expect(useEditor.getState().playing).toBe(false);
      useEditor.getState().beginGesture();
      expect(useEditor.getState().gesture).not.toBeNull();
      useEditor.getState().endGesture(true);
    }
  });
  it("freezes the painted pointer with the playhead so animated selection does not jump", () => {
    const pointer = { x: 320, y: 470, presence: 1 };
    previewPointerRef.current = pointer;
    useEditor.setState({ playing: true, timeMs: 1270, livePointer: true });
    useEditor.getState().select("gravity-headline");
    pointer.x = 900;
    expect(useEditor.getState().pausedPointer).toEqual({
      x: 320,
      y: 470,
      presence: 1,
    });
    expect(useEditor.getState().timeMs).toBe(1270);
    useEditor.getState().setPlayback(true);
    expect(useEditor.getState().pausedPointer).toBeUndefined();
  });
  it("cancelling a recording invalidates an AI request and leaves content unchanged", () => {
    const scene = useEditor.getState().scene;
    const capture = useEditor.getState().beginAi();
    useEditor.getState().beginRecording();
    useEditor.getState().cancelRecording();
    expect(useEditor.getState().scene).toBe(scene);
    expect(useEditor.getState().applyAi(capture, [], false)).toBe(false);
  });
  it("dragging an orbiting shape follows the cursor at half a loop and remains undoable", () => {
    const scene = cloneScene(EXAMPLES[0].scene);
    const shape = scene.layers.find((layer) => layer.kind === "shape")!;
    shape.layout = { x: 540, y: 675, rotationDeg: 0 };
    shape.behaviors = [
      defaultBehavior(
        "orbit",
        scene.timeline.durationMs,
        shape,
        scene.artboard,
      ),
    ];
    scene.layers = [shape];
    useEditor.setState({ scene, selected: [shape.id] });
    const before = evaluateScene(compileScene(scene), {
      timeMs: scene.timeline.durationMs / 2,
      pointer: null,
    });
    useEditor.getState().beginGesture(before.baseBounds);
    useEditor.getState().moveGesture(160, 30);
    useEditor.getState().endGesture();
    const after = evaluateScene(compileScene(useEditor.getState().scene), {
      timeMs: scene.timeline.durationMs / 2,
      pointer: null,
    });
    expect(after.units[0].x - before.units[0].x).toBeCloseTo(160);
    expect(after.units[0].y - before.units[0].y).toBeCloseTo(30);
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(useEditor.getState().scene.layers).toEqual(scene.layers);
  });
  it("drags stop at ink margins instead of rendering invalid positions and reverting", () => {
    const scene = cloneScene(EXAMPLES[0].scene);
    const shape = scene.layers.find((layer) => layer.kind === "shape")!;
    shape.layout = { x: 540, y: 675, rotationDeg: 0 };
    shape.behaviors = [];
    scene.layers = [shape];
    useEditor.setState({ scene, selected: [shape.id] });
    const frame = evaluateScene(compileScene(scene), {
      timeMs: 0,
      pointer: null,
    });
    useEditor.getState().beginGesture(frame.baseBounds);
    useEditor.getState().moveGesture(5000, 5000);
    useEditor.getState().endGesture();
    const bounds = evaluateScene(compileScene(useEditor.getState().scene), {
      timeMs: 0,
      pointer: null,
    }).baseBounds[shape.id];
    expect(bounds.x + bounds.width).toBeCloseTo(scene.artboard.width - 16);
    expect(bounds.y + bounds.height).toBeCloseTo(scene.artboard.height - 16);
    expect(useEditor.getState().past).toHaveLength(1);
  });
});
describe("editor revision and AI races", () => {
  it("rejecting an archived scene keeps the active document and project metadata together", () => {
    useEditor.setState({
      projectId: "current-project",
      serverHead: "current-head",
      name: "Current poster",
    });
    const before = useEditor.getState();
    setGeometryValidation(() => {
      throw new Error("Archived typography does not fit");
    });
    const accepted = useEditor.getState().replace(EXAMPLES[1].scene);
    expect(accepted).toBe(false);
    const after = useEditor.getState();
    expect(after.scene).toBe(before.scene);
    expect(after.documentId).toBe(before.documentId);
    expect(after.projectId).toBe("current-project");
    expect(after.serverHead).toBe("current-head");
    expect(after.name).toBe("Current poster");
  });
  it("keeps the last good revision when font geometry validation fails for manual, AI or gesture changes", () => {
    const before = useEditor.getState().scene;
    setGeometryValidation(() => {
      throw new Error("Layer does not fit the artboard");
    });
    expect(
      useEditor.getState().commit((s) => {
        s.layers[0].layout.x = 16;
      }),
    ).toBe(false);
    expect(useEditor.getState().scene).toBe(before);
    const capture = useEditor.getState().beginAi();
    expect(() =>
      useEditor.getState().applyAi(
        capture,
        [
          {
            type: "setLayout",
            layerId: "gravity-headline",
            changes: { x: 16 },
          },
        ],
        false,
      ),
    ).toThrow("does not fit");
    expect(useEditor.getState().scene).toBe(before);
    useEditor.getState().beginGesture();
    useEditor.getState().moveGesture(-500, 0);
    useEditor.getState().endGesture();
    expect(useEditor.getState().scene).toEqual(before);
    expect(useEditor.getState().past).toHaveLength(0);
  });
  it("undo restores content with a fresh revision and rejects an old AI reply", () => {
    const initial = cloneScene(useEditor.getState().scene);
    const capture = useEditor.getState().beginAi();
    useEditor.getState().commit((s) => {
      s.layers.find((l) => l.id === "gravity-headline")!.layout.x += 10;
    });
    useEditor.getState().undo();
    const restored = useEditor.getState().scene;
    expect(restored.layers).toEqual(initial.layers);
    expect(restored.revision.id).not.toBe(initial.revision.id);
    expect(
      useEditor
        .getState()
        .applyAi(
          capture,
          [{ type: "setFill", layerId: "gravity-headline", colour: "#ff0000" }],
          false,
        ),
    ).toBe(false);
    expect(useEditor.getState().scene).toBe(restored);
  });
  it("a gesture invalidates responses even when it is cancelled without a history item", () => {
    const capture = useEditor.getState().beginAi();
    const initial = cloneScene(useEditor.getState().scene);
    useEditor.getState().beginGesture();
    useEditor.getState().moveGesture(20, 30);
    expect(useEditor.getState().applyAi(capture, [], false)).toBe(false);
    useEditor.getState().endGesture(true);
    expect(useEditor.getState().scene).toEqual(initial);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().applyAi(capture, [], false)).toBe(false);
  });
  it("commits an entire drag as one history item using base coordinates", () => {
    const initial = cloneScene(useEditor.getState().scene);
    useEditor.getState().beginGesture();
    useEditor.getState().moveGesture(10, 20);
    useEditor.getState().moveGesture(20, 30);
    useEditor.getState().endGesture();
    expect(useEditor.getState().past).toHaveLength(1);
    expect(
      useEditor
        .getState()
        .scene.layers.find((l) => l.id === "gravity-headline")!.layout.x,
    ).toBe(
      initial.layers.find((l) => l.id === "gravity-headline")!.layout.x + 20,
    );
    useEditor.getState().undo();
    expect(useEditor.getState().scene.layers).toEqual(initial.layers);
    useEditor.getState().redo();
    expect(useEditor.getState().past).toHaveLength(1);
  });
  it("cleans references when deleting an anchor and restores them together", () => {
    useEditor.getState().removeSelected();
    expect(
      useEditor
        .getState()
        .scene.layers.flatMap((l) => l.behaviors)
        .filter((b) => b.type === "attract"),
    ).toHaveLength(0);
    useEditor.getState().undo();
    expect(
      useEditor
        .getState()
        .scene.layers.flatMap((l) => l.behaviors)
        .filter((b) => b.type === "attract"),
    ).toHaveLength(4);
  });
  it("rejects responses after switching documents or submitting a newer request", () => {
    const capture = useEditor.getState().beginAi();
    useEditor.getState().beginAi();
    expect(useEditor.getState().applyAi(capture, [], false)).toBe(false);
    const next = useEditor.getState().beginAi();
    useEditor.getState().replace(EXAMPLES[1].scene);
    expect(useEditor.getState().applyAi(next, [], false)).toBe(false);
  });
});
describe("serialized durable saves", () => {
  it("preserves a conflicted document while allowing an unrelated draft to save", async () => {
    transport.post.mockRejectedValueOnce(new ApiError("Head changed", 409));
    useEditor.setState({
      projectId: "conflicted-project",
      serverHead: "previous",
    });
    await useEditor.getState().enqueueSave();
    expect(useEditor.getState().outbox[0].blocked).toBe(true);
    useEditor.getState().replace(EXAMPLES[1].scene);
    transport.post.mockResolvedValueOnce({
      project: {
        id: "healthy-project",
        headRevisionId: useEditor.getState().scene.revision.id,
      },
    });
    await useEditor.getState().enqueueSave();
    expect(transport.post).toHaveBeenCalledTimes(2);
    expect(useEditor.getState().projectId).toBe("healthy-project");
    expect(useEditor.getState().outbox).toHaveLength(1);
    expect(useEditor.getState().outbox[0].projectId).toBe("conflicted-project");
  });
  it("does not drop a new project queued while a removed old project request is in flight", async () => {
    let resolve!: (value: unknown) => void;
    transport.post.mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    const old = useEditor.getState().enqueueSave();
    await vi.waitFor(() => expect(transport.post).toHaveBeenCalledTimes(1));
    useEditor.setState({
      documentId: newId(),
      outbox: [],
      projectId: null,
      serverHead: null,
    });
    transport.post.mockResolvedValueOnce({
      project: {
        id: "new-project",
        headRevisionId: useEditor.getState().scene.revision.id,
      },
    });
    await useEditor.getState().enqueueSave();
    expect(useEditor.getState().outbox).toHaveLength(1);
    resolve({ project: { id: "old-project", headRevisionId: "old" } });
    await old;
    expect(transport.post).toHaveBeenCalledTimes(2);
    expect(useEditor.getState().projectId).toBe("new-project");
    expect(useEditor.getState().outbox).toHaveLength(0);
  });
  it("a late save acknowledgement never replaces newer local edits, and the next save follows the acknowledged head", async () => {
    let resolve!: (value: unknown) => void;
    transport.post.mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    const savedRevision = useEditor.getState().scene.revision.id;
    const saving = useEditor.getState().enqueueSave();
    await vi.waitFor(() => expect(transport.post).toHaveBeenCalledTimes(1));
    useEditor.getState().commit((scene) => {
      scene.layers[0].fill = "#123456";
    });
    const newest = useEditor.getState().scene;
    resolve({
      project: {
        id: "project-1",
        name: "Gravity",
        headRevisionId: savedRevision,
      },
      scene: EXAMPLES[0].scene,
    });
    await saving;
    expect(useEditor.getState().scene).toBe(newest);
    expect(useEditor.getState().serverHead).toBe(savedRevision);
    transport.post.mockResolvedValueOnce({
      headRevisionId: newest.revision.id,
      revisionId: newest.revision.id,
    });
    await useEditor.getState().enqueueSave("Final type");
    expect(transport.post.mock.calls[1][1].label).toBe("Final type");
    expect(transport.post.mock.calls[1][1].expectedHeadRevisionId).toBe(
      savedRevision,
    );
    expect(useEditor.getState().outbox).toHaveLength(0);
  });
  it("a late acknowledgement for a previous document does not attach the open draft to that project", async () => {
    let resolve!: (value: unknown) => void;
    transport.post.mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    const saving = useEditor.getState().enqueueSave();
    await vi.waitFor(() => expect(transport.post).toHaveBeenCalledTimes(1));
    useEditor.getState().replace(EXAMPLES[1].scene);
    const newer = useEditor.getState().scene;
    resolve({ project: { id: "old-project", headRevisionId: "old-revision" } });
    await saving;
    expect(useEditor.getState().projectId).toBeNull();
    expect(useEditor.getState().scene).toBe(newer);
  });
});
