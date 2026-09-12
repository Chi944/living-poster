import {
  CURRENT_RENDERER_VERSION,
  validateScene,
  type Scene,
  type Layer,
  type TextLayer,
  type ShapeLayer,
  type Behavior,
} from "./schema";
import { closePointerLoop } from "./pointer";
export const TEMPLATE_CATEGORIES = [
  "Editorial",
  "Music",
  "Art & type",
  "Wellness",
  "Shop",
  "Playful",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export interface PosterExample {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
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
  format?: { width: number; height: number },
  rendererVersion?: Scene["rendererVersion"],
): Scene {
  return validateScene({
    schemaVersion: 1,
    rendererVersion: rendererVersion ?? (format ? "1.1.0" : "1.0.0"),
    id: `example-${id}`,
    revision: { id: `example-${id}-v1`, parentId: null },
    seed,
    artboard: { width: 1080, height: 1350, ...format, background },
    timeline: { durationMs: 6000, fps: 30, loop: true },
    fonts: [
      ...new Set(
        layers.flatMap((layer) =>
          layer.kind === "text" ? [layer.fontId] : [],
        ),
      ),
    ].map((id) => ({ id, assetHash: "bundled-v1" })),
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
const alive = scene(
  "feel-alive",
  "#192B2A",
  [
    text(
      "alive-header",
      "THE EVERYDAY IS EXTRAORDINARY",
      72,
      102,
      20,
      "#EDBA95",
      mono,
    ),
    shape("alive-halo", "ellipse", 540, 531, 640, 640, "#31534A", {
      behaviors: [
        motion("alive-halo-pulse", "pulse", { amount: 0.06, cycles: 2 }),
      ],
    }),
    text("alive-feel", "FEEL", 540, 489, 240, "#F6C9A5", {
      ...centered,
      behaviors: [
        motion("alive-feel-pulse", "pulse", { amount: 0.1, cycles: 2 }),
      ],
    }),
    text("alive-alive", "ALIVE", 540, 722, 218, "#F6C9A5", {
      ...centered,
      behaviors: [
        motion("alive-alive-pulse", "pulse", { amount: 0.1, cycles: 2 }),
      ],
    }),
    shape("alive-dot", "ellipse", 87, 961, 24, 24, "#E18866"),
    text(
      "alive-footer",
      "A LITTLE MORE, EVERY DAY.",
      121,
      969,
      20,
      "#EDBA95",
      mono,
    ),
    text("alive-time", "07 / 10", 1008, 1019, 18, "#EDBA95", {
      ...mono,
      align: "right",
    }),
  ],
  783161,
  { width: 1080, height: 1080 },
);
const takeTime = scene(
  "take-your-time",
  "#F0DEA0",
  [
    text(
      "time-header",
      "NOT EVERYTHING NEEDS TO HURRY.",
      90,
      99,
      24,
      "#382C2C",
      mono,
    ),
    text("time-edition", "STUDY 08 / 10", 1830, 99, 24, "#382C2C", {
      ...mono,
      align: "right",
    }),
    text("time-take", "TAKE", 90, 386, 230, "#382C2C"),
    text("time-your", "YOUR", 90, 620, 230, "#382C2C"),
    text("time-time", "TIME.", 90, 854, 230, "#382C2C"),
    shape("time-rule", "rect", 1002, 566, 4, 600, "#BFAA79"),
    shape("time-sun", "ellipse", 1453, 407, 260, 260, "#D26340", {
      behaviors: [
        motion("time-sun-pulse", "pulse", { amount: 0.08, cycles: 1 }),
      ],
    }),
    text("time-slow", "slow", 1453, 724, 197, "#382C2C", {
      ...centered,
      fontId: "fraunces-regular",
      trackingEm: -0.015,
      behaviors: [
        motion("time-slow-pendulum", "pendulum", { angleDeg: 15, cycles: 1 }),
      ],
    }),
    text("time-note", "THERE IS ROOM TO BREATHE.", 1453, 862, 21, "#382C2C", {
      ...mono,
      ...centered,
    }),
    text(
      "time-footer",
      "GOOD THINGS FIND THEIR OWN RHYTHM.",
      90,
      1004,
      22,
      "#382C2C",
      mono,
    ),
  ],
  834711,
  { width: 1920, height: 1080 },
);
const goodVibes = scene(
  "good-vibes",
  "#BDE9CA",
  [
    text(
      "vibes-header",
      "A DAILY DOSE OF OPTIMISM",
      77,
      124,
      24,
      "#283DCA",
      mono,
    ),
    text("vibes-edition", "09 / 10", 1003, 185, 22, "#283DCA", {
      ...mono,
      align: "right",
    }),
    shape("vibes-ball", "ellipse", 540, 338, 104, 104, "#F07457", {
      behaviors: [
        motion("vibes-ball-bounce", "bounce", {
          height: 70,
          cycles: 2,
          stagger: 0,
        }),
      ],
    }),
    ...["GOOD", "VIBES", "ONLY"].map((word, index) =>
      text(
        `vibes-word-${index}`,
        word,
        540,
        712 + index * 291,
        244,
        "#283DCA",
        {
          ...centered,
          behaviors: [
            motion(
              `vibes-bounce-${index}`,
              "bounce",
              {
                height: 80 - index * 8,
                cycles: 2,
                stagger: 0.55 + index * 0.1,
              },
              "glyph",
            ),
          ],
        },
      ),
    ),
    shape("vibes-footer-ball", "ellipse", 540, 1532, 54, 54, "#F07457", {
      behaviors: [
        motion("vibes-footer-pulse", "pulse", { amount: 0.22, cycles: 2 }),
      ],
    }),
    text("vibes-footer", "PASS THE FEELING ON.", 540, 1734, 28, "#283DCA", {
      ...mono,
      ...centered,
    }),
    text("vibes-note", "UPWARD. ONWARD. AGAIN.", 540, 1834, 20, "#283DCA", {
      ...mono,
      ...centered,
    }),
  ],
  928113,
  { width: 1080, height: 1920 },
);
const lessBetter = scene(
  "less-but-better",
  "#F0D9CC",
  [
    text(
      "less-header",
      "AN EXERCISE IN ESSENTIALS",
      86,
      112,
      21,
      "#7F3D30",
      mono,
    ),
    text("less-edition", "10 / 10", 994, 171, 20, "#7F3D30", {
      ...mono,
      align: "right",
    }),
    ...["Less.", "But", "better."].map((word, index) =>
      text(
        `less-word-${index}`,
        word,
        93,
        491 + index * 220,
        index === 2 ? 169 : 185,
        "#7F3D30",
        {
          fontId: "fraunces-regular",
          trackingEm: -0.025,
          behaviors: [
            motion(
              `less-reveal-${index}`,
              "reveal",
              { minOpacity: 0.08, stagger: 0.75 },
              "glyph",
            ),
          ],
        },
      ),
    ),
    shape("less-mark", "rect", 100, 1119, 16, 66, "#7F3D30"),
    text(
      "less-footer",
      "MAKE SPACE FOR WHAT MATTERS.",
      131,
      1118,
      21,
      "#7F3D30",
      mono,
    ),
    text(
      "less-note",
      "LET EVERYTHING ELSE GO.",
      131,
      1157,
      21,
      "#7F3D30",
      mono,
    ),
    text(
      "less-loop",
      "DISSOLVE / RESOLVE / REPEAT",
      86,
      1261,
      20,
      "#7F3D30",
      mono,
    ),
  ],
  1041811,
  { width: 1080, height: 1350 },
);
const portrait = { width: 1080, height: 1350 };
const square = { width: 1080, height: 1080 };
const story = { width: 1080, height: 1920 };
const landscape = { width: 1920, height: 1080 };
const dm = { fontId: "dm-regular" as const, trackingEm: 0 };
const book = { fontId: "baskerville-regular" as const, trackingEm: -0.015 };
const condensed = { fontId: "barlow-bold" as const, trackingEm: 0 };
const drift = (id: string, amplitudeY = 12) =>
  motion(id, "float", {
    amplitudeX: 0,
    amplitudeY,
    cycles: 1,
    phase: 0,
    rotationAmplitudeDeg: 0,
  });

const sundayEdit = scene(
  "sunday-edit",
  "#F3EEE3",
  [
    text("sunday-masthead", "THE WEEKEND JOURNAL", 78, 106, 25, "#203947", {
      ...dm,
      fontId: "dm-bold",
      trackingEm: 0.04,
    }),
    text("sunday-date", "ISSUE 018 / CULTURE", 1002, 106, 20, "#203947", {
      ...mono,
      align: "right",
    }),
    shape("sunday-rule-a", "rect", 390, 142, 626, 4, "#203947"),
    shape("sunday-rule-b", "rect", 855, 142, 294, 4, "#203947"),
    text("sunday-small-the", "The", 85, 283, 78, "#203947", {
      fontId: "playfair-regular",
    }),
    text("sunday-title", "Sunday", 72, 526, 218, "#203947", {
      fontId: "playfair-bold",
      behaviors: [drift("sunday-slow-drift", 10)],
    }),
    text("sunday-edit", "Edit.", 430, 742, 210, "#203947", {
      fontId: "playfair-regular",
    }),
    shape("sunday-orange-tab", "rect", 211, 690, 264, 90, "#D66C41", {
      layout: { x: 211, y: 690, rotationDeg: -6 },
    }),
    text("sunday-orange-copy", "TAKE YOUR TIME", 211, 699, 22, "#F3EEE3", {
      ...dm,
      fontId: "dm-bold",
      align: "center",
      layout: { x: 211, y: 699, rotationDeg: -6 },
    }),
    text(
      "sunday-deck",
      "Good stories.\nLong breakfasts.\nNo hurry.",
      84,
      934,
      45,
      "#203947",
      { ...book, lineHeight: 1.42 },
    ),
    text("sunday-column-label", "IN THIS EDITION", 666, 911, 19, "#9C492C", {
      ...dm,
      fontId: "dm-bold",
      trackingEm: 0.04,
    }),
    text(
      "sunday-column",
      "The art of noticing\nA table for two\nPlaces to get lost",
      666,
      968,
      27,
      "#203947",
      { ...dm, lineHeight: 1.8 },
    ),
    shape("sunday-footer-line", "rect", 390, 1213, 624, 4, "#203947"),
    text(
      "sunday-footer",
      "A SMALL PUBLICATION FOR A FULLER LIFE.",
      82,
      1270,
      20,
      "#203947",
      dm,
    ),
  ],
  1200101,
  portrait,
  CURRENT_RENDERER_VERSION,
);

const betweenLines = scene(
  "between-the-lines",
  "#D7DECA",
  [
    shape("lines-spine", "rect", 90, 658, 18, 640, "#632E42"),
    text(
      "lines-imprint",
      "OPEN BOOK / READING SERIES",
      153,
      115,
      22,
      "#632E42",
      dm,
    ),
    text("lines-number", "02", 994, 115, 27, "#632E42", {
      ...book,
      align: "right",
    }),
    text("lines-between", "Between", 153, 428, 140, "#632E42", {
      ...book,
      fontId: "baskerville-bold",
    }),
    text("lines-the", "the", 153, 590, 142, "#632E42", book),
    text("lines-lines", "lines.", 153, 754, 166, "#632E42", {
      ...book,
      behaviors: [
        motion(
          "lines-letter-reveal",
          "reveal",
          { minOpacity: 0.55, stagger: 0.55 },
          "glyph",
        ),
      ],
    }),
    text(
      "lines-margin-note",
      "There is a world\nin every pause.",
      622,
      905,
      49,
      "#632E42",
      {
        fontId: "caveat-regular",
        lineHeight: 1.02,
        layout: { x: 622, y: 905, rotationDeg: -7 },
        behaviors: [drift("lines-note-drift", 7)],
      },
    ),
    shape("lines-divider", "rect", 451, 1084, 594, 4, "#A1AE94"),
    text(
      "lines-event",
      "POETRY / CONVERSATION / TEA",
      153,
      1148,
      21,
      "#632E42",
      { ...dm, fontId: "dm-bold" },
    ),
    text(
      "lines-time",
      "THURSDAY 19:00\nTHE NEIGHBOURHOOD BOOKSHOP",
      153,
      1210,
      22,
      "#632E42",
      { ...dm, lineHeight: 1.55 },
    ),
  ],
  1200102,
  portrait,
  CURRENT_RENDERER_VERSION,
);

const formFunction = scene(
  "form-function",
  "#ECEAE3",
  [
    text("form-exhibition", "EXHIBITION / 014", 72, 102, 25, "#232320", mono),
    text("form-dates", "06.06—28.06", 1008, 102, 25, "#232320", {
      ...mono,
      align: "right",
    }),
    shape("form-red-tile", "rect", 235, 361, 328, 328, "#F04429", {
      behaviors: [
        motion("form-tile-swing", "pendulum", { angleDeg: 7, cycles: 1 }),
      ],
    }),
    shape("form-black-tile", "rect", 565, 361, 274, 274, "#232320"),
    shape("form-outline-top", "rect", 838, 224, 244, 12, "#232320"),
    shape("form-outline-side", "rect", 955, 355, 12, 274, "#232320"),
    shape("form-outline-bottom", "rect", 838, 486, 244, 12, "#232320"),
    text("form-headline", "FORM", 61, 803, 248, "#232320", {
      fontId: "archivo-black",
      trackingEm: -0.03,
    }),
    text("function-headline", "FUNCTION", 70, 1020, 205, "#232320", condensed),
    text("form-connector", "+", 948, 691, 112, "#F04429", {
      fontId: "dm-bold",
      align: "center",
    }),
    text(
      "form-deck",
      "AN OPEN QUESTION ABOUT USEFUL THINGS.",
      72,
      1120,
      22,
      "#232320",
      dm,
    ),
    shape("form-footer-block", "rect", 90, 1235, 36, 64, "#232320"),
    text(
      "form-footer",
      "DESIGN HALL\nFREE ENTRY / 10:00—18:00",
      126,
      1225,
      22,
      "#232320",
      { ...dm, lineHeight: 1.45 },
    ),
  ],
  1200103,
  portrait,
  CURRENT_RENDERER_VERSION,
);

const freshPress = scene(
  "fresh-press",
  "#F4BE51",
  [
    text("press-brand", "THE CORNER COFFEE CO.", 70, 99, 24, "#562C24", {
      ...dm,
      fontId: "dm-bold",
    }),
    text("press-first", "Fresh", 70, 354, 168, "#562C24", {
      fontId: "playfair-bold",
    }),
    text("press-second", "press.", 70, 520, 170, "#562C24", {
      fontId: "playfair-bold",
    }),
    text(
      "press-small",
      "A BETTER\nKIND OF\nWAKE-UP CALL.",
      76,
      659,
      28,
      "#562C24",
      { ...dm, fontId: "dm-bold", lineHeight: 1.3 },
    ),
    shape("press-saucer", "ellipse", 776, 831, 388, 61, "#D58836"),
    shape("press-handle", "ellipse", 948, 668, 125, 140, "#F8EAD0"),
    shape("press-handle-hole", "ellipse", 948, 668, 69, 88, "#F4BE51"),
    shape("press-cup", "rect", 777, 690, 294, 223, "#F8EAD0"),
    shape("press-cup-base", "ellipse", 777, 790, 294, 62, "#F8EAD0"),
    shape("press-coffee-rim", "ellipse", 777, 579, 294, 72, "#FFF5DC"),
    shape("press-coffee", "ellipse", 777, 579, 259, 45, "#562C24"),
    text("press-cup-symbol", "hello", 777, 714, 62, "#B55135", {
      fontId: "caveat-bold",
      align: "center",
    }),
    text("press-steam", "~", 766, 524, 80, "#FFF5DC", {
      fontId: "caveat-regular",
      align: "center",
      behaviors: [drift("press-steam-float", 18)],
    }),
    text(
      "press-footer",
      "SLOW BREW. GOOD COMPANY.",
      73,
      973,
      22,
      "#562C24",
      dm,
    ),
    text("press-hours", "DAILY / 07—17", 1004, 973, 20, "#562C24", {
      ...dm,
      align: "right",
    }),
  ],
  1200201,
  square,
  CURRENT_RENDERER_VERSION,
);

const objectsOfJoy = scene(
  "objects-of-joy",
  "#D8CBE7",
  [
    text(
      "objects-brand",
      "GOOD OBJECTS / NEW COLLECTION",
      70,
      98,
      22,
      "#31344F",
      { ...dm, fontId: "dm-bold", trackingEm: 0.03 },
    ),
    text("objects-title", "Objects", 67, 285, 146, "#31344F", {
      fontId: "dm-bold",
    }),
    text("objects-title-joy", "of joy.", 70, 436, 154, "#31344F", {
      fontId: "playfair-regular",
    }),
    shape("objects-plinth-a", "rect", 235, 795, 270, 88, "#C0AFD4"),
    shape("objects-plinth-b", "rect", 545, 795, 270, 88, "#C0AFD4"),
    shape("objects-plinth-c", "rect", 855, 795, 270, 88, "#C0AFD4"),
    shape("objects-bowl", "ellipse", 235, 706, 228, 130, "#E58955", {
      behaviors: [
        motion("objects-bowl-breathe", "pulse", { amount: 0.035, cycles: 1 }),
      ],
    }),
    shape("objects-vase", "rect", 545, 657, 134, 218, "#738D6E"),
    shape("objects-vase-mouth", "ellipse", 545, 548, 134, 32, "#31344F"),
    shape("objects-sculpture", "ellipse", 855, 664, 181, 181, "#F4ECCB"),
    shape("objects-sculpture-hole", "ellipse", 855, 664, 70, 70, "#D8CBE7"),
    text("objects-label-a", "01 / CLAY", 235, 888, 20, "#31344F", {
      ...dm,
      align: "center",
    }),
    text("objects-label-b", "02 / STEM", 545, 888, 20, "#31344F", {
      ...dm,
      align: "center",
    }),
    text("objects-label-c", "03 / LOOP", 855, 888, 20, "#31344F", {
      ...dm,
      align: "center",
    }),
    text(
      "objects-footer",
      "SMALL THINGS. WELL MADE. KEPT CLOSE.",
      70,
      996,
      22,
      "#31344F",
      dm,
    ),
  ],
  1200202,
  square,
  CURRENT_RENDERER_VERSION,
);

const playDate = scene(
  "play-date",
  "#4667CF",
  [
    text("play-host", "THE WEEKEND CLUB PRESENTS", 70, 99, 22, "#F8D9B4", {
      ...dm,
      fontId: "dm-bold",
    }),
    text("play-title", "play", 80, 370, 242, "#F8D9B4", {
      fontId: "nunito-bold",
      behaviors: [
        motion(
          "play-letter-bounce",
          "bounce",
          { height: 32, cycles: 2, stagger: 0.45 },
          "glyph",
        ),
      ],
    }),
    text("play-date-title", "date", 340, 622, 233, "#F8D9B4", {
      fontId: "nunito-bold",
    }),
    shape("play-eye-left", "ellipse", 157, 568, 32, 48, "#F8D9B4"),
    shape("play-eye-right", "ellipse", 243, 568, 32, 48, "#F8D9B4"),
    shape("play-smile", "ellipse", 200, 647, 130, 78, "#F8D9B4"),
    shape("play-smile-mask", "rect", 200, 615, 158, 65, "#4667CF"),
    text("play-note", "For kids of every age.", 70, 802, 53, "#F8D9B4", {
      fontId: "caveat-bold",
      layout: { x: 70, y: 802, rotationDeg: -3 },
    }),
    text(
      "play-details",
      "SATURDAY 10:00—16:00\nMAKE STUFF. MAKE FRIENDS.",
      70,
      919,
      24,
      "#F8D9B4",
      { ...dm, lineHeight: 1.55 },
    ),
    text("play-admission", "COME\nAS YOU\nARE.", 997, 856, 36, "#D9E986", {
      fontId: "nunito-bold",
      align: "right",
      lineHeight: 1.12,
    }),
  ],
  1200203,
  square,
  CURRENT_RENDERER_VERSION,
);

const nightGarden = scene(
  "night-garden",
  "#25293B",
  [
    text(
      "garden-presenter",
      "AFTER DARK / LIVE SESSIONS",
      80,
      123,
      24,
      "#D9CDEA",
      { ...dm, trackingEm: 0.05 },
    ),
    text("garden-night", "Night", 73, 397, 210, "#D9CDEA", {
      fontId: "playfair-regular",
    }),
    text("garden-title", "Garden", 73, 601, 183, "#D9CDEA", {
      fontId: "playfair-bold",
      behaviors: [drift("garden-title-drift", 9)],
    }),
    text(
      "garden-deck",
      "MUSIC THAT BLOOMS AFTER SUNSET.",
      80,
      716,
      23,
      "#A9B994",
      dm,
    ),
    shape("garden-stem", "rect", 546, 1132, 8, 590, "#A9B994"),
    ...[-48, 48].map((angle, i) =>
      shape(
        `garden-leaf-${i}`,
        "ellipse",
        447 + i * 196,
        1127 + i * 70,
        242,
        87,
        "#A9B994",
        { layout: { x: 447 + i * 196, y: 1127 + i * 70, rotationDeg: angle } },
      ),
    ),
    ...[0, 1, 2, 3].map((i) =>
      shape(
        `garden-petal-${i}`,
        "ellipse",
        546 + (i % 2 ? 76 : -76),
        889 + (i < 2 ? -60 : 60),
        220,
        150,
        "#D9CDEA",
        {
          layout: {
            x: 546 + (i % 2 ? 76 : -76),
            y: 889 + (i < 2 ? -60 : 60),
            rotationDeg: i % 2 ? 45 : -45,
          },
          behaviors: [
            motion(`garden-petal-breathe-${i}`, "pulse", {
              amount: 0.035,
              cycles: 1,
            }),
          ],
        },
      ),
    ),
    shape("garden-pollen", "ellipse", 546, 889, 90, 90, "#E6AB74"),
    text("garden-lineup-label", "IN THE GARDEN", 80, 1492, 22, "#A9B994", {
      ...dm,
      fontId: "dm-bold",
      trackingEm: 0.05,
    }),
    text(
      "garden-lineup",
      "LUNA PARK\nSLOW SIGNAL\nTHE NIGHTJARS",
      80,
      1570,
      42,
      "#D9CDEA",
      { ...dm, lineHeight: 1.38 },
    ),
    text(
      "garden-date",
      "FRIDAY 18 JUNE\n18:00—MIDNIGHT",
      998,
      1598,
      26,
      "#D9CDEA",
      { ...dm, align: "right", lineHeight: 1.65 },
    ),
    text(
      "garden-footer",
      "THE GLASSHOUSE / OPEN AIR",
      80,
      1825,
      23,
      "#A9B994",
      dm,
    ),
  ],
  1200301,
  story,
  CURRENT_RENDERER_VERSION,
);

const softMornings = scene(
  "soft-mornings",
  "#F0EEE3",
  [
    text("soft-host", "THE SLOW CLUB", 70, 129, 26, "#355E58", {
      ...dm,
      fontId: "dm-bold",
      trackingEm: 0.07,
    }),
    text("soft-title", "Soft", 90, 411, 258, "#355E58", {
      fontId: "caveat-regular",
    }),
    text("soft-title-two", "mornings", 80, 640, 220, "#355E58", {
      fontId: "caveat-regular",
      behaviors: [drift("soft-title-breathe", 8)],
    }),
    text(
      "soft-deck",
      "A LITTLE SPACE BEFORE THE DAY BEGINS.",
      80,
      777,
      23,
      "#355E58",
      dm,
    ),
    shape("soft-sun", "ellipse", 815, 958, 228, 228, "#DFC29C", {
      behaviors: [
        motion("soft-sun-pulse", "pulse", { amount: 0.07, cycles: 1 }),
      ],
    }),
    ...[0, 1, 2].flatMap((i) => [
      shape(
        `soft-step-dot-${i}`,
        "ellipse",
        112,
        1045 + i * 204,
        70,
        70,
        "#D6DFCD",
      ),
      text(
        `soft-step-number-${i}`,
        `0${i + 1}`,
        112,
        1056 + i * 204,
        24,
        "#355E58",
        { ...dm, align: "center" },
      ),
      text(
        `soft-step-title-${i}`,
        ["Breathe.", "Stretch.", "Begin again."][i]!,
        184,
        1061 + i * 204,
        58,
        "#355E58",
        { ...book, fontId: "baskerville-bold" },
      ),
      text(
        `soft-step-copy-${i}`,
        [
          "Nothing to catch up with.",
          "Give yourself some room.",
          "There is no perfect way.",
        ][i]!,
        184,
        1122 + i * 204,
        26,
        "#355E58",
        dm,
      ),
    ]),
    text("soft-time", "SUNDAY / 08:30", 80, 1740, 26, "#355E58", {
      ...dm,
      fontId: "dm-bold",
    }),
    text(
      "soft-footer",
      "BRING A MAT. LEAVE THE HURRY.",
      80,
      1803,
      23,
      "#355E58",
      dm,
    ),
  ],
  1200302,
  story,
  CURRENT_RENDERER_VERSION,
);

const studioSale = scene(
  "studio-sale",
  "#CF3D2D",
  [
    text("sale-brand", "STUDIO SUPPLY", 75, 123, 29, "#FFF0D8", {
      ...dm,
      fontId: "dm-bold",
      trackingEm: 0.05,
    }),
    text(
      "sale-caption",
      "GOOD THINGS / LESS SPEND",
      75,
      182,
      22,
      "#FFF0D8",
      dm,
    ),
    text("sale-studio", "STUDIO", 64, 501, 242, "#FFF0D8", condensed),
    text("sale-title", "SALE", 60, 786, 300, "#FFF0D8", condensed),
    shape("sale-ticket", "rect", 540, 1122, 620, 374, "#FFF0D8", {
      layout: { x: 540, y: 1122, rotationDeg: -4 },
    }),
    text("sale-up-to", "UP TO", 540, 1016, 32, "#CF3D2D", {
      ...dm,
      fontId: "dm-bold",
      align: "center",
      layout: { x: 540, y: 1016, rotationDeg: -4 },
    }),
    text("sale-discount", "40%", 540, 1225, 244, "#CF3D2D", {
      fontId: "archivo-black",
      align: "center",
      layout: { x: 540, y: 1225, rotationDeg: -4 },
      behaviors: [
        motion("sale-discount-pulse", "pulse", { amount: 0.035, cycles: 2 }),
      ],
    }),
    text("sale-stock", "PRINTS / OBJECTS / ONE-OFFS", 75, 1493, 29, "#FFF0D8", {
      ...dm,
      fontId: "dm-bold",
    }),
    text(
      "sale-details",
      "THREE DAYS ONLY\nFRIDAY—SUNDAY / 10:00—18:00",
      75,
      1590,
      27,
      "#FFF0D8",
      { ...dm, lineHeight: 1.55 },
    ),
    text("sale-note", "Find your next favourite.", 75, 1764, 60, "#FFF0D8", {
      fontId: "caveat-bold",
      layout: { x: 75, y: 1764, rotationDeg: -3 },
    }),
  ],
  1200303,
  story,
  CURRENT_RENDERER_VERSION,
);

const fieldNotes = scene(
  "field-notes",
  "#E7E8D9",
  [
    text(
      "field-volume",
      "THE EVERYDAY OBSERVER / VOL. 06",
      80,
      97,
      24,
      "#374C3B",
      { ...dm, fontId: "dm-bold", trackingEm: 0.035 },
    ),
    text("field-season", "EARLY SUMMER", 1838, 97, 23, "#374C3B", {
      ...dm,
      align: "right",
    }),
    text("field-title", "Field", 80, 356, 200, "#374C3B", {
      ...book,
      fontId: "baskerville-bold",
    }),
    text("field-title-notes", "notes.", 80, 582, 200, "#374C3B", book),
    text(
      "field-deck",
      "Walk slowly.\nLook carefully.\nBring a notebook.",
      80,
      743,
      42,
      "#374C3B",
      { ...book, lineHeight: 1.42 },
    ),
    shape("field-vertical-rule", "rect", 964, 573, 4, 640, "#A9B399"),
    ...[0, 1, 2].flatMap((i) => [
      shape(`field-stem-${i}`, "rect", 1174 + i * 246, 518, 7, 330, "#738A61"),
      shape(
        `field-leaf-left-${i}`,
        "ellipse",
        1139 + i * 246,
        470,
        135,
        61,
        i === 1 ? "#B78955" : "#738A61",
        { layout: { x: 1139 + i * 246, y: 470, rotationDeg: 45 } },
      ),
      shape(
        `field-leaf-right-${i}`,
        "ellipse",
        1209 + i * 246,
        395,
        135,
        61,
        i === 1 ? "#B78955" : "#738A61",
        {
          layout: { x: 1209 + i * 246, y: 395, rotationDeg: -45 },
          behaviors: [
            motion(`field-leaf-sway-${i}`, "pendulum", {
              angleDeg: 6,
              cycles: 1,
            }),
          ],
        },
      ),
      text(
        `field-label-${i}`,
        ["FIG. 01", "FIG. 02", "FIG. 03"][i]!,
        1174 + i * 246,
        769,
        21,
        "#374C3B",
        { ...dm, align: "center" },
      ),
    ]),
    text(
      "field-specimen-note",
      "Found on the way home.",
      1156,
      870,
      53,
      "#374C3B",
      { fontId: "caveat-regular" },
    ),
    text(
      "field-footer",
      "A JOURNAL OF SMALL DISCOVERIES",
      80,
      1009,
      22,
      "#374C3B",
      dm,
    ),
    text(
      "field-coordinate",
      "01°18′ N / 103°49′ E",
      1838,
      1009,
      21,
      "#374C3B",
      { ...mono, align: "right" },
    ),
  ],
  1200401,
  landscape,
  CURRENT_RENDERER_VERSION,
);

const offGrid = scene(
  "off-the-grid",
  "#DBEC55",
  [
    text("grid-event", "INDEPENDENT DESIGN ASSEMBLY", 80, 100, 27, "#242622", {
      ...dm,
      fontId: "dm-bold",
    }),
    text("grid-index", "FORMAT / 003", 1839, 100, 24, "#242622", {
      ...mono,
      align: "right",
    }),
    text("grid-off", "OFF", 60, 405, 300, "#242622", {
      fontId: "archivo-black",
    }),
    text("grid-the", "THE", 70, 639, 220, "#242622", {
      fontId: "archivo-black",
    }),
    text("grid-grid", "GRID", 60, 924, 300, "#242622", {
      fontId: "archivo-black",
      behaviors: [
        motion(
          "grid-scatter",
          "scatter",
          { radius: 18, rotationMaxDeg: 3, outEnd: 0.2, returnStart: 0.45 },
          "glyph",
        ),
      ],
    }),
    shape("grid-red-block", "rect", 1409, 440, 542, 415, "#E76444", {
      layout: { x: 1409, y: 440, rotationDeg: 4 },
    }),
    text("grid-number", "03", 1409, 534, 260, "#242622", {
      fontId: "barlow-bold",
      align: "center",
      layout: { x: 1409, y: 534, rotationDeg: 4 },
    }),
    text(
      "grid-details",
      "TALKS / TYPE / NEW IDEAS\nONE DAY. MANY DIRECTIONS.",
      1151,
      755,
      29,
      "#242622",
      { ...dm, fontId: "dm-bold", lineHeight: 1.65 },
    ),
    text(
      "grid-location",
      "WAREHOUSE 03\nSATURDAY / 09:30—19:00",
      1151,
      921,
      27,
      "#242622",
      { ...dm, lineHeight: 1.5 },
    ),
  ],
  1200402,
  landscape,
  CURRENT_RENDERER_VERSION,
);

const makeNoise = scene(
  "make-some-noise",
  "#ED8C48",
  [
    text("noise-series", "AMPLIFY / LIVE IN THE CITY", 80, 102, 25, "#273D9A", {
      ...dm,
      fontId: "dm-bold",
      trackingEm: 0.03,
    }),
    text("noise-date", "SATURDAY / 24 JULY", 1838, 102, 24, "#273D9A", {
      ...dm,
      align: "right",
    }),
    text("noise-make", "MAKE SOME", 70, 405, 247, "#273D9A", condensed),
    text("noise-title", "NOISE.", 60, 780, 300, "#273D9A", {
      fontId: "archivo-black",
      behaviors: [
        motion(
          "noise-travelling-wave",
          "wave",
          { amplitude: 18, cycles: 2, wavelength: 7, phase: 0 },
          "glyph",
        ),
      ],
    }),
    shape("noise-divider", "rect", 1365, 582, 6, 556, "#273D9A"),
    text("noise-lineup-label", "ON THE BILL", 1450, 385, 24, "#273D9A", {
      ...dm,
      fontId: "dm-bold",
    }),
    text(
      "noise-lineup",
      "WILDFLOWER\nRADIO CLUB\nBIG FEELINGS\nTHE STATIC",
      1450,
      461,
      31,
      "#273D9A",
      { ...dm, fontId: "dm-bold", lineHeight: 1.8 },
    ),
    text(
      "noise-door",
      "DOORS AT 17:00\nRIVERSIDE STAGE",
      1450,
      790,
      25,
      "#273D9A",
      { ...dm, lineHeight: 1.6 },
    ),
    text("noise-footer", "ALL TOGETHER NOW.", 80, 988, 62, "#273D9A", {
      fontId: "caveat-bold",
    }),
    text(
      "noise-ticket",
      "BRING YOUR LOUDEST FRIEND.",
      1838,
      993,
      22,
      "#273D9A",
      { ...dm, align: "right" },
    ),
  ],
  1200403,
  landscape,
  CURRENT_RENDERER_VERSION,
);

export const EXAMPLES: PosterExample[] = [
  {
    id: "gravity",
    title: "GRAVITY",
    category: "Art & type",
    tags: ["minimal", "typography", "attract", "cream", "red"],
    description: "Red satellite words drawn to a still, heavy center.",
    suggestedInstruction: "Make gravity pull the other words toward it.",
    thumbnailTimeMs: 0,
    scene: gravity,
  },
  {
    id: "panic-return",
    title: "PANIC / RETURN",
    category: "Art & type",
    tags: ["bold", "brutalist", "scatter", "yellow", "type"],
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
    category: "Music",
    tags: ["jazz", "night", "serif", "float", "blue", "event"],
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
    category: "Music",
    tags: ["radio", "wave", "repetition", "blue", "festival"],
    description: "Five lines of cobalt and white, moving in travelling waves.",
    suggestedInstruction: "Make the middle FREQUENCY line wave more strongly.",
    thumbnailTimeMs: 0,
    scene: frequency,
  },
  {
    id: "small-worlds",
    title: "SMALL WORLDS",
    category: "Art & type",
    tags: ["geometric", "orbit", "orange", "exhibition"],
    description: "Warm planetary geometry and two small, independent orbits.",
    suggestedInstruction: "Reverse the black moon’s orbit.",
    thumbnailTimeMs: 0,
    scene: worlds,
  },
  {
    id: "personal-space",
    title: "PERSONAL SPACE",
    category: "Wellness",
    tags: ["pink", "interactive", "repel", "boundaries", "type"],
    description: "Oversized type gives a recorded pointer room to move.",
    suggestedInstruction: "Make PERSONAL react more strongly to the pointer.",
    thumbnailTimeMs: 0,
    scene: personal,
  },
  {
    id: "feel-alive",
    title: "FEEL ALIVE",
    category: "Wellness",
    tags: ["green", "pulse", "breathing", "bold", "optimism"],
    description:
      "Warm peach type breathes over an evergreen halo. A square study in pulse.",
    suggestedInstruction: "Make FEEL pulse more strongly.",
    thumbnailTimeMs: 0,
    scene: alive,
  },
  {
    id: "take-your-time",
    title: "TAKE YOUR TIME",
    category: "Wellness",
    tags: ["yellow", "serif", "pendulum", "slow", "calm"],
    description:
      "A wide composition with a swaying serif and a patient, warm sun.",
    suggestedInstruction: "Make slow swing more gently.",
    thumbnailTimeMs: 0,
    scene: takeTime,
  },
  {
    id: "good-vibes",
    title: "GOOD VIBES",
    category: "Playful",
    tags: ["mint", "bounce", "optimism", "bold", "social"],
    description:
      "Mint, cobalt and letters that spring upward in a tall story format.",
    suggestedInstruction: "Make VIBES bounce higher.",
    thumbnailTimeMs: 0,
    scene: goodVibes,
  },
  {
    id: "less-but-better",
    title: "LESS, BUT BETTER",
    category: "Editorial",
    tags: ["minimal", "serif", "reveal", "quiet", "pink"],
    description:
      "A quiet sequence of serif letters dissolves and resolves, one by one.",
    suggestedInstruction: "Make better. reveal with less fading.",
    thumbnailTimeMs: 0,
    scene: lessBetter,
  },
  {
    id: "sunday-edit",
    title: "THE SUNDAY EDIT",
    category: "Editorial",
    tags: ["magazine", "journal", "serif", "cream", "culture", "weekend"],
    description:
      "An unhurried weekend journal, with oversized serif type and a warm editorial label.",
    suggestedInstruction:
      "Make Sunday float a little more and keep the article list still.",
    thumbnailTimeMs: 0,
    scene: sundayEdit,
  },
  {
    id: "between-the-lines",
    title: "BETWEEN THE LINES",
    category: "Editorial",
    tags: [
      "book",
      "poetry",
      "literary",
      "reading",
      "serif",
      "green",
      "handwritten",
    ],
    description:
      "A reading-room invitation with bookish type, a quiet spine and a handwritten margin note.",
    suggestedInstruction: "Make lines. reveal more gently.",
    thumbnailTimeMs: 0,
    scene: betweenLines,
  },
  {
    id: "form-function",
    title: "FORM / FUNCTION",
    category: "Art & type",
    tags: ["brutalist", "exhibition", "geometric", "design", "red", "bold"],
    description:
      "Modular red and black geometry meets emphatic exhibition typography.",
    suggestedInstruction: "Make the red tile sway more gently.",
    thumbnailTimeMs: 0,
    scene: formFunction,
  },
  {
    id: "fresh-press",
    title: "FRESH PRESS",
    category: "Shop",
    tags: [
      "coffee",
      "cafe",
      "food",
      "product",
      "yellow",
      "illustration",
      "serif",
    ],
    description:
      "A sunlit neighbourhood cafe card with a fully editable illustrated coffee cup.",
    suggestedInstruction: "Make the steam float higher.",
    thumbnailTimeMs: 0,
    scene: freshPress,
  },
  {
    id: "objects-of-joy",
    title: "OBJECTS OF JOY",
    category: "Shop",
    tags: ["product", "collection", "ceramics", "lilac", "minimal", "design"],
    description:
      "A lilac display shelf for three small, sculptural objects and a new collection.",
    suggestedInstruction: "Make the bowl pulse a little more.",
    thumbnailTimeMs: 0,
    scene: objectsOfJoy,
  },
  {
    id: "play-date",
    title: "PLAY DATE",
    category: "Playful",
    tags: [
      "kids",
      "workshop",
      "community",
      "blue",
      "rounded",
      "bounce",
      "handwritten",
    ],
    description:
      "Big rounded letters, a tiny smile and a friendly invitation to make something together.",
    suggestedInstruction: "Make play bounce higher.",
    thumbnailTimeMs: 0,
    scene: playDate,
  },
  {
    id: "night-garden",
    title: "NIGHT GARDEN",
    category: "Music",
    tags: [
      "festival",
      "night",
      "botanical",
      "live",
      "purple",
      "serif",
      "event",
    ],
    description:
      "A tall after-dark concert poster with a softly breathing, geometric flower.",
    suggestedInstruction: "Make Garden float more slowly.",
    thumbnailTimeMs: 0,
    scene: nightGarden,
  },
  {
    id: "soft-mornings",
    title: "SOFT MORNINGS",
    category: "Wellness",
    tags: [
      "yoga",
      "breathing",
      "routine",
      "green",
      "calm",
      "handwritten",
      "social",
    ],
    description:
      "Handwritten morning light and three clear steps to a gentler start.",
    suggestedInstruction: "Make the sun pulse more gently.",
    thumbnailTimeMs: 0,
    scene: softMornings,
  },
  {
    id: "studio-sale",
    title: "STUDIO SALE",
    category: "Shop",
    tags: ["sale", "promotion", "retail", "red", "bold", "condensed", "social"],
    description:
      "A vivid red sale announcement with condensed type and a tilted discount ticket.",
    suggestedInstruction: "Make 40% pulse a little more.",
    thumbnailTimeMs: 0,
    scene: studioSale,
  },
  {
    id: "field-notes",
    title: "FIELD NOTES",
    category: "Editorial",
    tags: [
      "journal",
      "nature",
      "botanical",
      "literary",
      "green",
      "serif",
      "handwritten",
    ],
    description:
      "A wide naturalist's notebook: careful serif type, labelled specimens and room to observe.",
    suggestedInstruction: "Make the right leaves sway more gently.",
    thumbnailTimeMs: 0,
    scene: fieldNotes,
  },
  {
    id: "off-the-grid",
    title: "OFF THE GRID",
    category: "Art & type",
    tags: [
      "brutalist",
      "design",
      "conference",
      "yellow",
      "scatter",
      "bold",
      "event",
    ],
    description:
      "An independent design assembly in acid yellow, heavy black type and a tilted red block.",
    suggestedInstruction: "Make GRID scatter a little farther.",
    thumbnailTimeMs: 0,
    scene: offGrid,
  },
  {
    id: "make-some-noise",
    title: "MAKE SOME NOISE",
    category: "Music",
    tags: ["festival", "gig", "live", "orange", "wave", "bold", "event"],
    description:
      "A wide, high-energy concert bill with rolling blue lettering and an easy-to-edit lineup.",
    suggestedInstruction: "Make NOISE. wave more strongly.",
    thumbnailTimeMs: 0,
    scene: makeNoise,
  },
];
