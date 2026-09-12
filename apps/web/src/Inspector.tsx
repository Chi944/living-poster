import { useEffect, useState } from "react";
import {
  ChevronDown,
  Plus,
  Trash2,
  SlidersHorizontal,
  Type,
  Shapes,
} from "lucide-react";
import {
  FONT_OPTIONS,
  defaultBehavior,
  type Behavior,
  type BehaviorType,
  type Layer,
  type TextLayer,
} from "../../../packages/core/src";
import { useEditor, updateLayer } from "./store";
const invalidate = () =>
  useEditor.setState((s) => ({ mutationEpoch: s.mutationEpoch + 1 }));
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
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 1000) / 1000));
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  const submit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && draft.trim() && n !== value) onChange(n);
    else setDraft(String(value));
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
  onChange: (v: string) => void;
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
      if (draft !== value) onChange(draft);
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
};
function MotionCard({ behavior, layer }: { behavior: Behavior; layer: Layer }) {
  const duration = useEditor((s) => s.scene.timeline.durationMs),
    layers = useEditor((s) => s.scene.layers);
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
  return (
    <details className="motion-card" open>
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
        {behavior.type === "scatter" && layer.kind === "text" && (
          <label className="field">
            <span>Apply to</span>
            <select
              value={behavior.scope}
              onChange={(e) =>
                update((b) => {
                  if (b.type === "scatter")
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
                  min={ranges[key]?.[0]}
                  max={ranges[key]?.[1]}
                  step={ranges[key]?.[2]}
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
                  max={1080}
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
                  max={1350}
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
export function Inspector() {
  const selected = useEditor((s) => s.selected),
    scene = useEditor((s) => s.scene),
    layer = scene.layers.find((l) => l.id === selected[0]);
  const [addMotion, setAddMotion] = useState(false);
  const change = (fn: (l: Layer) => void) => {
    if (layer) updateLayer(layer.id, fn);
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
              value={1080}
              readOnly
              unit="px"
              onChange={() => {}}
            />
            <NumberField
              label="Height"
              value={1350}
              readOnly
              unit="px"
              onChange={() => {}}
            />
          </div>
          <div className="info-note">
            One canvas. Endless character.
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
              <dd>Portrait · 4:5</dd>
            </div>
          </dl>
        </section>
        <div className="inspector-tip">
          <span>MAKE IT YOURS</span>
          <p>
            Start with a word.
            <br />
            Give it a little life.
          </p>
          <i>← Pick something on the canvas</i>
        </div>
      </div>
    );
  return (
    <div className="inspector-scroll">
      <div className="panel-heading">
        {layer.kind === "text" ? <Type size={15} /> : <Shapes size={15} />}
        <h2>
          {selected.length > 1
            ? `${selected.length} layers selected`
            : "Properties"}
        </h2>
        <span>{layer.kind}</span>
      </div>
      {selected.length > 1 && (
        <div className="info-note">
          Showing {layer.name}. Drag and nudge move all selected layers.
        </div>
      )}
      <section className="inspector-section">
        <TextField
          label="Layer name"
          value={layer.name}
          onChange={(v) =>
            change((l) => {
              l.name = v;
            })
          }
        />
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
      <section className="inspector-section">
        <div className="section-caption">
          {layer.kind === "text" ? "TYPOGRAPHY" : "SHAPE"}
        </div>
        {layer.kind === "text" ? (
          <>
            <label className="field">
              <span>Typeface</span>
              <select
                value={layer.fontId}
                onChange={(e) =>
                  useEditor.getState().commit((s) => {
                    const l = s.layers.find((x) => x.id === layer.id);
                    if (l?.kind === "text") {
                      l.fontId = e.target.value as TextLayer["fontId"];
                      if (!s.fonts.some((f) => f.id === l.fontId))
                        s.fonts.push({ id: l.fontId, assetHash: "bundled-v1" });
                    }
                  })
                }
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
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
      <section className="inspector-section">
        <div className="section-caption">POSITION</div>
        <div className="field-grid">
          <NumberField
            label="X"
            value={layer.layout.x}
            unit="px"
            min={0}
            max={1080}
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
            max={1350}
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
      <section className="inspector-section">
        <div className="section-caption">
          MOTION <span>{layer.behaviors.length}/6</span>
        </div>
        {layer.behaviors.map((b) => (
          <MotionCard key={b.id} behavior={b} layer={layer} />
        ))}
        <button
          className="button add-motion"
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
                        defaultBehavior(type, scene.timeline.durationMs, l),
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
