import { create } from "zustand";
import {
  EXAMPLES,
  cloneScene,
  reviseScene,
  validateScene,
  newId,
  applyOperations,
  type Scene,
  type EditOperation,
  type Layer,
  type PointerSample,
  type Frame,
} from "../../../packages/core/src";
import { api, post, ApiError, type Project } from "./api";
import {
  persistDraft,
  recoverDraft,
  archiveDraft,
  updateArchivedHead,
  type OutboxItem,
} from "./drafts";
export type AiCapture = {
  revisionId: string;
  generation: number;
  epoch: number;
  documentId: string;
};
type EditorState = {
  scene: Scene;
  selected: string[];
  past: Scene[];
  future: Scene[];
  gesture: Scene | null;
  gestureBounds: Frame["baseBounds"] | null;
  documentId: string;
  projectId: string | null;
  serverHead: string | null;
  name: string;
  mutationEpoch: number;
  requestGeneration: number;
  affected: string[];
  notice: string;
  playing: boolean;
  timeMs: number;
  livePointer: boolean;
  recording: boolean;
  pausedPointer: PointerSample | null | undefined;
  outbox: OutboxItem[];
  saveState: string;
  recovered: boolean;
  enterEditMode: () => void;
  setPlayback: (playing: boolean) => void;
  beginRecording: () => void;
  cancelRecording: () => void;
  commit: (change: (scene: Scene) => void, label?: string) => boolean;
  replace: (scene: Scene, project?: Project) => boolean;
  select: (id: string | null, multi?: boolean) => void;
  undo: () => void;
  redo: () => void;
  beginGesture: (bounds?: Frame["baseBounds"]) => void;
  moveGesture: (dx: number, dy: number) => void;
  endGesture: (cancel?: boolean) => void;
  removeSelected: () => void;
  reorder: (id: string, direction: number) => void;
  beginAi: () => AiCapture;
  applyAi: (
    capture: AiCapture,
    operations: EditOperation[],
    allowTextChanges: boolean,
  ) => boolean;
  enqueueSave: (label?: string) => Promise<void>;
  sync: () => Promise<void>;
};
const initial = reviseScene(cloneScene(EXAMPLES[0].scene));
const trimError = (error: unknown) =>
  error instanceof Error ? error.message : "That change could not be applied.";
