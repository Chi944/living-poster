# Scene format and motion rules

`packages/core/src/index.ts` is the public interface. Scene files contain the poster, font references, deterministic motion parameters, and saved pointer input. They contain no instruction history, sessions, asset URLs, generated code, or model configuration.

## Version and validation

The accepted format is `schemaVersion: 1`, `rendererVersion: "1.0.0"`. Newer versions fail validation; there is no implicit migration. Scene and nested objects use strict Zod schemas, so unknown properties fail instead of being silently discarded.

`validateScene(value)` performs structural and semantic validation in both Node and the browser. `compileScene(scene)` additionally checks font-dependent geometry in the browser. Compile only after `await loadFonts()`. The server does not substitute a second font rasterizer.

| Field | Accepted value |
|---|---|
| `id` | Stable, nonempty string of at most 100 characters; user-created IDs are UUIDs |
| `revision` | `{ id, parentId: string \| null }` |
| `seed` | Integer from 0 through 4,294,967,295 |
| `artboard` | `{ width: 1080, height: 1350, background: "#RRGGBB" }` |
| `timeline` | Duration 2,000–10,000 ms in 100 ms increments; `fps: 30`, `loop: true` |
| `fonts` | One to six unique `{ id, assetHash: "bundled-v1" }` references |
| `layers` | Ordered back-to-front array, at most 64 layers |
| `pointer` | Disabled, fixed, or a saved recorded loop |

The exact scene budget is **1,024 graphemes total**, at most 512 in one text layer. Spaces and line breaks count. Other limits are six behaviors per layer, one of each type, 256 behaviors total, 601 pointer samples, and 256 KiB of UTF-8 JSON. These are independent limits; meeting one does not bypass the others. Nonfinite numbers, duplicate layer/behavior IDs, missing anchors, unsupported fonts or characters, invalid ranges, and mismatched pointer endpoints fail validation.

Every base ink box must fit the artboard's 16-unit inset, including base rotation. The compiler reports which layer needs a smaller size, another line break, or a different position. Each individual drawn unit must also fit when rotated; the compiler uses its diagonal as a conservative orientation-independent size bound. Invalid geometry must be repaired before rendering or export.

## Layers and typography

Shared fields are `id`, `name`, `kind`, `visible`, `locked`, `opacity`, `layout`, `fill`, and `behaviors`. Names contain 1–100 characters. Opacity is 0–1. Fill is a six-digit hexadecimal color. Array order alone determines stacking.

`layout` contains `{ x, y, rotationDeg }`, with X in 0–1080, Y in 0–1350, and rotation in −180–180 degrees. These are base values and never receive evaluated animation offsets.

For a **text layer**, X is the alignment anchor and Y is the first line's alphabetic baseline. For a **shape layer**, X and Y are its center. Both are the layer pivot used by layer rotation, attraction, and orbit.

| Text field | Range or vocabulary |
|---|---|
| `text` | Exact supported text, explicit `\n` line breaks; no automatic wrapping |
| `fontId` | `space-regular`, `space-bold`, `fraunces-regular`, `fraunces-bold`, `mono-regular`, `mono-bold` |
| `fontSize` | 12–300 logical units |
| `lineHeight` | 0.9–1.8 times font size |
| `trackingEm` | −0.03–0.20 times font size, between graphemes |
| `align` | `left`, `center`, or `right` |

Shape layers use `shape: "rect" | "ellipse"`, with width and height each 4–640. Rectangles may have a `cornerRadius` from 0–80, no greater than half the shorter side. Ellipses cannot have a corner radius.

The three bundled families are Space Grotesk, Fraunces, and IBM Plex Mono, each in regular and bold. `font-manifest.ts` records SHA-256 and actual Unicode cmap ranges extracted from the six checked-in WOFF2 files. Character coverage is checked for the selected face, not merely against a font stylesheet's advertised Unicode range. Precomposed Latin accents and available punctuation work; unsupported characters produce a validation message. Text is never normalized or silently sent to a fallback font.

`loadFonts()` loads all six bundled faces. `loadFonts({ "space-bold": "data:font/woff2;base64,..." })` loads only the supplied faces; `loadFonts({})` loads none. It verifies bytes against the manifest before constructing and awaiting `FontFace`. The offline player decodes embedded bytes without making a network request.

Static and animated text use the same grapheme layout. `Intl.Segmenter` assigns stable indices, each grapheme is measured separately, and spaces advance without producing a paint unit. Native cross-grapheme kerning is disabled. A grapheme's ink box, rather than its advance width alone, determines its rotation center and bounds. Explicit line breaks advance by `fontSize × lineHeight`. Metrics are cached by face, size, and grapheme; evaluation never measures text.

## Behavior vocabulary

Every behavior has `id`, `type`, `enabled`, `scope`, `startMs`, `endMs`, and `params`. Windows last at least 200 ms and fit within the loop. Scope is fixed by the type except for scatter.

An anchor is either `{ type: "point", x, y }` or `{ type: "layer", layerId }`. A layer anchor always reads that layer's **base pivot**. It cannot name itself or a missing layer. Mutual base references have no recursive evaluation. Deleting an anchor removes dependent attraction/orbit behaviors in the same editor command.

Let `D` be duration, `t = ((timeMs % D) + D) % D`, and `u = (t − startMs) / (endMs − startMs)`. A disabled behavior or a time outside the half-open interval `[startMs, endMs)` contributes exactly zero. Define `S(v) = 3v² − 2v³` with V clamped to 0–1, and `E(u) = sin²(πu)`.

