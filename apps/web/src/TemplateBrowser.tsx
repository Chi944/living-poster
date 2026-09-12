import { useState } from "react";
import { ArrowLeft, ArrowRight, Search, Plus, FolderOpen } from "lucide-react";
import {
  CANVAS_PRESETS,
  EXAMPLES,
  TEMPLATE_CATEGORIES,
  cloneScene,
  newId,
  resizeScene,
} from "../../../packages/core/src";
import { PosterPreview } from "./CanvasStage";
import { useEditor } from "./store";
import type { ArchivedDraft } from "./drafts";

export function TemplateBrowser({
  ready,
  drafts,
  onClose,
  onBlank,
  onTemplate,
}: {
  ready: boolean;
  drafts: ArchivedDraft[];
  onClose: () => void;
  onBlank: () => void;
  onTemplate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const filtered = EXAMPLES.filter(
    (example) =>
      (format === "all" ||
        CANVAS_PRESETS.some(
          (preset) =>
            preset.id === format &&
            preset.width === example.scene.artboard.width &&
            preset.height === example.scene.artboard.height,
        )) &&
      (category === "all" || example.category === category) &&
      [example.title, example.description, ...example.tags]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const visiblePage = Math.min(page, pages - 1);
  return (
    <div className="modal-body template-browser">
      <div className="blank-canvases">
        {CANVAS_PRESETS.map((preset) => (
          <button
            key={preset.id}
            aria-label={`Create blank ${preset.label.toLowerCase()} canvas`}
            onClick={() => {
              const blank = cloneScene(EXAMPLES[0].scene);
              blank.id = newId();
              blank.layers = [];
              blank.pointer = { mode: "disabled" };
              if (
                !useEditor
                  .getState()
                  .replace(resizeScene(blank, preset.width, preset.height))
              )
                return;
              useEditor.setState({
                name: `Untitled ${preset.label.toLowerCase()}`,
                notice: "Blank canvas ready. Add text or a shape.",
              });
              onBlank();
              onClose();
            }}
          >
            <span
              className="blank-canvas-icon"
              style={{ aspectRatio: `${preset.width}/${preset.height}` }}
            >
              <Plus size={13} />
            </span>
            <span>
              <strong>Blank {preset.label.toLowerCase()}</strong>
              <small>
                {preset.width} × {preset.height}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="template-search-row">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search templates"
            placeholder="Search templates, moods, or occasions…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <div className="template-filter-row">
        <select
          aria-label="Filter templates by format"
          value={format}
          onChange={(event) => {
            setFormat(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">All formats</option>
          {CANVAS_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter templates by category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">All categories</option>
          {TEMPLATE_CATEGORIES.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <span aria-live="polite">{filtered.length} templates</span>
      </div>
      <div className="example-grid">
        {filtered.slice(visiblePage * 6, visiblePage * 6 + 6).map((example) => (
          <button
            key={example.id}
            onClick={() => {
              if (!useEditor.getState().replace(example.scene)) return;
              useEditor.setState({ name: example.title });
              onTemplate();
              onClose();
            }}
          >
            <div
              className="example-art"
              style={{ background: example.scene.artboard.background }}
            >
              {ready && (
                <PosterPreview
                  scene={example.scene}
                  timeMs={example.thumbnailTimeMs}
                />
              )}
            </div>
            <strong>{example.title}</strong>
            <small>
              {example.category} ·{" "}
              {
                CANVAS_PRESETS.find(
                  (preset) =>
                    preset.width === example.scene.artboard.width &&
                    preset.height === example.scene.artboard.height,
                )?.label
              }
            </small>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <p className="empty-results">
          No templates match. Try another search or clear the filters.
        </p>
      )}
      <div className="template-pagination">
        <button
          className="button"
          aria-label="Previous template page"
          disabled={visiblePage === 0}
          onClick={() => setPage(visiblePage - 1)}
        >
          <ArrowLeft size={14} />
          Previous
        </button>
        <span>
          Page {visiblePage + 1} of {pages}
        </span>
        <button
          className="button"
          aria-label="Next template page"
          disabled={visiblePage === pages - 1}
          onClick={() => setPage(visiblePage + 1)}
        >
          Next
          <ArrowRight size={14} />
        </button>
      </div>
      {drafts.length > 0 && (
        <details className="recovery-drawer">
          <summary>Recover a device draft</summary>
          <div className="recent-drafts">
            {drafts.slice(0, 8).map((draft) => (
              <button
                className="button"
                key={draft.documentId}
                onClick={() => {
                  if (!useEditor.getState().replace(draft.scene)) return;
                  useEditor.setState({
                    documentId: draft.documentId,
                    projectId: draft.projectId,
                    serverHead: draft.serverHead,
                    name: draft.name,
                    notice: "Recovered device draft",
                  });
                  onTemplate();
                  onClose();
                }}
              >
                <FolderOpen size={12} />
                {draft.name}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
