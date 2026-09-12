import type { BehaviorType } from "./schema";

export interface BehaviorOption {
  type: BehaviorType;
  label: string;
  description: string;
  scopes: readonly ("layer" | "glyph")[];
  controls: readonly {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
  }[];
}
export const BEHAVIOR_OPTIONS: readonly BehaviorOption[] = [
  {
    type: "float",
    label: "Float",
    description: "Drift gently through the air.",
    scopes: ["layer"],
    controls: [
      {
        key: "amplitudeX",
        label: "Horizontal drift",
        min: 0,
        max: 80,
        step: 1,
      },
      { key: "amplitudeY", label: "Vertical drift", min: 0, max: 80, step: 1 },
      { key: "cycles", label: "Cycles", min: 1, max: 4, step: 1 },
      {
        key: "rotationAmplitudeDeg",
        label: "Sway",
        min: 0,
        max: 10,
        step: 0.5,
      },
    ],
  },
  {
    type: "orbit",
    label: "Orbit",
    description: "Circle an anchor point or another layer.",
    scopes: ["layer"],
    controls: [{ key: "cycles", label: "Cycles", min: 1, max: 3, step: 1 }],
  },
  {
    type: "wave",
    label: "Wave",
    description: "Send a rolling wave through every letter.",
    scopes: ["glyph"],
    controls: [
      { key: "amplitude", label: "Wave height", min: 0, max: 60, step: 1 },
      { key: "cycles", label: "Cycles", min: 1, max: 4, step: 1 },
      { key: "wavelength", label: "Wavelength", min: 2, max: 24, step: 1 },
    ],
  },
  {
    type: "scatter",
    label: "Scatter",
    description: "Scatter outward, then find the way home.",
    scopes: ["layer", "glyph"],
    controls: [
      { key: "radius", label: "Distance", min: 0, max: 180, step: 1 },
      { key: "rotationMaxDeg", label: "Rotation", min: 0, max: 25, step: 1 },
    ],
  },
  {
    type: "attract",
    label: "Attract",
    description: "Draw the layer toward an invisible center.",
    scopes: ["layer"],
    controls: [
      { key: "strength", label: "Strength", min: 0, max: 1, step: 0.05 },
      { key: "maxDistance", label: "Distance", min: 0, max: 180, step: 1 },
    ],
  },
  {
    type: "repel",
    label: "Repel",
    description: "Give your pointer a little breathing room.",
    scopes: ["layer"],
    controls: [
      { key: "radius", label: "Reach", min: 40, max: 400, step: 1 },
      { key: "maxDistance", label: "Distance", min: 0, max: 140, step: 1 },
    ],
  },
  {
    type: "pulse",
    label: "Pulse",
    description: "Breathe in and out around the center of the type.",
    scopes: ["layer"],
    controls: [
      { key: "amount", label: "Expansion", min: 0, max: 0.35, step: 0.01 },
      { key: "cycles", label: "Cycles", min: 1, max: 4, step: 1 },
    ],
  },
  {
    type: "pendulum",
    label: "Pendulum",
    description: "Swing in a smooth, rhythmic arc.",
    scopes: ["layer"],
    controls: [
      { key: "angleDeg", label: "Swing angle", min: 0, max: 25, step: 1 },
      { key: "cycles", label: "Cycles", min: 1, max: 4, step: 1 },
    ],
  },
  {
    type: "bounce",
    label: "Bounce",
    description: "Spring upward with a cascading rhythm.",
    scopes: ["layer", "glyph"],
    controls: [
      { key: "height", label: "Jump height", min: 0, max: 120, step: 1 },
      { key: "cycles", label: "Cycles", min: 1, max: 4, step: 1 },
      { key: "stagger", label: "Letter stagger", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    type: "reveal",
    label: "Reveal",
    description: "Dissolve and resolve in a sequence of letters.",
    scopes: ["layer", "glyph"],
    controls: [
      {
        key: "minOpacity",
        label: "Minimum opacity",
        min: 0,
        max: 1,
        step: 0.05,
      },
      { key: "stagger", label: "Letter stagger", min: 0, max: 1, step: 0.05 },
    ],
  },
];
