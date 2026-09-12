import {
  compileScene,
  reviseScene,
  validateScene,
  type FontId,
  type Scene,
} from "../../../packages/core/src";

/** Keep a new face inside the existing canvas without moving or rewriting it. */
export function fitTypeface(scene: Scene, layerId: string, fontId: FontId) {
  const next = reviseScene(scene);
  const layer = next.layers.find((layer) => layer.id === layerId);
  if (layer?.kind !== "text") throw new Error("Choose a text layer first.");
  layer.fontId = fontId;
  if (!next.fonts.some((font) => font.id === fontId))
    next.fonts.push({ id: fontId, assetHash: "bundled-v1" });
  validateScene(next);
  try {
    compileScene(next);
    return next;
  } catch (originalError) {
    const desiredSize = layer.fontSize;
    layer.fontSize = 12;
    try {
      compileScene(next);
    } catch {
      throw originalError;
    }
    let low = 12,
      high = desiredSize;
    for (let step = 0; step < 12; step++) {
      layer.fontSize = (low + high) / 2;
      try {
        compileScene(next);
        low = layer.fontSize;
      } catch {
        high = layer.fontSize;
      }
    }
    layer.fontSize = Math.floor(low * 10) / 10;
    compileScene(next);
    return next;
  }
}
