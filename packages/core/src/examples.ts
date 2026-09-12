import {
  FONT_IDS,
  validateScene,
  type Scene,
  type Layer,
  type TextLayer,
  type ShapeLayer,
  type Behavior,
} from "./schema";
import { closePointerLoop } from "./pointer";
export interface PosterExample {
  id: string;
  title: string;
  description: string;
  suggestedInstruction: string;
  thumbnailTimeMs: number;
  scene: Scene;
}
function text(
  id: string,
  value: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  options: Partial<TextLayer> = {},
): TextLayer {
  return {
    id,
    name: id.replaceAll("-", " "),
    kind: "text",
    visible: true,
    locked: false,
    opacity: 1,
    layout: { x, y, rotationDeg: 0 },
    behaviors: [],
    text: value,
    fontId: "space-bold",
    fontSize: size,
    lineHeight: 1.05,
    trackingEm: -0.025,
    align: "left",
    fill,
    ...options,
  };
}
function shape(
  id: string,
  kind: "rect" | "ellipse",
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  options: Partial<ShapeLayer> = {},
): ShapeLayer {
  return {
    id,
    name: id.replaceAll("-", " "),
    kind: "shape",
    visible: true,
    locked: false,
    opacity: 1,
    layout: { x, y, rotationDeg: 0 },
    behaviors: [],
    shape: kind,
    width,
    height,
    fill,
    ...options,
  };
}
function motion(
  id: string,
  type: Behavior["type"],
  params: Behavior["params"],
  scope: "layer" | "glyph" = "layer",
): Behavior {
  return {
    id,
    type,
    enabled: true,
    startMs: 0,
    endMs: 6000,
    scope,
    params,
  } as Behavior;
}
function scene(
  id: string,
  background: string,
  layers: Layer[],
  seed: number,
): Scene {
  return validateScene({
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    id: `example-${id}`,
    revision: { id: `example-${id}-v1`, parentId: null },
    seed,
    artboard: { width: 1080, height: 1350, background },
    timeline: { durationMs: 6000, fps: 30, loop: true },
    fonts: FONT_IDS.map((id) => ({ id, assetHash: "bundled-v1" })),
    layers,
    pointer: { mode: "disabled" },
  });
}
const mono = { fontId: "mono-regular" as const, trackingEm: 0.015 };
const centered = { align: "center" as const };
const gravity = scene(
  "gravity",
  "#EFEDE4",
  [
    text("gravity-series", "STUDIES IN MOTION", 72, 100, 23, "#24251F", mono),
    text("gravity-edition", "01 / 06", 1008, 100, 23, "#24251F", {
      ...mono,
      align: "right",
    }),
    shape("gravity-top-rule", "rect", 540, 137, 640, 4, "#24251F"),
    shape("gravity-orbit-field", "ellipse", 540, 659, 520, 520, "#E5E2D8"),
    shape("gravity-orbit-cutout", "ellipse", 540, 659, 508, 508, "#EFEDE4"),
    text("satellite-everything", "EVERYTHING", 260, 385, 48, "#B73421", {
      layout: { x: 260, y: 385, rotationDeg: -12 },
      behaviors: [
        motion("everything-pull", "attract", {
          anchor: { type: "layer", layerId: "gravity-headline" },
          strength: 0.65,
          maxDistance: 150,
        }),
      ],
    }),
    text("satellite-comes", "COMES", 824, 486, 43, "#B73421", {
      layout: { x: 824, y: 486, rotationDeg: 14 },
      ...centered,
      behaviors: [
        motion("comes-pull", "attract", {
          anchor: { type: "layer", layerId: "gravity-headline" },
          strength: 0.72,
          maxDistance: 160,
        }),
      ],
    }),
    text("gravity-headline", "GRAVITY", 540, 765, 218, "#20211F", {
      name: "Gravity headline",
      ...centered,
    }),
    text("satellite-back", "BACK", 242, 936, 66, "#B73421", {
      layout: { x: 242, y: 936, rotationDeg: 8 },
      behaviors: [
        motion("back-pull", "attract", {
          anchor: { type: "layer", layerId: "gravity-headline" },
          strength: 0.6,
          maxDistance: 170,
        }),
      ],
    }),
    text("satellite-to-you", "TO YOU.", 790, 1030, 47, "#B73421", {
      layout: { x: 790, y: 1030, rotationDeg: -10 },
      ...centered,
      behaviors: [
        motion("to-you-pull", "attract", {
          anchor: { type: "layer", layerId: "gravity-headline" },
          strength: 0.68,
          maxDistance: 150,
        }),
      ],
    }),
    shape("gravity-footer-dot", "ellipse", 84, 1194, 22, 22, "#B73421"),
    text(
      "gravity-caption",
      "A STUDY OF INVISIBLE FORCES",
      119,
      1202,
      21,
      "#24251F",
      mono,
    ),
    text(
      "gravity-footnote",
      "WHAT HOLDS US TOGETHER?",
      72,
      1262,
      20,
      "#24251F",
      mono,
    ),
    text("gravity-loop-label", "6 SEC / LOOP", 1008, 1262, 20, "#24251F", {
      ...mono,
      align: "right",
    }),
  ],
  110031,
);
const panic = scene(
  "panic-return",
  "#E5F044",
  [
    text(
      "panic-serial",
      "AN EXERCISE IN LETTING GO",
      68,
      108,
      23,
      "#22261C",
      mono,
    ),
    text("panic-number", "02", 1008, 108, 26, "#22261C", {
      ...mono,
      align: "right",
    }),
    shape("panic-block", "rect", 91, 206, 42, 92, "#22261C"),
    text("panic-label", "LOSE YOUR COMPOSURE.", 139, 206, 23, "#22261C", mono),
    text(
      "panic-instruction",
      "FIND YOUR WAY BACK.",
      139,
      243,
      23,
      "#22261C",
      mono,
    ),
    text("panic-headline", "PANIC", 540, 588, 243, "#22261C", {
      ...centered,
      trackingEm: -0.03,
      behaviors: [
        motion(
          "panic-scatter",
          "scatter",
          { radius: 138, rotationMaxDeg: 22, outEnd: 0.13, returnStart: 0.37 },
          "glyph",
        ),
      ],
    }),
    text("return-headline", "RETURN", 540, 879, 211, "#22261C", {
      ...centered,
      trackingEm: -0.03,
      behaviors: [
        motion(
          "return-scatter",
          "scatter",
          { radius: 105, rotationMaxDeg: 16, outEnd: 0.2, returnStart: 0.4 },
          "glyph",
        ),
      ],
    }),
    text("panic-slash", "/", 540, 713, 63, "#22261C", {
      ...centered,
      fontId: "mono-regular",
    }),
    shape("panic-footer-rule", "rect", 540, 1083, 640, 4, "#22261C"),
    text(
      "panic-caption",
      "EVERY DEPARTURE IS TEMPORARY.",
      68,
      1162,
      25,
      "#22261C",
      mono,
    ),
    text("panic-footer", "FAST OUT. SLOW HOME.", 68, 1264, 22, "#22261C", mono),
    text("panic-time", "00:06", 1008, 1264, 22, "#22261C", {
      ...mono,
      align: "right",
    }),
  ],
  320241,
);
const afterHours = scene(
  "after-hours",
  "#101F3D",
  [
    text("after-hours-series", "LISTENING SESSIONS", 80, 109, 23, "#DEE6EE", {
      ...mono,
      trackingEm: 0.1,
    }),
    text("after-hours-number", "NO. 03", 1000, 109, 23, "#DEE6EE", {
      ...mono,
      align: "right",
    }),
    shape("after-hours-moon", "ellipse", 840, 320, 266, 266, "#DED9B6"),
    shape("after-hours-moon-shadow", "ellipse", 782, 277, 266, 266, "#101F3D"),
    text("after-headline", "After", 93, 543, 218, "#EDF0E8", {
      fontId: "fraunces-regular",
      trackingEm: -0.025,
      behaviors: [
        motion("after-float", "float", {
          amplitudeX: 12,
          amplitudeY: 28,
          cycles: 1,
          phase: 0,
          rotationAmplitudeDeg: 1.5,
        }),
      ],
    }),
    text("hours-headline", "Hours", 90, 780, 210, "#EDF0E8", {
      fontId: "fraunces-regular",
      trackingEm: -0.025,
      behaviors: [
        motion("hours-float", "float", {
          amplitudeX: 18,
          amplitudeY: 23,
          cycles: 1,
          phase: 1.2,
          rotationAmplitudeDeg: 1,
        }),
      ],
    }),
    text(
      "after-hours-note",
      "SOUND FOR THE SPACE BETWEEN DAYS.",
      86,
      949,
      21,
      "#A2B9D5",
      mono,
    ),
    shape("after-hours-rule", "rect", 320, 1031, 474, 4, "#7B91AD"),
    text(
      "after-hours-date",
      "SATURDAY / 21 NOVEMBER",
      86,
      1120,
      24,
      "#EDF0E8",
      mono,
    ),
    text("after-hours-time", "22:00 — LATE", 86, 1167, 24, "#EDF0E8", mono),
    text("after-hours-place", "THE QUIET ROOM", 86, 1262, 22, "#EDF0E8", mono),
    text("after-hours-city", "SINGAPORE", 994, 1262, 22, "#A2B9D5", {
      ...mono,
      align: "right",
    }),
  ],
  183477,
);
const frequency = scene(
  "frequency",
  "#214EE8",
  [
    text(
      "frequency-header",
      "TRANSMISSIONS / VOL. 04",
      68,
      104,
      22,
      "#FFFFFF",
      mono,
    ),
    text("frequency-band", "88—108", 1012, 104, 22, "#FFFFFF", {
      ...mono,
      align: "right",
    }),
    ...[0, 1, 2, 3, 4].flatMap((i) => [
      text(
        `frequency-line-${i + 1}`,
        "FREQUENCY",
        68,
        328 + i * 183,
        137,
        "#FFFFFF",
        {
          opacity: i === 2 ? 1 : 0.28 + i * 0.06,
          trackingEm: -0.03,
          behaviors: [
            motion(
              `frequency-wave-${i + 1}`,
              "wave",
              {
                amplitude: 24 + i * 4,
                cycles: 2,
                wavelength: 8,
                phase: i * 0.65,
              },
              "glyph",
            ),
          ],
        },
      ),
    ]),
    shape("frequency-rule-a", "rect", 365, 187, 594, 4, "#FFFFFF"),
    shape("frequency-rule-b", "rect", 882, 187, 260, 4, "#FFFFFF"),
    text(
      "frequency-footer",
      "FIND YOUR SIGNAL.",
      68,
      1267,
      24,
      "#FFFFFF",
      mono,
    ),
    text("frequency-loop", "CONTINUOUS / 06", 1012, 1267, 22, "#FFFFFF", {
      ...mono,
      align: "right",
    }),
  ],
  401813,
);
const worlds = scene(
  "small-worlds",
  "#DC783E",
  [
    text(
      "worlds-heading",
      "AN ATLAS OF THE EVERYDAY",
      71,
      102,
      22,
      "#35261F",
      mono,
    ),
    text("worlds-number", "05 / 06", 1009, 102, 22, "#35261F", {
      ...mono,
      align: "right",
    }),
    shape("worlds-main-orbit", "ellipse", 589, 521, 510, 510, "#B65334"),
    shape("worlds-main-cutout", "ellipse", 589, 521, 502, 502, "#DC783E"),
    shape("worlds-center", "ellipse", 589, 521, 288, 288, "#F5DC9C"),
    shape("worlds-inner", "ellipse", 589, 521, 172, 172, "#DB783E"),
    shape("worlds-black-moon", "ellipse", 336, 466, 136, 136, "#35261F", {
      behaviors: [
        motion("worlds-moon-orbit", "orbit", {
          anchor: { type: "point", x: 416, y: 466 },
          cycles: 1,
          direction: 1,
        }),
      ],
    }),
    shape("worlds-cream-moon", "ellipse", 827, 661, 72, 72, "#F5DC9C", {
      behaviors: [
        motion("worlds-small-orbit", "orbit", {
          anchor: { type: "point", x: 827, y: 581 },
          cycles: 1,
          direction: -1,
        }),
      ],
    }),
    text("worlds-label-01", "01", 177, 345, 24, "#35261F", mono),
    text("worlds-label-02", "02", 851, 455, 24, "#35261F", mono),
    text(
      "worlds-orbit-label",
      "EVERYTHING HAS AN ORBIT.",
      71,
      853,
      22,
      "#35261F",
      mono,
    ),
    text("worlds-small", "SMALL", 67, 1040, 180, "#35261F", {
      trackingEm: -0.03,
    }),
    text("worlds-worlds", "WORLDS", 67, 1216, 174, "#35261F", {
      trackingEm: -0.03,
    }),
    text("worlds-footer", "LOOK CLOSER.", 1009, 1287, 20, "#35261F", {
      ...mono,
      align: "right",
    }),
  ],
  561791,
);
const personal = scene(
  "personal-space",
  "#E9BEC9",
  [
    text("space-header", "A GENTLE BOUNDARY", 69, 107, 23, "#442A42", mono),
    text("space-edition", "06 / 06", 1009, 107, 23, "#442A42", {
      ...mono,
      align: "right",
    }),
    shape("space-field", "ellipse", 540, 690, 580, 580, "#DCA4B5"),
    shape("space-field-center", "ellipse", 540, 690, 564, 564, "#E9BEC9"),
    text("space-please", "PLEASE", 69, 356, 79, "#442A42", {
      behaviors: [
        motion("space-please-repel", "repel", { radius: 400, maxDistance: 95 }),
      ],
    }),
    text("space-personal", "PERSONAL", 540, 650, 162, "#442A42", {
      ...centered,
      trackingEm: -0.03,
      behaviors: [
        motion("personal-repel", "repel", { radius: 360, maxDistance: 115 }),
      ],
    }),
    text("space-space", "SPACE", 540, 845, 237, "#442A42", {
      ...centered,
      trackingEm: -0.03,
      behaviors: [
        motion("space-repel", "repel", { radius: 370, maxDistance: 135 }),
      ],
    }),
    text("space-thanks", "& THANK YOU.", 1009, 1059, 46, "#442A42", {
      align: "right",
      behaviors: [
        motion("thanks-repel", "repel", { radius: 330, maxDistance: 100 }),
      ],
    }),
    text(
      "space-footer",
      "MOVE THROUGH. MAKE ROOM.",
      69,
      1225,
      23,
      "#442A42",
      mono,
    ),
    text(
      "space-footnote",
      "INTERACTIVE STUDY / RECORDED LOOP",
      69,
      1280,
      19,
      "#442A42",
      mono,
    ),
  ],
  672187,
);
personal.pointer = {
  mode: "recorded",
  seamPolicy: "blend-250ms",
  samples: closePointerLoop(
    Array.from({ length: 121 }, (_, i) => ({
      timeMs: i * 50,
      x: 540 + 280 * Math.sin((i / 120) * Math.PI * 2),
      y: 700 + 230 * Math.cos((i / 120) * Math.PI * 2),
      presence: 1,
    })),
    6000,
  ),
};
export const EXAMPLES: PosterExample[] = [
  {
    id: "gravity",
    title: "GRAVITY",
    description: "Red satellite words drawn to a still, heavy center.",
    suggestedInstruction: "Make gravity pull the other words toward it.",
    thumbnailTimeMs: 0,
    scene: gravity,
  },
  {
    id: "panic-return",
    title: "PANIC / RETURN",
    description:
      "A fast departure, a slow return. Letters lose their composure.",
    suggestedInstruction:
      "Make PANIC scatter farther, but keep the footer still.",
    thumbnailTimeMs: 0,
    scene: panic,
  },
  {
    id: "after-hours",
    title: "AFTER HOURS",
    description:
      "A quiet midnight composition with a gently floating headline.",
    suggestedInstruction:
      "Let the headline float more slowly and keep the event details still.",
    thumbnailTimeMs: 0,
    scene: afterHours,
  },
  {
    id: "frequency",
    title: "FREQUENCY",
    description: "Five lines of cobalt and white, moving in travelling waves.",
    suggestedInstruction: "Make the middle FREQUENCY line wave more strongly.",
    thumbnailTimeMs: 0,
    scene: frequency,
  },
  {
    id: "small-worlds",
    title: "SMALL WORLDS",
    description: "Warm planetary geometry and two small, independent orbits.",
    suggestedInstruction: "Reverse the black moon’s orbit.",
    thumbnailTimeMs: 0,
    scene: worlds,
  },
  {
    id: "personal-space",
    title: "PERSONAL SPACE",
    description: "Oversized type gives a recorded pointer room to move.",
    suggestedInstruction: "Make PERSONAL react more strongly to the pointer.",
    thumbnailTimeMs: 0,
    scene: personal,
  },
];
