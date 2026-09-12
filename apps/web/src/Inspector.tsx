import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Plus,
  Trash2,
  SlidersHorizontal,
  Type,
  Shapes,
} from "lucide-react";
import {
  BEHAVIOR_OPTIONS,
  CANVAS_PRESETS,
  resizeScene,
  defaultBehavior,
  type Behavior,
  type BehaviorType,
  type Layer,
  type TextLayer,
} from "../../../packages/core/src";
import { useEditor, updateLayer } from "./store";
import { MOTION_RECIPES, recipeBehaviors } from "./motion-recipes";
import { FontPicker } from "./FontPicker";
const invalidate = () => {
  useEditor.getState().enterEditMode();
  useEditor.setState((s) => ({ mutationEpoch: s.mutationEpoch + 1 }));
};
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
  readOnly = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => boolean | void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 1000) / 1000));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  const submit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(String(value));
      return;
    }
    const n = Number(draft);
    if (
      !Number.isFinite(n) ||
      !draft.trim() ||
      (min !== undefined && n < min) ||
      (max !== undefined && n > max)
    ) {
      setDraft(String(value));
      useEditor.setState({
        notice: `${label} must be ${min ?? "a number"}${max === undefined ? "" : ` to ${max}`}. The previous value is restored.`,
      });
      return;
    }
    if (n !== value && onChange(n) === false) setDraft(String(value));
    else if (n === value) setDraft(String(value));
  };
  return (
    <label className="field number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={label}
          readOnly={readOnly}
          aria-readonly={readOnly}
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={invalidate}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              setDraft(String(value));
              e.currentTarget.blur();
            }
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => boolean | void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const props = {
    value: draft,
    onFocus: invalidate,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: () => {
      if (draft !== value && onChange(draft) === false) setDraft(value);
    },
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} aria-label={label} {...props} />
      ) : (
        <input aria-label={label} {...props} />
      )}
    </label>
  );
}
export function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field colour-field">
      <span>{label}</span>
      <div>
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{value.toUpperCase()}</span>
      </div>
    </label>
  );
}
const motionNames: Record<BehaviorType, string> = {
  float: "Float",
  wave: "Letter wave",
  scatter: "Scatter & return",
  orbit: "Orbit",
  attract: "Attract",
  repel: "Pointer repel",
  pulse: "Pulse",
  pendulum: "Pendulum",
  bounce: "Bounce",
  reveal: "Reveal",
};
const paramNames: Record<string, string> = {
  amplitudeX: "Horizontal",
  amplitudeY: "Vertical",
  cycles: "Cycles",
  phase: "Phase",
  rotationAmplitudeDeg: "Sway",
  amplitude: "Amplitude",
  wavelength: "Wavelength",
  radius: "Radius",
  rotationMaxDeg: "Rotation",
  outEnd: "Departure",
  returnStart: "Return starts",
  strength: "Strength",
  maxDistance: "Max. distance",
  amount: "Scale amount",
  angleDeg: "Swing angle",
  height: "Bounce height",
  stagger: "Letter stagger",
  minOpacity: "Minimum opacity",
};
const ranges: Record<string, [number, number, number]> = {
  amplitudeX: [0, 80, 1],
  amplitudeY: [0, 80, 1],
  cycles: [1, 4, 1],
  phase: [0, 6.283, 0.1],
  rotationAmplitudeDeg: [0, 10, 0.5],
  amplitude: [0, 60, 1],
  wavelength: [2, 24, 1],
  radius: [0, 400, 1],
  rotationMaxDeg: [0, 25, 1],
  outEnd: [0.1, 0.35, 0.01],
  returnStart: [0.35, 0.65, 0.01],
  strength: [0, 1, 0.05],
  maxDistance: [0, 180, 1],
  amount: [0, 0.35, 0.01],
  angleDeg: [0, 25, 1],
  height: [0, 120, 1],
  stagger: [0, 1, 0.05],
  minOpacity: [0, 1, 0.05],
};
function MotionCard({ behavior, layer }: { behavior: Behavior; layer: Layer }) {
  const duration = useEditor((s) => s.scene.timeline.durationMs),
    layers = useEditor((s) => s.scene.layers),
    artboard = useEditor((s) => s.scene.artboard);
  const update = (fn: (b: Behavior) => void) =>
    updateLayer(
      layer.id,
      (l) => {
        const b = l.behaviors.find((b) => b.id === behavior.id);
        if (b) fn(b);
      },
      `Updated ${motionNames[behavior.type].toLowerCase()}`,
    );
  const anchor = "anchor" in behavior.params ? behavior.params.anchor : null;
  const controls =
    BEHAVIOR_OPTIONS.find((option) => option.type === behavior.type)
      ?.controls ?? [];
  return (
    <details className="motion-card">
      <summary>
        <span className="motion-dot" />
        {motionNames[behavior.type]}
        <ChevronDown size={13} />
      </summary>
      <div className="motion-content">
        <div className="motion-tools">
          <label className="check">
            <input
              type="checkbox"
              checked={behavior.enabled}
              onChange={(e) =>
                update((b) => {
                  b.enabled = e.target.checked;
                })
              }
            />
            Enabled
          </label>
          <button
            className="icon-button"
            title="Remove motion"
            aria-label={`Remove ${motionNames[behavior.type]}`}
            onClick={() =>
              updateLayer(layer.id, (l) => {
                l.behaviors = l.behaviors.filter((b) => b.id !== behavior.id);
              })
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
        <div className="field-grid">
          <NumberField
            label="Start"
            value={behavior.startMs / 1000}
            min={0}
            max={duration / 1000}
            step={0.1}
            unit="s"
            onChange={(v) =>
              update((b) => {
                b.startMs = Math.round(v * 1000);
              })
            }
          />
          <NumberField
            label="End"
            value={behavior.endMs / 1000}
            min={0.2}
            max={duration / 1000}
            step={0.1}
            unit="s"
            onChange={(v) =>
              update((b) => {
                b.endMs = Math.round(v * 1000);
              })
            }
          />
        </div>
        {["scatter", "bounce", "reveal"].includes(behavior.type) &&
          layer.kind === "text" && (
            <label className="field">
              <span>Apply to</span>
              <select
                value={behavior.scope}
                onChange={(e) =>
                  update((b) => {
                    if (
                      b.type === "scatter" ||
                      b.type === "bounce" ||
                      b.type === "reveal"
                    )
                      b.scope = e.target.value as "layer" | "glyph";
                  })
                }
              >
                <option value="glyph">Each letter</option>
                <option value="layer">Whole layer</option>
              </select>
            </label>
          )}
        <div className="field-grid">
          {Object.entries(behavior.params)
            .filter(([, value]) => typeof value === "number")
            .map(([key, value]) =>
              key === "direction" ? (
                <label className="field" key={key}>
                  <span>Direction</span>
                  <select
                    value={value as number}
                    onChange={(e) =>
                      update((b) => {
                        if (b.type === "orbit")
                          b.params.direction = Number(e.target.value) as -1 | 1;
                      })
                    }
                  >
                    <option value={1}>Clockwise</option>
                    <option value={-1}>Counterclockwise</option>
                  </select>
                </label>
              ) : (
                <NumberField
                  key={key}
                  label={paramNames[key] ?? key}
                  value={value as number}
                  min={
                    controls.find((control) => control.key === key)?.min ??
                    ranges[key]?.[0]
                  }
                  max={
                    controls.find((control) => control.key === key)?.max ??
                    ranges[key]?.[1]
                  }
                  step={
                    controls.find((control) => control.key === key)?.step ??
                    ranges[key]?.[2]
                  }
                  onChange={(v) =>
                    update((b) => {
                      (b.params as unknown as Record<string, unknown>)[key] = v;
                    })
                  }
                />
              ),
            )}
        </div>
        {anchor && (
          <>
            <label className="field">
              <span>Anchor</span>
              <select
                value={anchor.type === "point" ? "point" : anchor.layerId}
                onChange={(e) =>
                  update((b) => {
                    if ("anchor" in b.params)
                      b.params.anchor =
                        e.target.value === "point"
                          ? {
                              type: "point",
                              x: layer.layout.x - 60,
                              y: layer.layout.y,
                            }
                          : { type: "layer", layerId: e.target.value };
                  })
                }
              >
                <option value="point">Fixed point</option>
                {layers
                  .filter((l) => l.id !== layer.id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
            {anchor.type === "point" && (
              <div className="field-grid">
                <NumberField
                  label="Anchor X"
                  value={anchor.x}
                  min={0}
                  max={artboard.width}
                  onChange={(v) =>
                    update((b) => {
                      if (
                        "anchor" in b.params &&
                        b.params.anchor.type === "point"
                      )
                        b.params.anchor.x = v;
                    })
                  }
                />
                <NumberField
                  label="Anchor Y"
                  value={anchor.y}
                  min={0}
                  max={artboard.height}
                  onChange={(v) =>
                    update((b) => {
                      if (
                        "anchor" in b.params &&
                        b.params.anchor.type === "point"
                      )
                        b.params.anchor.y = v;
                    })
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
export function Inspector({
  panel,
  ready,
}: {
  panel: "style" | "layout" | "motion";
  ready: boolean;
}) {
  const selected = useEditor((s) => s.selected),
    scene = useEditor((s) => s.scene),
    layer = scene.layers.find((l) => l.id === selected[0]);
  const [addMotion, setAddMotion] = useState(false);
  const change = (fn: (l: Layer) => void) => {
    return layer ? updateLayer(layer.id, fn) : false;
  };
  const textChange = (fn: (l: TextLayer) => void) =>
    change((l) => {
      if (l.kind === "text") fn(l);
    });
  if (!layer)
    return (
      <div className="inspector-scroll">
        <div className="panel-heading">
          <SlidersHorizontal size={14} />
          <h2>Canvas</h2>
          <span>01</span>
        </div>
        <section className="inspector-section">
          <div className="section-caption">THE FOUNDATION</div>
          <label className="field">
            <span>Canvas format</span>
            <select
              aria-label="Canvas format"
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
                }, `Fitted composition to ${preset.label.toLowerCase()} canvas`);
              }}
            >
              {CANVAS_PRESETS.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.label} · {preset.width} × {preset.height}
                </option>
              ))}
            </select>
          </label>
          <ColourField
            label="Paper colour"
            value={scene.artboard.background}
            onChange={(value) =>
              useEditor.getState().commit((s) => {
                s.artboard.background = value;
              })
            }
          />
          <div className="field-grid">
            <NumberField
              label="Width"
              value={scene.artboard.width}
              readOnly
              unit="px"
              onChange={() => {}}
            />
            <NumberField
              label="Height"
              value={scene.artboard.height}
              readOnly
              unit="px"
              onChange={() => {}}
            />
          </div>
          <div className="info-note">
            Four formats. Endless character.
            <br />
            Select a layer to shape its type, colour and movement.
          </div>
        </section>
        <section className="inspector-section">
          <div className="section-caption">THE DETAILS</div>
          <dl className="canvas-facts">
            <div>
              <dt>Layers</dt>
              <dd>{scene.layers.length} / 64</dd>
            </div>
            <div>
              <dt>Motion</dt>
              <dd>
                {scene.layers.reduce((n, l) => n + l.behaviors.length, 0)}{" "}
                behaviours
              </dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>
                {CANVAS_PRESETS.find(
                  (p) =>
                    p.width === scene.artboard.width &&
                    p.height === scene.artboard.height,
                )?.label ?? "Custom"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    );
  return (
    <div className="inspector-scroll">
      <div className="panel-heading">
        {layer.kind === "text" ? <Type size={15} /> : <Shapes size={15} />}
        <h2>
          {selected.length > 1
            ? `${selected.length} layers selected`
            : layer.name}
        </h2>
        <span>{layer.kind}</span>
      </div>
      {selected.length > 1 && (
        <div className="info-note">
          Showing {layer.name}. Drag and nudge move all selected layers.
        </div>
      )}
      <section className="inspector-section" hidden={panel !== "layout"}>
        <TextField
          label="Layer name"
          value={layer.name}
          onChange={(v) =>
            change((l) => {
              l.name = v;
            })
          }
        />
      </section>
      <section
        className="inspector-section"
        hidden={panel !== "style" || layer.kind !== "text"}
      >
        {layer.kind === "text" && (
          <TextField
            label="Text"
            value={layer.text}
            multiline
            onChange={(v) =>
              textChange((l) => {
                l.text = v;
              })
            }
          />
        )}
      </section>
      <section className="inspector-section" hidden={panel !== "style"}>
        <div className="section-caption">
          {layer.kind === "text" ? "TYPOGRAPHY" : "SHAPE"}
        </div>
        {layer.kind === "text" ? (
          <>
            <FontPicker layer={layer} ready={ready} />
            <div className="field-grid">
              <NumberField
                label="Size"
                value={layer.fontSize}
                min={12}
                max={300}
                unit="px"
                onChange={(v) =>
                  textChange((l) => {
                    l.fontSize = v;
                  })
                }
              />
              <NumberField
                label="Line height"
                value={layer.lineHeight}
                min={0.9}
                max={1.8}
                step={0.05}
                onChange={(v) =>
                  textChange((l) => {
                    l.lineHeight = v;
                  })
                }
              />
              <NumberField
                label="Tracking"
                value={layer.trackingEm}
                min={-0.03}
                max={0.2}
                step={0.01}
                unit="em"
                onChange={(v) =>
                  textChange((l) => {
                    l.trackingEm = v;
                  })
                }
              />
              <label className="field">
                <span>Alignment</span>
                <select
                  value={layer.align}
                  onChange={(e) =>
                    textChange((l) => {
                      l.align = e.target.value as TextLayer["align"];
                    })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>Shape</span>
              <select
                value={layer.shape}
                onChange={(e) =>
                  change((l) => {
                    if (l.kind === "shape") {
                      l.shape = e.target.value as "rect" | "ellipse";
                      if (l.shape === "ellipse") delete l.cornerRadius;
                    }
                  })
                }
              >
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
              </select>
            </label>
            <div className="field-grid">
              <NumberField
                label="Width"
                value={layer.width}
                min={4}
                max={640}
                onChange={(v) =>
                  change((l) => {
                    if (l.kind === "shape") l.width = v;
                  })
                }
              />
              <NumberField
                label="Height"
                value={layer.height}
                min={4}
                max={640}
                onChange={(v) =>
                  change((l) => {
                    if (l.kind === "shape") l.height = v;
                  })
                }
              />
              {layer.shape === "rect" && (
                <NumberField
                  label="Corner radius"
                  value={layer.cornerRadius ?? 0}
                  min={0}
                  max={80}
                  onChange={(v) =>
                    change((l) => {
                      if (l.kind === "shape") l.cornerRadius = v;
                    })
                  }
                />
              )}
            </div>
          </>
        )}
        <div className="field-grid">
          <ColourField
            label="Fill"
            value={layer.fill}
            onChange={(v) =>
              change((l) => {
                l.fill = v;
              })
            }
          />
          <NumberField
            label="Opacity"
            value={layer.opacity * 100}
            min={0}
            max={100}
            unit="%"
            onChange={(v) =>
              change((l) => {
                l.opacity = v / 100;
              })
            }
          />
        </div>
      </section>
      <section className="inspector-section" hidden={panel !== "layout"}>
        <div className="section-caption">POSITION</div>
        <div className="field-grid">
          <NumberField
            label="X"
            value={layer.layout.x}
            unit="px"
            min={0}
            max={scene.artboard.width}
            onChange={(v) =>
              change((l) => {
                l.layout.x = v;
              })
            }
          />
          <NumberField
            label="Y"
            value={layer.layout.y}
            unit="px"
            min={0}
            max={scene.artboard.height}
            onChange={(v) =>
              change((l) => {
                l.layout.y = v;
              })
            }
          />
          <NumberField
            label="Rotation"
            value={layer.layout.rotationDeg}
            unit="°"
            min={-180}
            max={180}
            onChange={(v) =>
              change((l) => {
                l.layout.rotationDeg = v;
              })
            }
          />
        </div>
      </section>
      <section
        className="inspector-section"
        id="motion-recipes"
        hidden={panel !== "motion"}
      >
        <div className="section-caption">
          TRY A MOVEMENT <span>12 RECIPES</span>
        </div>
        <div className="motion-recipes">
          {MOTION_RECIPES.filter(
            (recipe) => !recipe.textOnly || layer.kind === "text",
          ).map((recipe) => (
            <button
              key={recipe.id}
              title={recipe.description}
              aria-label={`Apply ${recipe.label} animation`}
              onClick={() => {
                const applied = updateLayer(
                  layer.id,
                  (draft) => {
                    draft.behaviors = recipeBehaviors(
                      recipe.id,
                      draft,
                      scene.timeline.durationMs,
                      scene.artboard,
                    );
                  },
                  `${recipe.label} applied · click the canvas to edit, or Undo to restore the previous motion.`,
                );
                if (applied) {
                  useEditor.setState({
                    timeMs: 0,
                    ...(recipe.id === "repel" ? { livePointer: true } : {}),
                  });
                  useEditor.getState().setPlayback(true);
                }
              }}
            >
              <span aria-hidden="true">{recipe.symbol}</span>
              <span>{recipe.label}</span>
            </button>
          ))}
        </div>
        <p className="small-note">
          Replaces this layer’s motion. Click the canvas to pause and edit.
        </p>
      </section>
      <section className="inspector-section" hidden={panel !== "motion"}>
        <div className="section-caption">
          FINE-TUNE MOTION <span>{layer.behaviors.length}/10</span>
        </div>
        {layer.behaviors.map((b) => (
          <MotionCard key={b.id} behavior={b} layer={layer} />
        ))}
        <button
          className="button add-motion"
          disabled={layer.behaviors.length >= 10}
          onClick={() => setAddMotion(!addMotion)}
        >
          <Plus size={14} />
          Add behaviour
        </button>
        {addMotion && (
          <div className="motion-picker">
            {(Object.keys(motionNames) as BehaviorType[])
              .filter(
                (type) =>
                  !layer.behaviors.some((b) => b.type === type) &&
                  (layer.kind === "text" || type !== "wave"),
              )
              .map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    change((l) => {
                      l.behaviors.push(
                        defaultBehavior(
                          type,
                          scene.timeline.durationMs,
                          l,
                          scene.artboard,
                        ),
                      );
                    });
                    setAddMotion(false);
                  }}
                >
                  {motionNames[type]}
                  <Plus size={12} />
                </button>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
