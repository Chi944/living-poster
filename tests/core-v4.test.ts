import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  CANVAS_PRESETS,
  CURRENT_RENDERER_VERSION,
  EXAMPLES,
  applyOperations,
  cloneScene,
  closePointerLoop,
  compileScene,
  defaultBehavior,
  evaluateScene,
  hitTest,
  resizeScene,
  samplePointer,
  validateScene,
  type BehaviorType,
  type GlyphMeasurer,
  type PointerSample,
  type Scene,
} from "../packages/core/src";

const measure: GlyphMeasurer = (_id, size, text) => ({
  width: size * 0.55 * text.length,
  left: 0,
  right: text === " " ? 0 : size * 0.52 * text.length,
  ascent: size * 0.72,
  descent: size * 0.02,
});
function fixture(type: "pressure" | "pointerTurn", shape = false): Scene {
  const scene = cloneScene(EXAMPLES[0]!.scene);
  scene.rendererVersion = CURRENT_RENDERER_VERSION;
  const common = {
    id: "subject",
    name: "Subject",
    visible: true,
    locked: false,
    opacity: 1,
    fill: "#FFFFFF",
    layout: { x: 540, y: 700, rotationDeg: 0 },
    behaviors: [],
  };
  scene.layers = [
    shape
      ? { ...common, kind: "shape", shape: "rect", width: 180, height: 12 }
      : {
          ...common,
          kind: "text",
          text: "ALIVE",
          fontId: "space-bold",
          fontSize: 130,
          lineHeight: 1,
          trackingEm: 0,
          align: "center",
        },
  ];
  scene.layers[0]!.behaviors = [
    defaultBehavior(type, scene.timeline.durationMs, scene.layers[0]),
  ];
  scene.pointer = { mode: "disabled" };
  return scene;
}
function evaluator(scene: Scene) {
  const compiled = compileScene(scene, measure);
  return (pointer: PointerSample | null, timeMs = 0) =>
    evaluateScene(compiled, { timeMs, pointer });
}

