import { useRef, useState } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import { FONT_OPTIONS, type TextLayer } from "../../../packages/core/src";
import { useEditor } from "./store";
import { fitTypeface } from "./font-choice";

export function FontPicker({
  layer,
  ready,
}: {
  layer: TextLayer;
  ready: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [error, setError] = useState("");
  const current = FONT_OPTIONS.find((font) => font.id === layer.fontId)!;
  const matches = FONT_OPTIONS.filter(
    (font) =>
      (category === "all" || font.category === category) &&
      font.label.toLowerCase().includes(query.toLowerCase().trim()),
  ).sort(
    (a, b) => a.familyLabel.localeCompare(b.familyLabel) || a.weight - b.weight,
  );
  return (
    <>
      <div className="field">
        <span>Typeface</span>
        <button
          className="font-trigger"
          aria-label={`Choose typeface: ${current.label}`}
          aria-haspopup="dialog"
          disabled={!ready}
          onClick={() => {
            useEditor.getState().enterEditMode();
            setQuery("");
            setCategory("all");
            setError("");
            dialog.current?.showModal();
          }}
        >
          <span
            style={{ fontFamily: current.family, fontWeight: current.weight }}
          >
            {current.label}
          </span>
          <ChevronDown size={14} />
        </button>
      </div>
      <dialog
        ref={dialog}
        className="font-dialog"
        aria-label="Choose a typeface"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="font-dialog-inner">
          <header>
            <div>
              <h2>Choose a typeface</h2>
              <p>10 free families. Find your poster’s voice.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Close font picker"
              onClick={() => dialog.current?.close()}
            >
              <X size={18} />
            </button>
          </header>
          <div className="font-filters">
            <label className="search-field">
              <Search size={16} />
              <input
                autoFocus
                aria-label="Search fonts"
                placeholder="Search fonts…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Font category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {[
                ["all", "All styles"],
                ["sans", "Sans serif"],
                ["serif", "Serif"],
                ["mono", "Monospace"],
                ["display", "Display"],
                ["handwriting", "Handwriting"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="font-results">
            {matches.map((font) => (
              <button
                key={font.id}
                className={font.id === layer.fontId ? "selected" : ""}
                aria-label={`Use ${font.label}`}
                aria-pressed={font.id === layer.fontId}
                onClick={() => {
                  try {
                    const next = fitTypeface(
                      useEditor.getState().scene,
                      layer.id,
                      font.id,
                    );
                    const adjusted = next.layers.find(
                      (item) => item.id === layer.id,
                    ) as TextLayer;
                    const fitted = adjusted.fontSize < layer.fontSize;
                    if (
                      useEditor.getState().commit(
                        (draft) => {
                          const target = draft.layers.find(
                            (item) => item.id === layer.id,
                          );
                          if (target?.kind === "text") {
                            target.fontId = font.id;
                            target.fontSize = adjusted.fontSize;
                            draft.fonts = next.fonts;
                          }
                        },
                        `${font.label} applied${fitted ? ` · size fitted to ${adjusted.fontSize}px` : ""}`,
                      )
                    )
                      dialog.current?.close();
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "That typeface cannot fit this layer.",
                    );
                  }
                }}
              >
                <span className="font-meta">
                  {font.label}
                  {font.id === layer.fontId && <Check size={14} />}
                </span>
                <span
                  className="font-sample"
                  style={{ fontFamily: font.family, fontWeight: font.weight }}
                >
                  {layer.text.trim().split("\n")[0].slice(0, 24) ||
                    "Words in motion"}
                </span>
              </button>
            ))}
            {!matches.length && (
              <p className="empty-results">
                No matching fonts. Try another name or style.
              </p>
            )}
          </div>
          <footer>
            {error ? (
              <p role="alert">{error}</p>
            ) : (
              <p>
                All fonts are bundled and work offline. Wider type fits to your
                canvas automatically.
              </p>
            )}
          </footer>
        </div>
      </dialog>
    </>
  );
}
