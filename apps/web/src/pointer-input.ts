import type { PointerSample } from "../../../packages/core/src";

export const pointerRef: { current: PointerSample | null } = { current: null };
let lastPresentPointer: PointerSample | null = null;

export function updatePointerSample(sample: PointerSample | null) {
  pointerRef.current = sample;
  if (sample && sample.presence > 0) lastPresentPointer = { ...sample };
}

/** Moving to a toolbar must not make a deliberately frozen pointer disappear. */
export function getFixedPointerSample(artboard: {
  width: number;
  height: number;
}): PointerSample {
  const sample = lastPresentPointer;
  return {
    x: Math.max(0, Math.min(artboard.width, sample?.x ?? artboard.width / 2)),
    y: Math.max(0, Math.min(artboard.height, sample?.y ?? artboard.height / 2)),
    presence: 1,
  };
}