let validateGeometry: ((scene: Scene) => void) | null = null;
// The input used for the last painted frame. Pausing freezes it with the clock,
// so pointer-driven letters remain under the cursor when editing starts.
export const previewPointerRef: { current: PointerSample | null } = {
  current: null,
};
export function setGeometryValidation(
  validator: ((scene: Scene) => void) | null,
) {
  validateGeometry = validator;
}
export const useEditor = create<EditorState>((set, get) => ({
  scene: initial,
  selected: [],
  past: [],
  future: [],
  gesture: null,
  gestureBounds: null,
  documentId: newId(),
  projectId: null,
  serverHead: null,
  name: EXAMPLES[0].title,
  mutationEpoch: 0,
  requestGeneration: 0,
  affected: [],
  notice: "",
  playing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  timeMs: 0,
  livePointer: false,
  recording: false,
  pausedPointer: undefined,
  outbox: [],
  saveState: "Saved on this device",
  recovered: false,
  enterEditMode() {
    const state = get();
    set({
      playing: false,
      recording: false,
      pausedPointer:
        state.pausedPointer === undefined
          ? structuredClone(previewPointerRef.current)
          : state.pausedPointer,
      ...(state.recording
        ? {
            livePointer: false,
            mutationEpoch: state.mutationEpoch + 1,
            notice:
              "Recording cancelled · previous pointer path preserved. Ready to edit.",
          }
        : {}),
    });
  },
  setPlayback(playing) {
    if (!playing) get().enterEditMode();
    else {
      get().endGesture();
      set({ playing: true, recording: false, pausedPointer: undefined });
    }
  },
  beginRecording() {
    get().endGesture(true);
    set((state) => ({
      recording: true,
      playing: true,
      livePointer: true,
      pausedPointer: undefined,
      timeMs: 0,
      mutationEpoch: state.mutationEpoch + 1,
      notice:
        "Move your pointer across the canvas. One loop will be saved; Cancel or Escape keeps the previous path.",
    }));
  },
  cancelRecording() {
    get().enterEditMode();
  },
  commit(change, label = "Updated poster") {
    get().enterEditMode();
    const state = get();
    try {
      const next = cloneScene(state.scene);
      change(next);
      const revised = reviseScene(next);
      validateScene(revised);
      validateGeometry?.(revised);
      set({
        scene: revised,
        past: [...state.past.slice(-79), state.scene],
        future: [],
        mutationEpoch: state.mutationEpoch + 1,
        affected: [],
        notice: label,
        playing: false,
        gesture: null,
        gestureBounds: null,
      });
      return true;
    } catch (error) {
      set({ notice: trimError(error) });
      return false;
    }
  },
  replace(scene, project) {
    const state = get();
    try {
      validateScene(scene);
      validateGeometry?.(scene);
    } catch (error) {
      set({ notice: trimError(error) });
      return false;
    }
    void archiveDraft({
      scene: state.gesture ?? state.scene,
      documentId: state.documentId,
      projectId: state.projectId,
      serverHead: state.serverHead,
      name: state.name,
      outbox: state.outbox,
    }).catch(() => {});
    set({
      scene: project
        ? validateScene(cloneScene(scene))
        : reviseScene(cloneScene(scene)),
      documentId: newId(),
      projectId: project?.id ?? null,
      serverHead: project?.headRevisionId ?? null,
      name: project?.name ?? "Untitled poster",
      past: [],
      future: [],
      gesture: null,
      gestureBounds: null,
      selected: [],
      affected: [],
      mutationEpoch: state.mutationEpoch + 1,
      requestGeneration: state.requestGeneration + 1,
      timeMs: 0,
      playing: false,
      livePointer: false,
      recording: false,
      pausedPointer: undefined,
      saveState: project ? "Saved to local library" : "Saved on this device",
      notice: project
        ? "Project opened"
        : "A fresh canvas, ready to make your own.",
    });
    return true;
  },
  select(id, multi = false) {
    get().enterEditMode();
    set((state) => ({
      selected: id
        ? multi
          ? state.selected.includes(id)
            ? state.selected.filter((x) => x !== id)
            : [...state.selected, id]
          : [id]
        : [],
    }));
  },
  undo() {
    get().enterEditMode();
    const state = get();
    if (state.gesture) {
      get().endGesture(true);
      return;
    }
    if (!state.past.length) return;
    const old = state.past.at(-1)!;
    const next = cloneScene(old);
    next.revision = state.scene.revision;
    set({
      scene: reviseScene(next),
      past: state.past.slice(0, -1),
      future: [state.scene, ...state.future],
      mutationEpoch: state.mutationEpoch + 1,
      playing: false,
      affected: [],
      notice: "Undid last change",
    });
  },
  redo() {
    get().enterEditMode();
    const state = get();
    if (!state.future.length) return;
    const next = cloneScene(state.future[0]);
    next.revision = state.scene.revision;
    set({
      scene: reviseScene(next),
      past: [...state.past, state.scene],
      future: state.future.slice(1),
      mutationEpoch: state.mutationEpoch + 1,
      playing: false,
      affected: [],
      notice: "Redid last change",
    });
  },
  beginGesture(bounds) {
    get().enterEditMode();
    set((state) => ({
      gesture: cloneScene(state.scene),
      gestureBounds: bounds ? structuredClone(bounds) : null,
      playing: false,
      mutationEpoch: state.mutationEpoch + 1,
      affected: [],
    }));
  },
  moveGesture(dx, dy) {
    const state = get();
    if (!state.gesture) return;
    const next = cloneScene(state.gesture);
    let minX = -Infinity,
      maxX = Infinity,
      minY = -Infinity,
      maxY = Infinity;
    for (const layer of next.layers) {
      if (!state.selected.includes(layer.id) || layer.locked) continue;
      const box = state.gestureBounds?.[layer.id];
      if (box) {
        minX = Math.max(minX, 16 - box.x);
        maxX = Math.min(maxX, next.artboard.width - 16 - box.x - box.width);
        minY = Math.max(minY, 16 - box.y);
        maxY = Math.min(maxY, next.artboard.height - 16 - box.y - box.height);
      }
      for (const behavior of layer.behaviors) {
        if (
          "anchor" in behavior.params &&
          behavior.params.anchor.type === "point"
        ) {
          const anchor = behavior.params.anchor;
          minX = Math.max(minX, -anchor.x);
          maxX = Math.min(maxX, next.artboard.width - anchor.x);
          minY = Math.max(minY, -anchor.y);
          maxY = Math.min(maxY, next.artboard.height - anchor.y);
        }
      }
    }
    dx = Math.max(minX, Math.min(maxX, dx));
    dy = Math.max(minY, Math.min(maxY, dy));
    next.layers.forEach((layer) => {
      if (state.selected.includes(layer.id) && !layer.locked) {
        const x = Math.max(
          16,
          Math.min(next.artboard.width - 16, layer.layout.x + dx),
        );
        const y = Math.max(
          16,
          Math.min(next.artboard.height - 16, layer.layout.y + dy),
        );
        for (const behavior of layer.behaviors) {
          if (
            "anchor" in behavior.params &&
            behavior.params.anchor.type === "point"
          ) {
            behavior.params.anchor.x += x - layer.layout.x;
            behavior.params.anchor.y += y - layer.layout.y;
          }
        }
        layer.layout.x = x;
        layer.layout.y = y;
      }
    });
    set({ scene: next });
  },
  endGesture(cancel = false) {
    const state = get();
    if (!state.gesture) return;
    const before = state.gesture;
    if (cancel || JSON.stringify(before) === JSON.stringify(state.scene)) {
      set({ scene: before, gesture: null, gestureBounds: null });
      return;
    }
    try {
      validateScene(state.scene);
      validateGeometry?.(state.scene);
      set({
        scene: reviseScene(state.scene),
        past: [...state.past.slice(-79), before],
        future: [],
        gesture: null,
        gestureBounds: null,
        notice: "Moved selection",
      });
    } catch (error) {
      set({
        scene: before,
        gesture: null,
        gestureBounds: null,
        notice: trimError(error),
      });
    }
  },
  removeSelected() {
    const selected = get().selected;
    get().commit((scene) => {
      scene.layers = scene.layers.filter(
        (layer) => !selected.includes(layer.id) || layer.locked,
      );
      const alive = new Set(scene.layers.map((l) => l.id));
      scene.layers.forEach((layer) => {
        layer.behaviors = layer.behaviors.filter(
          (b) =>
            !("anchor" in b.params) ||
            b.params.anchor.type !== "layer" ||
            alive.has(b.params.anchor.layerId),
        );
      });
    }, "Deleted selection");
    set({ selected: [] });
  },
  reorder(id, direction) {
    get().commit((scene) => {
      const index = scene.layers.findIndex((l) => l.id === id);
      const next = Math.max(
        0,
        Math.min(scene.layers.length - 1, index + direction),
      );
      const [layer] = scene.layers.splice(index, 1);
      scene.layers.splice(next, 0, layer);
    }, "Reordered layer");
  },
  beginAi() {
    const state = get();
    const generation = state.requestGeneration + 1;
    set({ requestGeneration: generation });
    return {
      revisionId: state.scene.revision.id,
      generation,
      epoch: state.mutationEpoch,
      documentId: state.documentId,
    };
  },
  applyAi(capture, operations, allowTextChanges) {
    const state = get();
    if (
      state.gesture ||
      state.recording ||
      capture.documentId !== state.documentId ||
      capture.revisionId !== state.scene.revision.id ||
      capture.generation !== state.requestGeneration ||
      capture.epoch !== state.mutationEpoch
    )
      return false;
    const result = applyOperations(state.scene, operations, {
      allowTextChanges,
    });
    validateGeometry?.(result.scene);
    set({
      scene: result.scene,
      past: [...state.past.slice(-79), state.scene],
      future: [],
      affected: result.affectedLayerIds,
      mutationEpoch: state.mutationEpoch + 1,
      notice: result.summary,
      playing: false,
    });
    return true;
  },
  async enqueueSave(label) {
    const state = get();
    if (state.gesture) return;
    if (
      state.outbox.some(
        (item) =>
          item.documentId === state.documentId &&
          item.scene.revision.id === state.scene.revision.id,
      )
    ) {
      await get().sync();
      return;
    }
    if (state.serverHead === state.scene.revision.id) {
      set({ saveState: "Saved to local library" });
      return;
    }
    const previous = state.outbox
      .filter((item) => item.documentId === state.documentId)
      .at(-1);
    const item: OutboxItem = {
      id: newId(),
      documentId: state.documentId,
      projectId: state.projectId,
      name: state.name,
      ...(label ? { label } : {}),
      scene: cloneScene(state.scene),
      expectedHeadRevisionId: previous?.scene.revision.id ?? state.serverHead,
    };
    set({ outbox: [...state.outbox, item], saveState: "Waiting to save" });
    await persistCurrent();
    await get().sync();
  },
  async sync() {
    await syncOutbox();
  },
}));
export function updateLayer(
  id: string,
  change: (layer: Layer) => void,
  label?: string,
) {
  return useEditor.getState().commit((scene) => {
    const layer = scene.layers.find((l) => l.id === id);
    if (layer) change(layer);
  }, label);
}
export function persistCurrent() {
  const s = useEditor.getState();
  return persistDraft({
    scene: s.gesture ?? s.scene,
    documentId: s.documentId,
    projectId: s.projectId,
    serverHead: s.serverHead,
    name: s.name,
    outbox: s.outbox,
  });
}
let syncing = false;
async function syncOutbox() {
  if (syncing) return;
  syncing = true;
  try {
    while (useEditor.getState().outbox.length) {
      const queue = useEditor.getState().outbox;
      const blocked = new Set(
        queue.filter((item) => item.blocked).map((item) => item.documentId),
      );
      const item = queue.find((item) => !blocked.has(item.documentId));
      if (!item) break;
      useEditor.setState({ saveState: "Saving to local library…" });
      try {
        let projectId = item.projectId,
          head: string;
        if (!projectId) {
          const result = await post<{ project: Project; scene: Scene }>(
            "/projects",
            { name: item.name, scene: item.scene, operationId: item.id },
          );
          projectId = result.project.id;
          head = result.project.headRevisionId;
        } else {
          const result = await post(`/projects/${projectId}/revisions`, {
            scene: item.scene,
            expectedHeadRevisionId: item.expectedHeadRevisionId,
            operationId: item.id,
            label: item.label ?? item.name,
          });
          head = result.headRevisionId;
        }
        useEditor.setState((state) => ({
          outbox: state.outbox
            .filter((queued) => queued.id !== item.id)
            .map((queued) =>
              queued.documentId === item.documentId && !queued.projectId
                ? { ...queued, projectId }
                : queued,
            ),
          ...(state.documentId === item.documentId
            ? { projectId, serverHead: head }
            : {}),
          saveState:
            state.scene.revision.id === head
              ? "Saved to local library"
              : "New changes on this device",
        }));
        await updateArchivedHead(item.documentId, projectId, head);
        await persistCurrent();
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409;
        useEditor.setState((state) => ({
          ...(conflict
            ? {
                outbox: state.outbox.map((queued) =>
                  queued.documentId === item.documentId
                    ? { ...queued, blocked: true }
                    : queued,
                ),
              }
            : {}),
          saveState: conflict
            ? "Save conflict · draft preserved"
            : "Offline · save queued",
          notice: conflict
            ? "This project changed elsewhere. Your draft is safe. Use “Save as new project” in the library."
            : trimError(error),
        }));
        if (conflict) {
          await persistCurrent();
          continue;
        }
        break;
      }
    }
  } finally {
    syncing = false;
  }
}
export async function initializeRecovery() {
  try {
    const saved = await recoverDraft();
    if (saved) {
      validateScene(saved.scene);
      useEditor.setState({
        ...saved,
        past: [],
        future: [],
        selected: [],
        playing: false,
        recording: false,
        livePointer: false,
        pausedPointer: undefined,
        gesture: null,
        gestureBounds: null,
        mutationEpoch: 1,
        requestGeneration: 1,
        recovered: true,
        notice: "Recovered your latest draft from this device.",
      });
    }
  } catch (error) {
    useEditor.setState({
      notice: `Device recovery unavailable: ${trimError(error)}`,
    });
  }
  let timer: ReturnType<typeof setTimeout>;
  useEditor.subscribe((state, previous) => {
    if (
      state.scene !== previous.scene ||
      state.outbox !== previous.outbox ||
      state.name !== previous.name ||
      state.documentId !== previous.documentId
    ) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void persistCurrent().catch(() =>
          useEditor.setState({ saveState: "Device storage unavailable" }),
        );
      }, 120);
    }
  });
  window.addEventListener("online", () => void useEditor.getState().sync());
}
