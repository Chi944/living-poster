import { describe, expect, it } from "vitest";
import {
  CANVAS_PRESETS,
  CURRENT_RENDERER_VERSION,
  EXAMPLES,
  compileScene,
  evaluateScene,
  resizeScene,
  samplePointer,
  validateScene,
  type GlyphMeasurer,
} from "../packages/core/src";

const interactive = EXAMPLES.filter((example) =>
  example.tags.includes("reel study"),
);
// Geometry with the real bundled fonts is checked by core-browser-probe.mjs.
const measure: GlyphMeasurer = (_fontId, size, value) => ({
  width: size * 0.4 * value.length,
  left: 0,
  right: value === " " ? 0 : size * 0.37 * value.length,
  ascent: size * 0.72,
  descent: size * 0.02,
});

describe("original interactive template studies", () => {
  it("appends the three new studies without moving the existing collection", () => {
    expect(EXAMPLES.slice(-3).map((example) => example.id)).toEqual([
      "under-pressure",
      "field-study",
      "open-studio",
    ]);
    expect(interactive).toHaveLength(3);
    expect(EXAMPLES[0]?.id).toBe("gravity");
    expect(EXAMPLES[21]?.id).toBe("make-some-noise");
    expect(
      EXAMPLES.slice(10, 22).every(
        (example) => example.scene.rendererVersion === "1.2.0",
      ),
    ).toBe(true);
    for (const example of interactive) {
      expect(example.scene.rendererVersion).toBe(CURRENT_RENDERER_VERSION);
      expect(example.tags).toContain("interactive");
      expect(example.scene.layers.every((layer) => !layer.locked)).toBe(true);
      expect(validateScene(example.scene)).toEqual(example.scene);
    }
  });

  it.each(interactive)(
    "$title plays a real recorded gesture in every canvas format",
    ({ scene }) => {
      expect(scene.pointer.mode).toBe("recorded");
      for (const preset of CANVAS_PRESETS) {
        const resized = resizeScene(scene, preset.width, preset.height);
        const compiled = compileScene(resized, measure);
        const frames = [0, 1139, 2999, 4749, 6000].map((timeMs) =>
          evaluateScene(compiled, {
            timeMs,
            pointer: samplePointer(resized, timeMs),
          }),
        );
        expect(frames[0]).toEqual(frames.at(-1));
        expect(frames[1]).not.toEqual(frames[0]);
        expect(frames.every((frame) => frame.boundsCorrections === 0)).toBe(
          true,
        );
        expect(samplePointer(resized, 1139)).not.toEqual(
          samplePointer(resized, 0),
        );
      }
    },
  );

  it("keeps the magnetic field bounded and its individual needles editable", () => {
    const field = interactive.find(
      (example) => example.id === "field-study",
    )!.scene;
    const needles = field.layers.filter((layer) =>
      layer.id.startsWith("needle-"),
    );
    expect(needles).toHaveLength(24);
    expect(field.layers.length).toBeLessThan(64);
    expect(
      field.layers.filter((layer) => layer.kind === "shape").length,
    ).toBeLessThanOrEqual(48);
    for (const needle of needles) {
      expect(needle.kind).toBe("shape");
      expect(needle.locked).toBe(false);
      expect(needle.behaviors).toEqual([
        expect.objectContaining({ type: "pointerTurn", scope: "layer" }),
      ]);
    }
  });

  it("moves the pass artwork together so its editable pieces stay aligned", () => {
    const pass = interactive.find(
      (example) => example.id === "open-studio",
    )!.scene;
    const floating = pass.layers.filter((layer) =>
      layer.behaviors.some((behavior) => behavior.type === "float"),
    );
    const cardFloat = floating.find((layer) => layer.id === "studio-pass-card")!
      .behaviors[0]!;
    expect(floating.length).toBeGreaterThan(10);
    for (const layer of floating)
      expect(
        layer.behaviors.find((behavior) => behavior.type === "float")?.params,
      ).toEqual(cardFloat.params);
    expect(cardFloat.params).toMatchObject({ rotationAmplitudeDeg: 0 });
  });
});
