import {
  defaultBehavior,
  type BehaviorType,
  type Layer,
} from "../../../packages/core/src";

export const MOTION_RECIPES: {
  id: string;
  label: string;
  description: string;
  symbol: string;
  types: BehaviorType[];
  textOnly?: boolean;
}[] = [
  {
    id: "drift",
    label: "Soft drift",
    description: "A slow, weightless float",
    symbol: "≈",
    types: ["float"],
  },
  {
    id: "wave",
    label: "Letter wave",
    description: "A wave travels through the letters",
    symbol: "∿",
    types: ["wave"],
    textOnly: true,
  },
  {
    id: "ripple",
    label: "Ripple",
    description: "Letters rise and fall in sequence",
    symbol: "≋",
    types: ["wave", "bounce"],
    textOnly: true,
  },
  {
    id: "scatter",
    label: "Scatter",
    description: "Break apart, then find your way home",
    symbol: "⁙",
    types: ["scatter"],
  },
  {
    id: "orbit",
    label: "Satellite",
    description: "Follow a small circular path",
    symbol: "◌",
    types: ["orbit"],
  },
  {
    id: "pulse",
    label: "Heartbeat",
    description: "A gentle, rhythmic change of scale",
    symbol: "♡",
    types: ["pulse"],
  },
  {
    id: "pendulum",
    label: "Pendulum",
    description: "Swing from side to side",
    symbol: "⌁",
    types: ["pendulum"],
  },
  {
    id: "bounce",
    label: "Spring",
    description: "A buoyant bounce with staggered letters",
    symbol: "↟",
    types: ["bounce"],
  },
  {
    id: "reveal",
    label: "Soft reveal",
    description: "Letters appear and fade in a loop",
    symbol: "◐",
    types: ["reveal"],
  },
  {
    id: "breathe",
    label: "Breathe",
    description: "Float and expand slowly together",
    symbol: "◎",
    types: ["pulse", "float"],
  },
  {
    id: "magnetic",
    label: "Magnetic",
    description: "Gather toward a nearby anchor",
    symbol: "⊙",
    types: ["attract"],
  },
  {
    id: "repel",
    label: "Personal space",
    description: "Move away from your pointer",
    symbol: "↗",
    types: ["repel"],
  },
];

/** Recipes replace only the selected layer's motion; undo restores its old stack. */
export function recipeBehaviors(
  id: string,
  layer: Layer,
  duration: number,
  artboard?: { width: number; height: number },
) {
  const recipe = MOTION_RECIPES.find((item) => item.id === id);
  if (!recipe || (recipe.textOnly && layer.kind !== "text"))
    return layer.behaviors;
  return recipe.types.map((type) => {
    const behavior = defaultBehavior(type, duration, layer, artboard);
    if (behavior.type === "float") {
      behavior.params.amplitudeX = id === "breathe" ? 8 : 18;
      behavior.params.amplitudeY = id === "breathe" ? 12 : 28;
      behavior.params.rotationAmplitudeDeg = 1.5;
      behavior.params.cycles = 1;
    }
    if (behavior.type === "pulse")
      behavior.params.amount = id === "breathe" ? 0.08 : 0.16;
    if (behavior.type === "bounce") {
      behavior.params.height = id === "ripple" ? 20 : 58;
      behavior.params.stagger = 0.35;
    }
    if (behavior.type === "scatter") behavior.params.radius = 74;
    if (behavior.type === "wave") {
      behavior.params.amplitude = id === "ripple" ? 15 : 32;
      behavior.params.wavelength = 7;
    }
    return behavior;
  });
}