| Type | Parameters | Effect |
|---|---|---|
| `float` | `amplitudeX/Y` 0–80; integer `cycles` 1–4; `phase` 0–2π; `rotationAmplitudeDeg` 0–10 | Layer translation `E·(Ax·sin(2πcu+φ), Ay·cos(2πcu+φ))`; sway `E·a·sin(2πcu+φ)` |
| `orbit` | `anchor`; `direction` −1 or 1; integer `cycles` 1–3; base radius at most 120 | Rotate base pivot around anchor by `2π·direction·cycles·S(u)`; text orientation remains upright relative to its base rotation |
| `wave` | `amplitude` 0–60; integer `cycles` 1–4; `wavelength` 2–24; `phase` 0–2π | Text-only local Y translation `E·amplitude·sin(2πcu − 2πi/wavelength + φ)` |
| `scatter` | `radius` 0–180; `rotationMaxDeg` 0–25; `outEnd` 0.10–0.35; `returnStart` 0.35–0.65 and after `outEnd` | Stable seeded offset/angle multiplied by fast-departure, held, slow-return envelope; layer or glyph scope |
| `attract` | `anchor`; `strength` 0–1; `maxDistance` 0–180 | `E·strength·limitLength(anchor − basePivot, maxDistance)` |
| `repel` | `radius` 40–400; `maxDistance` 0–140 | Bounded softened displacement away from the pointer; layer scope |

Scatter's envelope is `S(u/outEnd)` before departure ends, 1 through `returnStart`, then `1 − S((u−returnStart)/(1−returnStart))`. FNV-1a followed by Mulberry32 is keyed by `(scene.seed, layer.id, behavior.id, graphemeIndex)`. Radius uses `sqrt(uniformSample)` for uniform disk sampling. Evaluation does not call `Math.random()`.

For repulsion, let `d = basePivot − pointer`, `r = |d|`. Translation is `E·presence·maxDistance·max(0,1−r/radius)²·d/sqrt(r²+16²)`. The 16-unit softening makes the response continuous as the pointer crosses the pivot. A missing pointer contributes zero.

Composition order is fixed:

1. Sum glyph wave/scatter translations in text-local axes; cap their length to 180.
2. Clamp common animated layer rotation to ±25 degrees. Clamp common plus glyph scatter rotation to ±25 degrees before creating transforms.
3. Rotate the glyph/shape about its ink center and the layer about its base pivot.
4. Sum layer translations in `float`, `orbit`, `scatter`, `attract`, `repel` order; cap their length to 240.
5. Translate each final rotated ink box into the 16-unit inset. Count these corrections in diagnostics.
6. Paint in layer order and clip to the artboard.

The safety projection may compress an arrangement near an edge; it never changes base layout or scales a glyph. Smooth timeline envelopes do not guarantee continuous velocity after safety projection or arbitrary live-pointer jumps.

## Pointer input and repeatability

Saved pointer forms are:

```ts
{ mode: 'disabled' }
{ mode: 'fixed', sample: { x, y, presence } }
{ mode: 'recorded', seamPolicy: 'blend-250ms', samples: [
  { timeMs: 0, x, y, presence }, /* increasing timestamps */
  { timeMs: durationMs, x, y, presence }
] }
```

Coordinates are in artboard units; presence is 0–1. Recorded timestamps strictly increase from exactly zero to duration. The final position/presence equals the initial sample. `samplePointer` linearly interpolates position and presence; seeking does not replay earlier frames.

`closePointerLoop(samples, durationMs)` preserves the first sample and samples before `D−250`. It replaces the final 250 ms with a saved smoothstep blend from the interpolated state at the exact seam boundary to the first sample. The seam contains 16 samples including its endpoints; earlier samples are reduced only when necessary to keep the 601-sample cap. Playback interpolates the persisted result, so preview and export agree. Matching endpoints do not imply universally continuous velocity.

Live pointer input is transient and overrides saved input only when explicitly selected. Exports choose saved input, a frozen pointer, or disabled input. A live interaction is not described as repeatable.

## Commands and public renderer interface

`applyOperations(scene, operations, { allowTextChanges })` accepts 1–20 operations, validates the entire batch against a clone, and returns `{ scene, affectedLayerIds, summary }`. The resulting revision is fresh and points to the previous revision. Any failure leaves the input scene untouched. Summaries and affected IDs come from the accepted diff.

Operations are `setLayout`, `setTypography`, `setFill`, `setOpacity`, `upsertBehavior`, `removeBehavior`, `setText`, and `reorderLayer`. An upsert matches an existing behavior ID; tuning existing motion retains that ID. Text edits require explicit wording permission and an exact `expectedOldText` match. IDs, arbitrary property paths, executable code, and full-scene replacements are not writable operation fields. `beforeLayerId: null` moves a layer to the end of the array, the front of paint order.

```ts
await loadFonts();
const compiled = compileScene(validateScene(sceneJson));
const pointer = samplePointer(compiled.scene, 2400);
const frame = evaluateScene(compiled, { timeMs: 2400, pointer });
paintFrame(canvasContext, frame, 1);
const selectedLayerId = hitTest(frame, x, y);
```

Frames contain `width`, `height`, solid `background`, ordered `units`, per-layer `bounds`, `baseBounds`, `boundsCorrections`, `glyphCount`, and `behaviorCount`. The same evaluator and painter power previews, PNGs, shares, and offline HTML. Given identical compiled scene, renderer/font build, absolute time, and pointer input, evaluated transforms are repeatable. Browser/OS text rasterization may differ; universal PNG byte identity is not claimed.

Verification: `tests/core.test.ts`, `node tests/core-browser-probe.mjs`, and `node tests/performance.mjs`. The browser probe checks actual bundled font geometry and loop endpoints for all six compositions and generates `tests/core-artifacts/gallery.png`.
