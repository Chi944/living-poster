import {
  CANVAS_PRESETS,
  reviseScene,
  validateScene,
  type Scene,
} from "./schema";

/** Fit and center a composition, preserving type, circular geometry and motion paths. */
export function resizeScene(
  input: Scene,
  width: number,
  height: number,
): Scene {
  const original = validateScene(input);
  if (
    !CANVAS_PRESETS.some(
      (preset) => preset.width === width && preset.height === height,
    )
  )
    throw new Error("Choose a supported canvas format.");
  const next = reviseScene(original);
  const scale = Math.min(
    (width - 32) / (original.artboard.width - 32),
    (height - 32) / (original.artboard.height - 32),
  );
  const offsetX = (width - original.artboard.width * scale) / 2;
  const offsetY = (height - original.artboard.height * scale) / 2;
  const point = <T extends { x: number; y: number }>(value: T): T => ({
    ...value,
    x: value.x * scale + offsetX,
    y: value.y * scale + offsetY,
  });
  next.artboard.width = width;
  next.artboard.height = height;
  for (const layer of next.layers) {
    layer.layout = point(layer.layout);
    if (layer.kind === "text")
      layer.fontSize = Math.max(12, Math.min(300, layer.fontSize * scale));
    else {
      layer.width = Math.max(4, Math.min(640, layer.width * scale));
      layer.height = Math.max(4, Math.min(640, layer.height * scale));
      if (layer.cornerRadius !== undefined) layer.cornerRadius *= scale;
    }
    for (const behavior of layer.behaviors) {
      switch (behavior.type) {
        case "float":
          behavior.params.amplitudeX *= scale;
          behavior.params.amplitudeY *= scale;
          break;
        case "wave":
          behavior.params.amplitude *= scale;
          break;
        case "scatter":
          behavior.params.radius *= scale;
          break;
        case "attract":
          behavior.params.maxDistance *= scale;
          if (behavior.params.anchor.type === "point")
            behavior.params.anchor = point(behavior.params.anchor);
          break;
        case "orbit":
          if (behavior.params.anchor.type === "point")
            behavior.params.anchor = point(behavior.params.anchor);
          break;
        case "repel":
          behavior.params.radius = Math.max(40, behavior.params.radius * scale);
          behavior.params.maxDistance *= scale;
          break;
        case "bounce":
          behavior.params.height *= scale;
          break;
      }
    }
  }
  if (next.pointer.mode === "fixed")
    next.pointer.sample = point(next.pointer.sample);
  else if (next.pointer.mode === "recorded")
    next.pointer.samples = next.pointer.samples.map(point);
  return validateScene(next);
}
