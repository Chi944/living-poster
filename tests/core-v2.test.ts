import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  CANVAS_PRESETS,
  CURRENT_RENDERER_VERSION,
  EXAMPLES,
  BEHAVIOR_OPTIONS,
  cloneScene,
  compileScene,
  defaultBehavior,
  evaluateScene,
  hitTest,
  resizeScene,
  reviseScene,
  validateScene,
  type GlyphMeasurer,
  type Scene,
  type BehaviorType,
} from "../packages/core/src";

const measure: GlyphMeasurer = (_id, size, text) => ({
  width: size * 0.55 * text.length,
  left: 0,
  right: text === " " ? 0 : size * 0.52 * text.length,
  ascent: size * 0.72,
  descent: size * 0.02,
});
function fixture(type: BehaviorType): Scene {
  const scene = cloneScene(EXAMPLES[0]!.scene);
  scene.rendererVersion = CURRENT_RENDERER_VERSION;
  scene.layers = [
    {
      id: "title",
      kind: "text",
      name: "Headline",
      visible: true,
      locked: false,
      opacity: 1,
      layout: { x: 540, y: 700, rotationDeg: 0 },
      fill: "#FFFFFF",
      text: "ALIVE",
      fontId: "space-bold",
      fontSize: 130,
      lineHeight: 1,
      trackingEm: 0,
      align: "center",
      behaviors: [],
    },
  ];
  scene.layers[0]!.behaviors = [defaultBehavior(type, 6000, scene.layers[0])];
  return scene;
}
describe("extended deterministic motion", () => {
  it.each(["pulse", "pendulum", "bounce", "reveal"] as const)(
    "%s loops exactly and supports independent seeking",
    (type) => {
      const scene = fixture(type),
        compiled = compileScene(scene, measure);
      const at = (timeMs: number) =>
        evaluateScene(compiled, { timeMs, pointer: null });
      expect(at(6000)).toEqual(at(0));
      expect(at(600000)).toEqual(at(0));
      expect(at(2200)).not.toEqual(at(0));
      const expected = at(2917);
      for (const time of [5933, -10, 19, 4021]) at(time);
      expect(at(2917)).toEqual(expected);
      const endpoint = at(0);
      const almostEnd = at(6000 - 0.001);
      for (const [index, unit] of endpoint.units.entries()) {
        expect(almostEnd.units[index]!.x).toBeCloseTo(unit.x, 6);
        expect(almostEnd.units[index]!.y).toBeCloseTo(unit.y, 6);
        expect(almostEnd.units[index]!.opacity).toBeCloseTo(unit.opacity, 6);
        expect(almostEnd.units[index]!.scale).toBeCloseTo(unit.scale, 6);
      }
    },
  );
  it("pulse hit testing uses its rendered scale and grows around ink center", () => {
    const scene = fixture("pulse");
    const behavior = scene.layers[0]!.behaviors[0]!;
    if (behavior.type !== "pulse") throw Error();
    behavior.params = { amount: 0.35, cycles: 1 };
    const compiled = compileScene(scene, measure),
      base = evaluateScene(compiled, { timeMs: 0, pointer: null }),
      frame = evaluateScene(compiled, { timeMs: 3000, pointer: null });
    expect(frame.units[0]!.scale).toBeCloseTo(1.35);
    expect(frame.bounds.title!.width).toBeCloseTo(
      base.bounds.title!.width * 1.35,
    );
    expect(frame.bounds.title!.x + frame.bounds.title!.width / 2).toBeCloseTo(
      base.bounds.title!.x + base.bounds.title!.width / 2,
    );
    const first = frame.units[0]!;
    expect(hitTest(frame, first.x - first.width * 0.6, first.y)).toBe("title");
  });
  it("reveal staggers actual glyph opacity without mutating layer opacity", () => {
    const scene = fixture("reveal"),
      compiled = compileScene(scene, measure);
    const units = evaluateScene(compiled, {
      timeMs: 2200,
      pointer: null,
    }).units;
    expect(new Set(units.map((unit) => unit.opacity)).size).toBeGreaterThan(1);
    expect(
      units.every((unit) => unit.opacity >= 0.08 && unit.opacity <= 1),
    ).toBe(true);
    expect(scene.layers[0]!.opacity).toBe(1);
  });
  it("all ten behaviors compose within every format's bounds", () => {
    const scene = fixture("pulse"),
      layer = scene.layers[0]!;
    layer.behaviors = BEHAVIOR_OPTIONS.map((option) =>
      defaultBehavior(option.type, 6000, layer),
    );
    for (const preset of CANVAS_PRESETS) {
      const resized = resizeScene(scene, preset.width, preset.height),
        compiled = compileScene(resized, measure);
      fc.assert(
        fc.property(fc.integer({ min: -6000, max: 60000 }), (timeMs) => {
          const frame = evaluateScene(compiled, {
            timeMs,
            pointer: { x: preset.width / 2, y: preset.height / 2, presence: 1 },
          });
          expect(frame.width).toBe(preset.width);
          expect(frame.height).toBe(preset.height);
          for (const unit of frame.units) {
            expect(unit.bounds.x).toBeGreaterThanOrEqual(16 - 1e-6);
            expect(unit.bounds.y).toBeGreaterThanOrEqual(16 - 1e-6);
            expect(unit.bounds.x + unit.bounds.width).toBeLessThanOrEqual(
              preset.width - 16 + 1e-6,
            );
            expect(unit.bounds.y + unit.bounds.height).toBeLessThanOrEqual(
              preset.height - 16 + 1e-6,
            );
            expect(unit.opacity).toBeGreaterThanOrEqual(0);
            expect(unit.opacity).toBeLessThanOrEqual(1);
          }
        }),
        { numRuns: 80 },
      );
    }
  });
});
describe("canvas formats and renderer compatibility", () => {
  it("preserves legacy scenes and upgrades only a new revision", () => {
    const old = EXAMPLES[0]!.scene;
    expect(validateScene(old).rendererVersion).toBe("1.0.0");
    expect(reviseScene(old).rendererVersion).toBe("1.1.0");
    expect(old.rendererVersion).toBe("1.0.0");
  });
  it("keeps the six original examples and adds four distinct formatted compositions", () => {
    expect(EXAMPLES.slice(0, 6).map((example) => example.id)).toEqual([
      "gravity",
      "panic-return",
      "after-hours",
      "frequency",
      "small-worlds",
      "personal-space",
    ]);
    expect(
      new Set(
        EXAMPLES.slice(6).map(
          (example) =>
            `${example.scene.artboard.width}/${example.scene.artboard.height}`,
        ),
      ).size,
    ).toBe(4);
    for (const example of EXAMPLES.slice(6))
      expect(validateScene(example.scene).rendererVersion).toBe("1.1.0");
  });
  it("fits type, shapes, anchors and recorded pointers using one common transform", () => {
    const input = cloneScene(EXAMPLES[5]!.scene),
      original = cloneScene(input);
    const next = resizeScene(input, 1920, 1080),
      scale = (1080 - 32) / (1350 - 32),
      offsetX = (1920 - 1080 * scale) / 2,
      offsetY = (1080 - 1350 * scale) / 2;
    expect(input).toEqual(original);
    expect(next.revision.parentId).toBe(input.revision.id);
    expect(next.revision.id).not.toBe(input.revision.id);
    expect(next.layers.map((layer) => layer.id)).toEqual(
      input.layers.map((layer) => layer.id),
    );
    next.layers.forEach((layer, index) => {
      expect(layer.layout.x).toBeCloseTo(
        input.layers[index]!.layout.x * scale + offsetX,
      );
      expect(layer.layout.y).toBeCloseTo(
        input.layers[index]!.layout.y * scale + offsetY,
      );
    });
    if (next.pointer.mode !== "recorded" || input.pointer.mode !== "recorded")
      throw Error();
    expect(next.pointer.samples[3]!.x).toBeCloseTo(
      input.pointer.samples[3]!.x * scale + offsetX,
    );
    expect(next.pointer.samples.at(-1)).toEqual({
      ...next.pointer.samples[0],
      timeMs: next.timeline.durationMs,
    });
    const anchorInput = cloneScene(EXAMPLES[4]!.scene),
      anchorNext = resizeScene(anchorInput, 1920, 1080);
    const before = anchorInput.layers.find(
      (layer) => layer.id === "worlds-black-moon",
    )!.behaviors[0]!;
    const after = anchorNext.layers.find(
      (layer) => layer.id === "worlds-black-moon",
    )!.behaviors[0]!;
    if (
      before.type !== "orbit" ||
      after.type !== "orbit" ||
      before.params.anchor.type !== "point" ||
      after.params.anchor.type !== "point"
    )
      throw Error();
    expect(after.params.anchor.x).toBeCloseTo(
      before.params.anchor.x * scale + offsetX,
    );
  });
  it("validates positions against each scene's own dimensions", () => {
    const scene = resizeScene(fixture("bounce"), 1920, 1080);
    scene.layers[0]!.layout.x = 1700;
    expect(() => validateScene(scene)).not.toThrow();
    scene.layers[0]!.layout.y = 1200;
    expect(() => validateScene(scene)).toThrow(/outside the canvas/);
    expect(() => resizeScene(fixture("pulse"), 1200, 1200)).toThrow(
      /supported canvas/,
    );
  });
});
