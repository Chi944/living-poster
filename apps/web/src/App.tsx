import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Layers,
  Link,
  LoaderCircle,
  Lock,
  Plus,
  Redo2,
  Settings2,
  Shapes,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import {
  EXAMPLES,
  FONT_OPTIONS,
  CANVAS_PRESETS,
  resizeScene,
  cloneScene,
  compileScene,
  evaluateScene,
  loadFonts,
  newId,
  paintFrame,
  samplePointer,
  validateScene,
  type Scene,
  type Layer,
} from "../../../packages/core/src";
import { api, post, type Capabilities, type Project } from "./api";
import {
  useEditor,
  updateLayer,
  setGeometryValidation,
  persistCurrent,
} from "./store";
import { recentDrafts, type ArchivedDraft } from "./drafts";
import { CanvasStage, PosterPreview, pointerRef } from "./CanvasStage";
import { Inspector } from "./Inspector";
import { AiComposer } from "./AiComposer";
import { Timeline } from "./Timeline";
import { HostedConnector } from "./HostedConnector";
import { TemplateBrowser } from "./TemplateBrowser";
import { exportPng, exportHtml, downloadScene } from "./exports";
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    element.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = Array.from(
          element.current?.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href],summary,[tabindex]",
          ) ?? [],
        ).filter(
          (item) =>
            !item.matches(":disabled") &&
            item.tabIndex >= 0 &&
            item.getClientRects().length > 0 &&
            getComputedStyle(item).visibility !== "hidden",
        );
        if (items?.length) {
          const first = items[0],
            last = items[items.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === element.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={element}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function AuthDialog({
  capabilities,
  onClose,
  onSuccess,
}: {
  capabilities: Capabilities | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={
        capabilities?.needsSetup ? "Make this studio yours" : "Welcome back"
      }
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="auth-mark">
          <Lock size={24} />
        </div>
        <p className="modal-lead">Your posters, your machine.</p>
        <p className="muted">
          {capabilities?.needsSetup
            ? "Set a local password to save projects, create share links and work with your local language model."
            : "Unlock your local library and language tools."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await post(
                capabilities?.needsSetup ? "/auth/setup" : "/auth/login",
                { password },
              );
              onSuccess();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not connect");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>
              {capabilities?.needsSetup
                ? "Choose password · at least 10 characters"
                : "Password"}
            </span>
            <input
              type="password"
              autoComplete={
                capabilities?.needsSetup ? "new-password" : "current-password"
              }
              minLength={capabilities?.needsSetup ? 10 : 1}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Lock size={14} />
            )}{" "}
            {capabilities?.needsSetup ? "Set up local studio" : "Unlock studio"}
          </button>
        </form>
        <p className="small-note">
          No account, subscription or cloud service. The password protects the
          library on this server.
        </p>
      </div>
    </Modal>
  );
}
function LibraryDialog({
  onClose,
  onShare,
  portable = false,
}: {
  onClose: () => void;
  onShare: (projectId: string, revisionId: string) => void;
  portable?: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>([]),
    [revisions, setRevisions] = useState<any[] | null>(null),
    [shares, setShares] = useState<any[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [revisionLabel, setRevisionLabel] = useState("");
  const currentProject = useEditor((s) => s.projectId);
  const refresh = () =>
    api("/projects")
      .then((data) => setProjects(data.projects))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  useEffect(() => {
    void refresh();
  }, []);
  const openProject = async (project: Project) => {
    try {
      const result = await api(`/projects/${project.id}`);
      useEditor.getState().replace(result.scene, result.project);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open project");
    }
  };
  return (
    <Modal title="Your local library" wide onClose={onClose}>
      <div className="modal-body">
        <div className="library-toolbar">
          <p className="muted">A home for everything you make.</p>
          <button
            className="button"
            onClick={async () => {
              try {
                const data = await api("/shares");
                setShares(shares ? null : data.shares);
                setRevisions(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Shares unavailable");
              }
            }}
          >
            <Link size={14} />
            Share links
          </button>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {busy ? (
          <p className="muted">Opening your library…</p>
        ) : shares ? (
          <div className="library-list">
            {!shares.length && (
              <p className="muted">
                No share links yet. Share a saved revision to create one.
              </p>
            )}
            {shares.map((share) => (
              <article key={share.id}>
                <div>
                  <strong>{share.projectName}</strong>
                  <small>{share.revoked ? "Revoked" : share.url}</small>
                </div>
                {!share.revoked && (
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await api(`/shares/${share.id}`, { method: "DELETE" });
                        setShares(
                          portable
                            ? shares.filter((s) => s.id !== share.id)
                            : shares.map((s) =>
                                s.id === share.id ? { ...s, revoked: true } : s,
                              ),
                        );
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Could not revoke",
                        );
                      }
                    }}
                  >
                    {portable ? "Remove from list" : "Revoke"}
                  </button>
                )}
              </article>
            ))}
            {portable && (
              <p className="small-note">
                Links contain a poster snapshot. Removing one from this list
                cannot disable copies already shared.
              </p>
            )}
          </div>
        ) : revisions ? (
          <>
            <button className="text-button" onClick={() => setRevisions(null)}>
              <ChevronLeft size={13} /> All projects
            </button>
            <h3>{selectedProject?.name} · saved revisions</h3>
            <div className="library-list">
              {revisions.map((rev) => (
                <article key={rev.id}>
                  <div>
                    <strong>{rev.label || "Saved revision"}</strong>
                    <small>
                      {new Date(rev.createdAt).toLocaleString()} ·{" "}
                      {rev.id.slice(0, 8)}
                    </small>
                  </div>
                  <button
                    className="button"
                    onClick={() => {
                      const state = useEditor.getState();
                      if (state.projectId !== selectedProject?.id) {
                        setError(
                          "Open this project before restoring a revision.",
                        );
                        return;
                      }
                      state.commit((scene) => {
                        const revision = scene.revision;
                        Object.assign(scene, cloneScene(rev.scene));
                        scene.revision = revision;
                      }, "Restored saved revision as a new change");
                      onClose();
                    }}
                  >
                    Restore
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Share this revision"
                    onClick={() => onShare(selectedProject!.id, rev.id)}
                  >
                    <Link size={15} />
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="library-list">
            {!projects.length && (
              <p className="empty-state">
                Your first poster is waiting.
                <br />
                <span>Save the current draft to start your collection.</span>
              </p>
            )}
            {projects.map((project) => (
              <article key={project.id}>
                <button
                  className="project-open"
                  onClick={() => void openProject(project)}
                >
                  <span className="project-monogram">
                    {project.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>
                      {project.name}
                      {currentProject === project.id && (
                        <span className="current-badge">OPEN</span>
                      )}
                    </strong>
                    <small>
                      {new Date(project.updatedAt).toLocaleString()}
                    </small>
                  </span>
                </button>
                <button
                  className="button"
                  onClick={async () => {
                    try {
                      const data = await api(
                        `/projects/${project.id}/revisions`,
                      );
                      setRevisions(data.revisions);
                      setSelectedProject(project);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Revisions unavailable",
                      );
                    }
                  }}
                >
                  Revisions
                </button>
              </article>
            ))}
          </div>
        )}
        {currentProject && (
          <div className="named-revision">
            <input
              aria-label="Revision label"
              placeholder="Name a milestone, e.g. Final type"
              maxLength={100}
              value={revisionLabel}
              onChange={(e) => setRevisionLabel(e.target.value)}
            />
            <button
              className="button"
              disabled={!revisionLabel.trim()}
              onClick={async () => {
                const label = revisionLabel.trim();
                const state = useEditor.getState();
                if (state.commit(() => {}, `Named revision: ${label}`)) {
                  await useEditor.getState().enqueueSave(label);
                  setRevisionLabel("");
                  if (selectedProject) {
                    const data = await api(
                      `/projects/${selectedProject.id}/revisions`,
                    );
                    setRevisions(data.revisions);
                  }
                }
              }}
            >
              Save named revision
            </button>
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <span className="small-note">Stored in SQLite on your machine.</span>
        <button
          className="button primary"
          onClick={async () => {
            const state = useEditor.getState();
            const oldDocument = state.documentId;
            useEditor.setState({
              documentId: newId(),
              projectId: null,
              serverHead: null,
              outbox: state.outbox.filter(
                (item) => item.documentId !== oldDocument,
              ),
            });
            await useEditor.getState().enqueueSave();
            await refresh();
          }}
        >
          Save as new project
        </button>
      </footer>
    </Modal>
  );
}
function ExportDialog({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState("html"),
    [pointerMode, setPointerMode] = useState<"saved" | "fixed" | "disabled">(
      "saved",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = useEditor((s) => s.livePointer);
  const savedPointer = useEditor((s) => s.scene.pointer.mode);
  const artboard = useEditor((s) => s.scene.artboard);
  return (
    <Modal title="Let it out into the world" onClose={onClose}>
      <div className="modal-body">
        <p className="muted">Made here. Ready for anywhere.</p>
        <div className="export-options">
          {[
            {
              id: "html",
              title: "Living poster",
              sub: "Self-contained HTML · animated, works offline",
              symbol: "↗",
            },
            {
              id: "png",
              title: "A moment in time",
              sub: `PNG · the current frame, ${artboard.width} × ${artboard.height}`,
              symbol: "▧",
            },
            {
              id: "json",
              title: "Editable scene",
              sub: "JSON · keep every detail and behaviour",
              symbol: "{ }",
            },
          ].map((option) => (
            <button
              className={format === option.id ? "selected" : ""}
              key={option.id}
              onClick={() => setFormat(option.id)}
            >
              <span>{option.symbol}</span>
              <div>
                <strong>{option.title}</strong>
                <small>{option.sub}</small>
              </div>
              <span className="radio-mark">
                {format === option.id && <Check size={12} />}
              </span>
            </button>
          ))}
        </div>
        <label className="field">
          <span>Pointer in the export</span>
          <select
            value={pointerMode}
            onChange={(e) =>
              setPointerMode(e.target.value as typeof pointerMode)
            }
          >
            <option value="saved">Use saved input ({savedPointer})</option>
            <option value="fixed">Freeze current pointer</option>
            <option value="disabled">Disable pointer</option>
          </select>
        </label>
        {live && (
          <p className="small-note">
            Live interaction is temporary. Choose the pointer input to include
            in this export.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const state = useEditor.getState();
              const scene = cloneScene(state.scene);
              if (pointerMode === "fixed")
                scene.pointer = {
                  mode: "fixed",
                  sample: pointerRef.current ?? {
                    x: scene.artboard.width / 2,
                    y: scene.artboard.height / 2,
                    presence: 1,
                  },
                };
              if (pointerMode === "disabled")
                scene.pointer = { mode: "disabled" };
              if (format === "html") await exportHtml(scene);
              else if (format === "png")
                await exportPng(
                  scene,
                  state.timeMs,
                  samplePointer(scene, state.timeMs),
                );
              else downloadScene(scene);
              onClose();
              useEditor.setState({ notice: "Your export is ready." });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Export failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Download size={15} />
          )}{" "}
          {busy ? "Preparing your poster…" : `Download ${format.toUpperCase()}`}
        </button>
      </div>
    </Modal>
  );
}
function LayersPanel({
  ready,
  onExamples,
  onPick,
  onAdd,
}: {
  ready: boolean;
  onExamples: () => void;
  onPick: () => void;
  onAdd: () => void;
}) {
  const layers = useEditor((s) => s.scene.layers),
    selected = useEditor((s) => s.selected),
    affected = useEditor((s) => s.affected);
  const add = (kind: "text" | "shape") => {
    const id = newId();
    useEditor.getState().commit((scene) => {
      const common = {
        id,
        name: kind === "text" ? "New text" : "New shape",
        visible: true,
        locked: false,
        opacity: 1,
        fill: "#20211f",
        layout: {
          x: scene.artboard.width / 2,
          y: scene.artboard.height / 2 + (kind === "text" ? 15 : 0),
          rotationDeg: 0,
        },
        behaviors: [],
      };
      const layer: Layer =
        kind === "text"
          ? {
              ...common,
              kind,
              text: "MAKE IT MOVE",
              fontId: "space-bold",
              fontSize: 74,
              lineHeight: 1.1,
              trackingEm: 0,
              align: "center",
            }
          : {
              ...common,
              kind,
              shape: "ellipse",
              width: 200,
              height: 200,
              fill: "#a83220",
            };
      scene.layers.push(layer);
      if (kind === "text" && !scene.fonts.some((f) => f.id === "space-bold"))
        scene.fonts.push({ id: "space-bold", assetHash: "bundled-v1" });
    }, `Added ${kind} layer`);
    useEditor.getState().select(id);
    onAdd();
  };
  return (
    <aside className="left-rail" aria-label="Layers and starting points">
      <div className="panel-heading">
        <Layers size={14} />
        <h2>Layers</h2>
        <span>{layers.length.toString().padStart(2, "0")}</span>
      </div>
      <div className="add-layer-buttons">
        <button className="button" onClick={() => add("text")}>
          <Type size={14} />
          Text
          <Plus size={11} />
        </button>
        <button className="button" onClick={() => add("shape")}>
          <Shapes size={14} />
          Shape
          <Plus size={11} />
        </button>
      </div>
      <div className="layer-list">
        {[...layers].reverse().map((layer) => (
          <div
            className={`layer-row ${selected.includes(layer.id) ? "selected" : ""} ${affected.includes(layer.id) ? "affected" : ""}`}
            key={layer.id}
          >
            <button
              className="layer-main"
              aria-pressed={selected.includes(layer.id)}
              onClick={(e) => {
                useEditor.getState().select(layer.id, e.shiftKey);
                onPick();
              }}
            >
              {layer.kind === "text" ? (
                <Type size={13} />
              ) : (
                <span className={`shape-symbol ${layer.shape}`} />
              )}
              <span>{layer.name}</span>
              {layer.behaviors.some((b) => b.enabled) && (
                <i className="layer-motion-indicator" />
              )}
            </button>
            <button
              className="layer-option"
              aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
              onClick={() =>
                updateLayer(layer.id, (l) => {
                  l.visible = !l.visible;
                })
              }
            >
              {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              className="layer-option"
              aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
              onClick={() =>
                updateLayer(layer.id, (l) => {
                  l.locked = !l.locked;
                })
              }
            >
              {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
          </div>
        ))}
      </div>
      <div className="layer-actions">
        <span>BACK → FRONT</span>
        <button
          className="icon-button"
          disabled={selected.length !== 1}
          aria-label="Move layer backward"
          onClick={() => useEditor.getState().reorder(selected[0], -1)}
        >
          <ArrowDown size={13} />
        </button>
        <button
          className="icon-button"
          disabled={selected.length !== 1}
          aria-label="Move layer forward"
          onClick={() => useEditor.getState().reorder(selected[0], 1)}
        >
          <ArrowUp size={13} />
        </button>
        <button
          className="icon-button"
          disabled={!selected.length}
          aria-label="Delete selected layers"
          onClick={() => useEditor.getState().removeSelected()}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="rail-bottom compact-rail-bottom">
        <button
          className="button full"
          onClick={onExamples}
          aria-label="Browse all examples"
        >
          <Shapes size={15} />
          Templates<span>{EXAMPLES.length}</span>
          <ArrowUpRight size={14} />
        </button>
        <p className="small-note">
          Shift-click to select more · Arrow keys to nudge
        </p>
      </div>
    </aside>
  );
}
export function App() {
  const [ready, setReady] = useState(false),
    [fontError, setFontError] = useState(""),
    [capabilities, setCapabilities] = useState<Capabilities | null>(null),
    [dialog, setDialog] = useState<
      "auth" | "library" | "export" | "examples" | "settings" | null
    >(null),
    [shareUrl, setShareUrl] = useState(""),
    [shareBusy, setShareBusy] = useState(false);
  const name = useEditor((s) => s.name),
    saveState = useEditor((s) => s.saveState),
    notice = useEditor((s) => s.notice),
    past = useEditor((s) => s.past.length),
    future = useEditor((s) => s.future.length),
    scene = useEditor((s) => s.scene),
    playing = useEditor((s) => s.playing),
    recording = useEditor((s) => s.recording),
    projectId = useEditor((s) => s.projectId),
    gesture = useEditor((s) => s.gesture);
  const close = useCallback(() => {
    setDialog(null);
    setShareUrl("");
  }, []);
  const [drafts, setDrafts] = useState<ArchivedDraft[]>([]);
  const [mobileView, setMobileView] = useState("canvas");
  const [toolPanel, setToolPanel] = useState<
    "style" | "layout" | "motion" | "ai"
  >("style");
  const chooseTool = (panel: typeof toolPanel) => {
    setToolPanel(panel);
    document.querySelector(".tool-content")?.scrollTo(0, 0);
  };
  const savedProjectName = useRef(name);
  useEffect(() => {
    savedProjectName.current = useEditor.getState().name;
  }, [projectId]);
  const renameProject = async () => {
    const state = useEditor.getState(),
      nextName = state.name.trim() || "Untitled poster";
    useEditor.setState({ name: nextName });
    if (!state.projectId || nextName === savedProjectName.current) return;
    const previous = savedProjectName.current,
      id = state.projectId;
    try {
      await persistCurrent();
      await api(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      });
      if (useEditor.getState().projectId === id) {
        savedProjectName.current = nextName;
        useEditor.setState({ notice: "Project renamed" });
        await persistCurrent();
      }
    } catch (error) {
      if (
        useEditor.getState().projectId === id &&
        useEditor.getState().name === nextName
      )
        useEditor.setState({
          name: previous,
          notice:
            error instanceof Error
              ? error.message
              : "Could not rename the project.",
        });
    }
  };
  useEffect(() => {
    if (dialog === "examples")
      void recentDrafts()
        .then(setDrafts)
        .catch(() => {});
  }, [dialog]);
  const refreshCapabilities = useCallback(async () => {
    try {
      const data = await api<Capabilities>("/capabilities");
      setCapabilities(data);
      if (data.authenticated) void useEditor.getState().sync();
    } catch {
      setCapabilities(null);
    }
  }, []);
  const fonts = useCallback(() => {
    setFontError("");
    void loadFonts()
      .then(() => {
        setGeometryValidation((scene) => {
          compileScene(scene);
        });
        setReady(true);
      })
      .catch((e) => setFontError(e.message));
  }, []);
  useEffect(() => {
    fonts();
    void refreshCapabilities();
    const interval = setInterval(() => void refreshCapabilities(), 30000);
    return () => clearInterval(interval);
  }, [fonts, refreshCapabilities]);
  useEffect(() => {
    if (!capabilities?.authenticated || !projectId || gesture) return;
    const timer = setTimeout(
      () => void useEditor.getState().enqueueSave(),
      1800,
    );
    return () => clearTimeout(timer);
  }, [scene, projectId, capabilities?.authenticated, gesture]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (dialog || shareUrl || document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement;
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
      const state = useEditor.getState();
      if (event.key === "Escape" && state.recording) state.cancelRecording();
      if (editing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? state.redo() : state.undo();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        state.redo();
      } else if (event.key === "Escape") {
        state.enterEditMode();
        state.endGesture(true);
        state.select(null);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        state.removeSelected();
      } else if (
        event.code === "Space" &&
        !target.closest("button, a, summary, [role=tab]")
      ) {
        event.preventDefault();
        state.setPlayback(!state.playing);
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          event.key,
        ) &&
        state.selected.length &&
        !target.closest("button, a, summary, [role=tab]")
      ) {
        event.preventDefault();
        const n = event.shiftKey ? 10 : 1;
        state.commit((s) => {
          s.layers.forEach((l) => {
            if (state.selected.includes(l.id) && !l.locked) {
              l.layout.x +=
                event.key === "ArrowRight"
                  ? n
                  : event.key === "ArrowLeft"
                    ? -n
                    : 0;
              l.layout.y +=
                event.key === "ArrowDown"
                  ? n
                  : event.key === "ArrowUp"
                    ? -n
                    : 0;
            }
          });
        }, "Nudged selection");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dialog, shareUrl]);
  const save = async () => {
    if (!capabilities) return;
    if (!capabilities.authenticated) {
      setDialog("auth");
      return;
    }
    await useEditor.getState().enqueueSave();
  };
  const share = async (savedProjectId?: string, revisionId?: string) => {
    if (!capabilities) return;
    if (!capabilities.authenticated) {
      setDialog("auth");
      return;
    }
    setShareBusy(true);
    try {
      if (!savedProjectId) {
        await useEditor.getState().enqueueSave();
        const state = useEditor.getState();
        if (state.serverHead !== state.scene.revision.id)
          throw new Error(
            "Save this revision to the local library before sharing.",
          );
        savedProjectId = state.projectId!;
        revisionId = state.serverHead!;
      }
      const result = await post("/shares", {
        projectId: savedProjectId,
        revisionId,
      });
      setDialog(null);
      setShareUrl(new URL(result.url, location.origin).href);
    } catch (e) {
      useEditor.setState({
        notice: e instanceof Error ? e.message : "Sharing failed.",
      });
    } finally {
      setShareBusy(false);
    }
  };
  return (
    <div className="studio">
      <header className="topbar">
        <h1 className="sr-only">Living Poster Studio</h1>
        <a className="brand" href="/" aria-label="Living Poster home">
          <span className="brand-icon">
            L<span>p</span>
            <i />
          </span>
          <span>
            living<span>poster</span>
            <sup>STUDIO</sup>
          </span>
        </a>
        <div className="topbar-divider" />
        <div className="project-title">
          <input
            aria-label="Project name"
            value={name}
            onBlur={() => void renameProject()}
            maxLength={100}
            onChange={(e) => useEditor.setState({ name: e.target.value })}
          />
          <button
            aria-label="Open project library"
            disabled={!capabilities}
            onClick={() =>
              setDialog(capabilities?.authenticated ? "library" : "auth")
            }
          >
            <ChevronDown size={13} />
          </button>
          <span className="save-status">
            <i
              className={
                saveState.includes("conflict") || saveState.includes("Offline")
                  ? "warning"
                  : ""
              }
            />
            {saveState}
          </span>
        </div>
        <div className="topbar-actions">
          <div className="history-actions">
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo (Ctrl Z)"
              disabled={!past}
              onClick={() => useEditor.getState().undo()}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo (Ctrl Shift Z)"
              disabled={!future}
              onClick={() => useEditor.getState().redo()}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <button
            className="button library-button"
            disabled={!capabilities}
            onClick={() =>
              setDialog(capabilities?.authenticated ? "library" : "auth")
            }
          >
            <FolderOpen size={14} />
            Library
          </button>
          <button
            className="button save-button"
            disabled={!capabilities}
            onClick={() => void save()}
          >
            Save
          </button>
          <button
            className="button"
            disabled={shareBusy || !capabilities}
            onClick={() => void share()}
          >
            <Link size={14} />
            Share
          </button>
          <button
            className="button primary"
            onClick={() => setDialog("export")}
          >
            <Download size={14} />
            Export
            <ArrowUpRight size={13} />
          </button>
          <button
            className="icon-button settings-button"
            aria-label="Studio settings"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
      <nav className="mobile-view-nav" aria-label="Studio views">
        {[
          ["canvas", "Canvas"],
          ["layers", "Layers"],
          ["tools", "Tools"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={mobileView === id}
            onClick={() => setMobileView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className={`workspace mobile-view-${mobileView}`}>
        <LayersPanel
          ready={ready}
          onExamples={() => setDialog("examples")}
          onPick={() => setMobileView("tools")}
          onAdd={() => {
            setMobileView("tools");
            chooseTool("style");
          }}
        />
        <section className="center-column">
          <div className="canvas-toolbar">
            <div className="canvas-format-control">
              <select
                aria-label="Artboard format"
                value={
                  CANVAS_PRESETS.find(
                    (p) =>
                      p.width === scene.artboard.width &&
                      p.height === scene.artboard.height,
                  )?.id ?? "portrait"
                }
                onChange={(event) => {
                  const preset = CANVAS_PRESETS.find(
                    (p) => p.id === event.target.value,
                  )!;
                  useEditor.getState().commit((draft) => {
                    const revision = draft.revision;
                    Object.assign(
                      draft,
                      resizeScene(draft, preset.width, preset.height),
                    );
                    draft.revision = revision;
                  }, `Composition fitted to ${preset.label.toLowerCase()} canvas`);
                }}
              >
                {CANVAS_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} · {preset.width} × {preset.height}
                  </option>
                ))}
              </select>
              <button
                className={`edit-mode-button ${!playing && !recording ? "active" : ""}`}
                aria-pressed={!playing && !recording}
                onClick={() => useEditor.getState().enterEditMode()}
              >
                <Type size={12} /> Edit canvas
              </button>
            </div>
            <button onClick={() => setDialog("examples")}>
              New canvas
              <ArrowUpRight size={12} />
            </button>
          </div>
          <CanvasStage
            ready={ready}
            onEditText={() => {
              chooseTool("style");
              setMobileView("tools");
            }}
          />
        </section>
        <aside
          className="right-rail"
          aria-label="Layer properties and language editing"
        >
          <div className="tool-tabs" role="tablist" aria-label="Editing tools">
            {(
              [
                ["style", "Text & style"],
                ["layout", "Layout"],
                ["motion", "Motion"],
                ["ai", "AI"],
              ] as const
            ).map(([id, label], index) => (
              <button
                key={id}
                id={`tool-${id}`}
                role="tab"
                aria-selected={toolPanel === id}
                aria-controls="tools-panel"
                tabIndex={toolPanel === id ? 0 : -1}
                onClick={() => chooseTool(id)}
                onKeyDown={(event) => {
                  const ids = ["style", "layout", "motion", "ai"] as const;
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 3
                          : (index + (event.key === "ArrowRight" ? 1 : 3)) % 4;
                    chooseTool(ids[next]);
                    document.getElementById(`tool-${ids[next]}`)?.focus();
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id="tools-panel"
            className="tool-content"
            role="tabpanel"
            aria-labelledby={`tool-${toolPanel}`}
          >
            <div hidden={toolPanel === "ai"}>
              <Inspector
                panel={toolPanel === "ai" ? "style" : toolPanel}
                ready={ready}
              />
            </div>
            <div hidden={toolPanel !== "ai"}>
              <AiComposer
                capabilities={capabilities}
                onAuthenticate={() => {
                  if (!capabilities) return;
                  setDialog(
                    capabilities.runtime === "browser" ? "settings" : "auth",
                  );
                }}
              />
            </div>
          </div>
        </aside>
      </main>
      <Timeline onPreview={() => setMobileView("canvas")} />
      <div className="statusbar" role="status" aria-label="Studio status">
        <span>
          <i /> {notice || "A typography workbench for the way you feel."}
        </span>
        <span>
          {FONT_OPTIONS.length} font styles · {EXAMPLES.length} templates
        </span>
      </div>
      {fontError && (
        <div className="font-error" role="alert">
          Fonts could not load: {fontError}
          <button className="button" onClick={fonts}>
            Retry fonts
          </button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {notice}
      </div>
      {dialog === "auth" &&
        capabilities &&
        capabilities.runtime !== "browser" && (
          <AuthDialog
            capabilities={capabilities}
            onClose={close}
            onSuccess={() => {
              setDialog(null);
              void refreshCapabilities();
              useEditor.setState({
                notice:
                  "Local studio unlocked. Save your draft when you are ready.",
              });
            }}
          />
        )}
      {dialog === "library" && (
        <LibraryDialog
          onClose={close}
          onShare={(id, revision) => void share(id, revision)}
          portable={capabilities?.sharePolicy === "portable"}
        />
      )}
      {dialog === "export" && <ExportDialog onClose={close} />}
      {dialog === "examples" && (
        <Modal title="Templates & blank canvases" wide onClose={close}>
          <TemplateBrowser
            ready={ready}
            drafts={drafts}
            onClose={close}
            onBlank={() => setMobileView("layers")}
            onTemplate={() => setMobileView("canvas")}
          />
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="Inside the studio" onClose={close}>
          <div className="modal-body">
            <p className="modal-lead">Entirely yours.</p>
            <dl className="canvas-facts">
              <div>
                <dt>Edition</dt>
                <dd>
                  Free ·{" "}
                  {capabilities?.runtime === "browser" ? "browser" : "local"}
                </dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>
                  {capabilities?.runtime === "browser"
                    ? "This browser · IndexedDB"
                    : "SQLite + device recovery"}
                </dd>
              </div>
              <div>
                <dt>Language model</dt>
                <dd>{capabilities?.ai.model ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Model status</dt>
                <dd>{capabilities?.ai.available ? "Ready" : "Offline"}</dd>
              </div>
              <div>
                <dt>Library</dt>
                <dd>{capabilities?.authenticated ? "Unlocked" : "Locked"}</dd>
              </div>
            </dl>
            <p className="small-note">
              {capabilities?.runtime === "browser"
                ? "No password is needed here. Your library is saved in this browser profile. Export scene files to keep a backup or continue on another device."
                : "Share links work while this server is reachable. Download an HTML poster for a presentation that works anywhere, offline."}
            </p>
            {capabilities?.runtime === "browser" && (
              <HostedConnector
                capabilities={capabilities}
                onChanged={refreshCapabilities}
              />
            )}
            <div className="settings-actions">
              <button
                className="button"
                onClick={() => void refreshCapabilities()}
              >
                Refresh connection
              </button>
              <label className="button">
                <Upload size={14} />
                Import scene
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 262144)
                        throw new Error("Scene file exceeds 256 KiB.");
                      const scene = validateScene(
                        JSON.parse(await file.text()),
                      );
                      if (!useEditor.getState().replace(scene)) return;
                      useEditor.setState({
                        name: file.name.replace(/\.json$/, ""),
                      });
                      close();
                    } catch (error) {
                      useEditor.setState({
                        notice:
                          error instanceof Error
                            ? error.message
                            : "Invalid scene file",
                      });
                      close();
                    }
                  }}
                />
              </label>
              {capabilities?.authenticated &&
                capabilities?.runtime !== "browser" && (
                  <button
                    className="button"
                    onClick={async () => {
                      await post("/auth/logout", {});
                      await refreshCapabilities();
                      close();
                    }}
                  >
                    Lock studio
                  </button>
                )}
            </div>
            <p className="small-note">
              Bundled typefaces:{" "}
              {new Set(FONT_OPTIONS.map((font) => font.familyLabel)).size} free
              families, {FONT_OPTIONS.length} styles.{" "}
              <a href="/fonts/LICENSES.txt" target="_blank" rel="noreferrer">
                Font licenses
              </a>
              .
            </p>
          </div>
        </Modal>
      )}
      {shareUrl && (
        <Modal title="A poster worth sharing" onClose={close}>
          <div className="modal-body">
            <p className="muted">
              This link presents one saved revision. Your future edits stay in
              the studio.
            </p>
            <a
              className="share-link"
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
            >
              {shareUrl}
              <ArrowUpRight size={16} />
            </a>
            <button
              className="button primary full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  useEditor.setState({ notice: "Share link copied" });
                } catch {
                  useEditor.setState({
                    notice: "Select and copy the link above.",
                  });
                }
              }}
            >
              <Copy size={14} />
              Copy link
            </button>
            <p className="small-note">
              {capabilities?.sharePolicy === "portable"
                ? "Anyone with this link can open this snapshot. The link contains the poster and cannot be revoked after sharing."
                : "The local server must be reachable by your audience. Use an HTML export for offline sharing."}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function Presentation({ token }: { token: string }) {
  const [data, setData] = useState<{ scene: Scene; title: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(
      !matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  const canvas = useRef<HTMLCanvasElement>(null),
    time = useRef(0);
  useEffect(() => {
    void Promise.all([
      api(`/presentations/${encodeURIComponent(token)}`),
      loadFonts(),
    ])
      .then(([result]) => {
        validateScene(result.scene);
        setData(result);
        document.title = result.title + " · Living Poster";
      })
      .catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => {
    if (!data) return;
    let id = 0,
      last = performance.now();
    try {
      const compiled = compileScene(data.scene);
      const draw = (now: number) => {
        if (playing && !document.hidden)
          time.current =
            (time.current + Math.min(now - last, 100)) %
            data.scene.timeline.durationMs;
        last = now;
        const ctx = canvas.current?.getContext("2d");
        if (ctx)
          paintFrame(
            ctx,
            evaluateScene(compiled, {
              timeMs: time.current,
              pointer: samplePointer(data.scene, time.current),
            }),
            1,
          );
        id = requestAnimationFrame(draw);
      };
      id = requestAnimationFrame(draw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Presentation unavailable");
    }
    return () => cancelAnimationFrame(id);
  }, [data, playing]);
  return (
    <main className="presentation">
      <div className="presentation-brand">
        living poster <span>PRESENTATION</span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p>Opening the poster…</p>
      ) : (
        <>
          <canvas
            width={data.scene.artboard.width}
            height={data.scene.artboard.height}
            ref={canvas}
            aria-label={data.title}
          />
          <p className="sr-only">
            {data.scene.layers
              .filter((l) => l.kind === "text")
              .map((l) => l.text)
              .join(". ")}
          </p>
          <div className="presentation-controls">
            <span>{data.title}</span>
            <button className="button" onClick={() => setPlaying(!playing)}>
              {playing ? "Pause" : "Play"}
            </button>
            <button
              className="button"
              onClick={() => {
                time.current = 0;
              }}
            >
              Restart
            </button>
          </div>
        </>
      )}
    </main>
  );
}
