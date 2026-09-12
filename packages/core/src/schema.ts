import { z } from "zod";
import { FONT_MANIFEST } from "./font-manifest";

export const FONT_IDS = [
  "space-regular",
  "space-bold",
  "fraunces-regular",
  "fraunces-bold",
  "mono-regular",
  "mono-bold",
] as const;
export const FontIdSchema = z.enum(FONT_IDS);
export type FontId = z.infer<typeof FontIdSchema>;
const number = z.number().finite();
const id = z.string().min(1).max(100);
const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour");
export const LayoutSchema = z
  .object({
    x: number.min(0).max(1080),
    y: number.min(0).max(1350),
    rotationDeg: number.min(-180).max(180),
  })
  .strict();
export const AnchorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("point"),
      x: number.min(0).max(1080),
      y: number.min(0).max(1350),
    })
    .strict(),
  z.object({ type: z.literal("layer"), layerId: id }).strict(),
]);
const common = {
  id,
  enabled: z.boolean(),
  startMs: number.min(0),
  endMs: number.min(200),
};
const layerScope = z.literal("layer");
export const BehaviorSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...common,
      type: z.literal("float"),
      scope: layerScope,
      params: z
        .object({
          amplitudeX: number.min(0).max(80),
          amplitudeY: number.min(0).max(80),
          cycles: number.int().min(1).max(4),
          phase: number.min(0).max(Math.PI * 2),
          rotationAmplitudeDeg: number.min(0).max(10),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("orbit"),
      scope: layerScope,
      params: z
        .object({
          anchor: AnchorSchema,
          direction: z.union([z.literal(-1), z.literal(1)]),
          cycles: number.int().min(1).max(3),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("wave"),
      scope: z.literal("glyph"),
      params: z
        .object({
          amplitude: number.min(0).max(60),
          cycles: number.int().min(1).max(4),
          wavelength: number.min(2).max(24),
          phase: number.min(0).max(Math.PI * 2),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("scatter"),
      scope: z.enum(["layer", "glyph"]),
      params: z
        .object({
          radius: number.min(0).max(180),
          rotationMaxDeg: number.min(0).max(25),
          outEnd: number.min(0.1).max(0.35),
          returnStart: number.min(0.35).max(0.65),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("attract"),
      scope: layerScope,
      params: z
        .object({
          anchor: AnchorSchema,
          strength: number.min(0).max(1),
          maxDistance: number.min(0).max(180),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("repel"),
      scope: layerScope,
      params: z
        .object({
          radius: number.min(40).max(400),
          maxDistance: number.min(0).max(140),
        })
        .strict(),
    })
    .strict(),
]);
export type Behavior = z.infer<typeof BehaviorSchema>;
export type BehaviorType = Behavior["type"];
export type Anchor = z.infer<typeof AnchorSchema>;
const shared = {
  id,
  name: z.string().min(1).max(100),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: number.min(0).max(1),
  layout: LayoutSchema,
  behaviors: z.array(BehaviorSchema).max(6),
  fill: colour,
};
export const TypographySchema = z
  .object({
    fontId: FontIdSchema,
    fontSize: number.min(12).max(300),
    lineHeight: number.min(0.9).max(1.8),
    trackingEm: number.min(-0.03).max(0.2),
    align: z.enum(["left", "center", "right"]),
  })
  .strict();
export const TextLayerSchema = z
  .object({
    ...shared,
    ...TypographySchema.shape,
    kind: z.literal("text"),
    text: z.string().max(4096),
  })
  .strict();
export const ShapeLayerSchema = z
  .object({
    ...shared,
    kind: z.literal("shape"),
    shape: z.enum(["rect", "ellipse"]),
    width: number.min(4).max(640),
    height: number.min(4).max(640),
    cornerRadius: number.min(0).max(80).optional(),
  })
  .strict();
export const LayerSchema = z.discriminatedUnion("kind", [
  TextLayerSchema,
  ShapeLayerSchema,
]);
export type Layer = z.infer<typeof LayerSchema>;
export type TextLayer = z.infer<typeof TextLayerSchema>;
export type ShapeLayer = z.infer<typeof ShapeLayerSchema>;
export const PointerSampleSchema = z
  .object({
    x: number.min(0).max(1080),
    y: number.min(0).max(1350),
    presence: number.min(0).max(1),
  })
  .strict();
export const RecordedSampleSchema = PointerSampleSchema.extend({
  timeMs: number.min(0).max(10000),
}).strict();
export type PointerSample = z.infer<typeof PointerSampleSchema>;
export type RecordedSample = z.infer<typeof RecordedSampleSchema>;
export const PointerSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("disabled") }).strict(),
  z.object({ mode: z.literal("fixed"), sample: PointerSampleSchema }).strict(),
  z
    .object({
      mode: z.literal("recorded"),
      samples: z.array(RecordedSampleSchema).min(2).max(601),
      seamPolicy: z.literal("blend-250ms"),
    })
    .strict(),
]);
const RawSceneSchema = z
  .object({
    schemaVersion: z.literal(1),
    rendererVersion: z.literal("1.0.0"),
    id,
    revision: z.object({ id, parentId: id.nullable() }).strict(),
    seed: number.int().min(0).max(4294967295),
    artboard: z
      .object({
        width: z.literal(1080),
        height: z.literal(1350),
        background: colour,
      })
      .strict(),
    timeline: z
      .object({
        durationMs: number.int().min(2000).max(10000).multipleOf(100),
        fps: z.literal(30),
        loop: z.literal(true),
      })
      .strict(),
    fonts: z
      .array(
        z
          .object({ id: FontIdSchema, assetHash: z.literal("bundled-v1") })
          .strict(),
      )
      .min(1)
      .max(6),
    layers: z.array(LayerSchema).max(64),
    pointer: PointerSchema,
  })
  .strict();
export type Scene = z.infer<typeof RawSceneSchema>;
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}
/** Exact cmap coverage of the shipped binaries, with no implicit font fallback. */
export function supportedText(
  text: string,
  fontId: FontId = "space-regular",
): boolean {
  return Array.from(text).every((c) => {
    const n = c.codePointAt(0)!;
    return (
      n === 10 ||
      (n >= 32 &&
        FONT_MANIFEST[fontId].coverage.some(
          ([start, end]) => n >= start && n <= end,
        ))
    );
  });
}
export const SceneSchema = RawSceneSchema.superRefine((s, ctx) => {
  const fail = (message: string, path: (string | number)[] = []) =>
    ctx.addIssue({ code: "custom", message, path });
  if (new TextEncoder().encode(JSON.stringify(s)).byteLength > 256 * 1024)
    fail("Scene exceeds 256 KiB");
  const ids = new Set<string>(),
    fontIds = new Set(s.fonts.map((f) => f.id));
  if (fontIds.size !== s.fonts.length) fail("Duplicate font ID", ["fonts"]);
  let totalGlyphs = 0,
    totalBehaviors = 0;
  for (const [i, l] of s.layers.entries()) {
    if (ids.has(l.id)) fail("Duplicate layer ID", ["layers", i, "id"]);
    ids.add(l.id);
    if (l.kind === "text") {
      const count = graphemes(l.text).length;
      totalGlyphs += count;
      if (count > 512)
        fail("Text exceeds 512 graphemes", ["layers", i, "text"]);
      if (!supportedText(l.text, l.fontId))
        fail(
          "Unsupported character: use the bundled Latin letters, numbers and punctuation",
          ["layers", i, "text"],
        );
      if (!fontIds.has(l.fontId))
        fail("Text font is absent from scene fonts", ["layers", i, "fontId"]);
    }
    if (
      l.kind === "shape" &&
      l.cornerRadius !== undefined &&
      (l.shape !== "rect" || l.cornerRadius > Math.min(l.width, l.height) / 2)
    )
      fail("Corner radius must fit a rectangle", ["layers", i, "cornerRadius"]);
    const types = new Set<string>();
    totalBehaviors += l.behaviors.length;
    for (const [j, b] of l.behaviors.entries()) {
      if (ids.has(b.id))
        fail("Duplicate ID", ["layers", i, "behaviors", j, "id"]);
      ids.add(b.id);
      if (types.has(b.type))
        fail("Only one behavior of each type per layer", [
          "layers",
          i,
          "behaviors",
          j,
        ]);
      types.add(b.type);
      if (b.endMs > s.timeline.durationMs || b.endMs - b.startMs < 200)
        fail("Behavior window must last at least 200 ms and fit the loop", [
          "layers",
          i,
          "behaviors",
          j,
        ]);
      if (l.kind !== "text" && b.scope === "glyph")
        fail("Glyph motion requires text", ["layers", i, "behaviors", j]);
      if (b.type === "scatter" && b.params.returnStart <= b.params.outEnd)
        fail("Scatter return must start after departure", [
          "layers",
          i,
          "behaviors",
          j,
        ]);
      if (b.type === "attract" || b.type === "orbit") {
        const a = b.params.anchor;
        const target =
          a.type === "layer" ? s.layers.find((x) => x.id === a.layerId) : null;
        if (a.type === "layer" && (!target || target.id === l.id))
          fail("Anchor must name another existing layer", [
            "layers",
            i,
            "behaviors",
            j,
            "params",
            "anchor",
          ]);
        const point = a.type === "point" ? a : target?.layout;
        if (
          b.type === "orbit" &&
          point &&
          Math.hypot(l.layout.x - point.x, l.layout.y - point.y) > 120
        )
          fail("Orbit radius exceeds 120 units; move the anchor closer", [
            "layers",
            i,
            "behaviors",
            j,
          ]);
      }
    }
  }
  if (totalGlyphs > 1024) fail("Scene exceeds 1,024 graphemes", ["layers"]);
  if (totalBehaviors > 256) fail("Scene exceeds 256 behaviors", ["layers"]);
  if (s.pointer.mode === "recorded") {
    const samples = s.pointer.samples,
      first = samples[0]!,
      last = samples[samples.length - 1]!;
    if (first.timeMs !== 0 || last.timeMs !== s.timeline.durationMs)
      fail("Recorded path must include zero and duration endpoints", [
        "pointer",
      ]);
    if (
      first.x !== last.x ||
      first.y !== last.y ||
      first.presence !== last.presence
    )
      fail("Recorded loop endpoints must match", ["pointer"]);
    if (samples.some((p, i) => i > 0 && p.timeMs <= samples[i - 1]!.timeMs))
      fail("Pointer timestamps must strictly increase", ["pointer"]);
  }
});
export function validateScene(value: unknown): Scene {
  return SceneSchema.parse(value);
}
export function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  // getRandomValues remains available on deliberate plain-HTTP LAN origins.
  // Use the same UUIDv4 entropy/version contract without relying on secure-context-only randomUUID.
  if (!globalThis.crypto?.getRandomValues)
    throw new Error("This browser cannot generate secure scene IDs.");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function cloneScene(scene: Scene): Scene {
  return structuredClone(scene);
}
export function reviseScene(scene: Scene): Scene {
  const next = cloneScene(scene);
  next.revision = { id: newId(), parentId: scene.revision.id };
  return next;
}
export function defaultBehavior(
  type: BehaviorType,
  durationMs: number,
  layer?: Layer,
): Behavior {
  const c = { id: newId(), enabled: true, startMs: 0, endMs: durationMs };
  switch (type) {
    case "float":
      return {
        ...c,
        type,
        scope: "layer",
        params: {
          amplitudeX: 16,
          amplitudeY: 28,
          cycles: 1,
          phase: 0,
          rotationAmplitudeDeg: 2,
        },
      };
    case "wave":
      return {
        ...c,
        type,
        scope: "glyph",
        params: { amplitude: 24, cycles: 2, wavelength: 8, phase: 0 },
      };
    case "scatter":
      return {
        ...c,
        type,
        scope: layer?.kind === "shape" ? "layer" : "glyph",
        params: {
          radius: 90,
          rotationMaxDeg: 15,
          outEnd: 0.18,
          returnStart: 0.38,
        },
      };
    case "attract":
      return {
        ...c,
        type,
        scope: "layer",
        params: {
          anchor: { type: "point", x: 540, y: 675 },
          strength: 0.6,
          maxDistance: 140,
        },
      };
    case "orbit":
      return {
        ...c,
        type,
        scope: "layer",
        params: {
          anchor: {
            type: "point",
            x: Math.max(16, (layer?.layout.x ?? 540) - 80),
            y: layer?.layout.y ?? 675,
          },
          direction: 1,
          cycles: 1,
        },
      };
    case "repel":
      return {
        ...c,
        type,
        scope: "layer",
        params: { radius: 280, maxDistance: 90 },
      };
  }
}