describe("pointer pressure and turning", () => {
  it.each(["pressure", "pointerTurn"] as const)(
    "%s has neutral null, zero presence, distant, disabled and out-of-window inputs",
    (type) => {
      const scene = fixture(type),
        at = evaluator(scene),
        neutral = at(null),
        unit = neutral.units[2]!;
      expect(at({ x: unit.x, y: unit.y + 60, presence: 0 })).toEqual(neutral);
      expect(at({ x: 0, y: 0, presence: 1 })).toEqual(neutral);
      expect(at({ x: unit.x, y: unit.y + 60, presence: 1 })).not.toEqual(
        neutral,
      );
      scene.layers[0]!.behaviors[0]!.enabled = false;
      expect(evaluator(scene)({ x: unit.x, y: unit.y, presence: 1 })).toEqual(
        neutral,
      );
      const behavior = scene.layers[0]!.behaviors[0]!;
      behavior.enabled = true;
      behavior.startMs = 1000;
      behavior.endMs = 3000;
      const windowed = evaluator(scene),
        pointer = { x: unit.x, y: unit.y + 60, presence: 1 };
      expect(windowed(pointer, 999)).toEqual(neutral);
      expect(windowed(pointer, 1000)).not.toEqual(neutral);
      expect(windowed(pointer, 3000)).toEqual(neutral);
    },
  );

  it("pressure enlarges nearby glyphs around their ink centers with smooth falloff and accurate selection", () => {
    const scene = fixture("pressure"),
      at = evaluator(scene),
      base = at(null);
    const center = base.units[2]!;
    const exact = at({ x: center.x, y: center.y, presence: 1 });
    expect(exact.units[2]!.scale).toBeCloseTo(1.35);
    expect(exact.units[2]!.x).toBe(center.x);
    expect(exact.units[2]!.y).toBe(center.y);
    expect(exact.units[0]!.scale).toBeLessThan(exact.units[2]!.scale);
    expect(
      at({ x: center.x, y: center.y, presence: 0.5 }).units[2]!.scale,
    ).toBeCloseTo(1.175);
    expect(
      at({ x: center.x, y: center.y + 160, presence: 1 }).units[2]!.scale,
    ).toBeCloseTo(1.175);
    expect(
      at({ x: center.x, y: center.y + 320, presence: 1 }).units[2]!.scale,
    ).toBe(1);
    expect(hitTest(exact, center.x, center.y - center.height * 0.6)).toBe(
      "subject",
    );
    expect(hitTest(base, center.x, center.y - center.height * 0.6)).toBeNull();
  });

  it("turning is finite and continuous at the center and behind a line", () => {
    const at = evaluator(fixture("pointerTurn", true)),
      base = at(null),
      center = base.units[0]!;
    const atPoint = (x: number, y: number) =>
      at({ x, y, presence: 1 }).units[0]!;
    expect(atPoint(center.x, center.y)).toEqual(center);
    expect(atPoint(center.x + 70, center.y + 90).rotationDeg).toBeGreaterThan(
      0,
    );
    expect(atPoint(center.x + 70, center.y - 90).rotationDeg).toBeLessThan(0);
    expect(atPoint(center.x + 1e-7, center.y + 1e-7).rotationDeg).toBeCloseTo(
      0,
      5,
    );
    const above = atPoint(center.x - 80, center.y - 1e-7);
    const below = atPoint(center.x - 80, center.y + 1e-7);
    expect(above.rotationDeg).toBeCloseTo(below.rotationDeg, 8);
    expect(
      Object.values(above)
        .filter((v) => typeof v === "number")
        .every(Number.isFinite),
    ).toBe(true);
  });

  it.each([false, true])(
    "turning respects local orientation and hit tests (shape=%s)",
    (shape) => {
      const scene = fixture("pointerTurn", shape),
        at = evaluator(scene),
        base = at(null);
      const center = base.units[shape ? 0 : 2]!;
      const turned = at({ x: center.x + 60, y: center.y + 100, presence: 1 });
      const unit = turned.units[shape ? 0 : 2]!;
      expect(Math.abs(unit.rotationDeg)).toBeGreaterThan(0);
      expect(Math.abs(unit.rotationDeg)).toBeLessThanOrEqual(65);
      const a = (unit.rotationDeg * Math.PI) / 180;
      expect(
        hitTest(
          turned,
          unit.x + Math.cos(a) * unit.width * 0.4,
          unit.y + Math.sin(a) * unit.width * 0.4,
        ),
      ).toBe("subject");
      scene.layers[0]!.layout.rotationDeg = 90;
      const rotated = evaluator(scene),
        reference = rotated(null).units[shape ? 0 : 2]!;
      expect(
        rotated({ x: reference.x - 100, y: reference.y + 60, presence: 1 })
          .units[shape ? 0 : 2]!.rotationDeg,
      ).toBeGreaterThan(90);
    },
  );

  it("combines new and existing effects deterministically within every canvas", () => {
    const scene = fixture("pressure"),
      layer = scene.layers[0]!;
    layer.behaviors = (
      [
        "pressure",
        "pointerTurn",
        "pulse",
        "float",
        "wave",
        "scatter",
        "bounce",
        "pendulum",
        "reveal",
        "repel",
      ] as BehaviorType[]
    ).map((type) => defaultBehavior(type, 6000, layer));
    for (const preset of CANVAS_PRESETS) {
      const resized = resizeScene(scene, preset.width, preset.height),
        at = evaluator(resized);
      fc.assert(
        fc.property(
          fc.integer({ min: -6000, max: 60000 }),
          fc.integer({ min: 0, max: preset.width }),
          fc.integer({ min: 0, max: preset.height }),
          (timeMs, x, y) => {
            const pointer = { x, y, presence: 1 },
              frame = at(pointer, timeMs);
            at(null, 1234);
            expect(at(pointer, timeMs)).toEqual(frame);
            for (const unit of frame.units) {
              expect(unit.bounds.x).toBeGreaterThanOrEqual(16 - 1e-6);
              expect(unit.bounds.y).toBeGreaterThanOrEqual(16 - 1e-6);
              expect(unit.bounds.x + unit.bounds.width).toBeLessThanOrEqual(
                preset.width - 16 + 1e-6,
              );
              expect(unit.bounds.y + unit.bounds.height).toBeLessThanOrEqual(
                preset.height - 16 + 1e-6,
              );
            }
          },
        ),
        { numRuns: 60 },
      );
    }
  });

  it.each(["pressure", "pointerTurn"] as const)(
    "%s replays a recorded loop independently of seek order",
    (type) => {
      const scene = fixture(type);
      scene.pointer = {
        mode: "recorded",
        seamPolicy: "blend-250ms",
        samples: closePointerLoop(
          [
            { timeMs: 0, x: 440, y: 650, presence: 1 },
            { timeMs: 1800, x: 640, y: 550, presence: 1 },
            { timeMs: 4000, x: 520, y: 730, presence: 0.5 },
            { timeMs: 6000, x: 430, y: 600, presence: 1 },
          ],
          6000,
        ),
      };
      const at = evaluator(scene),
        sample = (t: number) => at(samplePointer(scene, t), t);
      const original = structuredClone(scene),
        expected = sample(2345);
      for (const t of [10000, -500, 6000, 0, 5750, 1]) sample(t);
      expect(sample(2345)).toEqual(expected);
      expect(sample(6000)).toEqual(sample(0));
      expect(sample(600000)).toEqual(sample(0));
      expect(scene).toEqual(original);
    },
  );

  it("preserves 1.2 fonts, requires 1.3 for new effects and applies operations atomically", () => {
    const scene = fixture("pressure");
    scene.layers[0]!.behaviors = [];
    scene.rendererVersion = "1.2.0";
    scene.fonts.push({ id: "archivo-black", assetHash: "bundled-v1" });
    expect(validateScene(scene).rendererVersion).toBe("1.2.0");
    const behavior = defaultBehavior("pressure", 6000, scene.layers[0]);
    const original = structuredClone(scene);
    const applied = applyOperations(scene, [
      { type: "upsertBehavior", layerId: "subject", behavior },
    ]).scene;
    expect(applied.rendererVersion).toBe("1.3.0");
    expect(scene).toEqual(original);
    for (const version of ["1.0.0", "1.1.0", "1.2.0"] as const) {
      const invalid = cloneScene(applied);
      invalid.rendererVersion = version;
      expect(() => validateScene(invalid)).toThrow(/require renderer 1.3.0/);
    }
    expect(() =>
      applyOperations(scene, [
        { type: "upsertBehavior", layerId: "subject", behavior },
        { type: "setOpacity", layerId: "missing", value: 0.5 },
      ]),
    ).toThrow(/does not exist/);
    expect(scene).toEqual(original);
  });

  it("rejects pressure on shapes and invalid tuning while scaling radius across formats", () => {
    expect(() => validateScene(fixture("pressure", true))).toThrow(
      /Glyph motion requires text/,
    );
    const scene = fixture("pressure"),
      behavior = scene.layers[0]!.behaviors[0]!;
    if (behavior.type !== "pressure") throw Error();
    behavior.params.amount = 0.61;
    expect(() => validateScene(scene)).toThrow();
    behavior.params.amount = 0.6;
    const resized = resizeScene(scene, 1920, 1080),
      next = resized.layers[0]!.behaviors[0]!;
    if (next.type !== "pressure") throw Error();
    expect(next.params.radius).toBeCloseTo((320 * (1080 - 32)) / (1350 - 32));
    expect(next.params.amount).toBe(0.6);
  });
});
