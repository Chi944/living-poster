import {
  type Scene,
  type PointerSample,
  type RecordedSample,
  RecordedSampleSchema,
} from "./schema";
export const loopTime = (timeMs: number, durationMs: number): number =>
  ((timeMs % durationMs) + durationMs) % durationMs;
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
function interpolate(samples: RecordedSample[], timeMs: number): PointerSample {
  const first = samples[0]!;
  if (timeMs <= first.timeMs)
    return { x: first.x, y: first.y, presence: first.presence };
  let low = 0,
    high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid]!.timeMs <= timeMs) low = mid;
    else high = mid;
  }
  const a = samples[low]!,
    b = samples[high]!,
    u = Math.max(0, Math.min(1, (timeMs - a.timeMs) / (b.timeMs - a.timeMs)));
  return {
    x: mix(a.x, b.x, u),
    y: mix(a.y, b.y, u),
    presence: mix(a.presence, b.presence, u),
  };
}
export function samplePointer(
  scene: Scene,
  timeMs: number,
): PointerSample | null {
  if (!Number.isFinite(timeMs)) throw new Error("Pointer time must be finite");
  if (scene.pointer.mode === "disabled") return null;
  if (scene.pointer.mode === "fixed") return { ...scene.pointer.sample };
  return interpolate(
    scene.pointer.samples,
    loopTime(timeMs, scene.timeline.durationMs),
  );
}
/** Save the seam itself, so no playback-only smoothing can disagree with export. */
export function closePointerLoop(
  samples: RecordedSample[],
  durationMs: number,
): RecordedSample[] {
  if (!Number.isFinite(durationMs) || durationMs < 2000 || durationMs > 10000)
    throw new Error("Invalid loop duration");
  if (samples.length < 2 || samples.length > 601)
    throw new Error("Recording requires 2–601 samples");
  samples.forEach((s) => RecordedSampleSchema.parse(s));
  if (
    samples[0]!.timeMs !== 0 ||
    samples.some(
      (s, i) =>
        s.timeMs > durationMs || (i > 0 && s.timeMs <= samples[i - 1]!.timeMs),
    )
  )
    throw new Error("Recording times must increase from zero");
  const start = durationMs - 250,
    from = interpolate(samples, start),
    to = samples[0]!;
  // A fixed 60 Hz seam plus its exact boundary keeps the saved path within 601 samples.
  const before = samples.filter((s) => s.timeMs < start).map((s) => ({ ...s }));
  const seam: RecordedSample[] = [];
  for (let i = 0; i <= 15; i++) {
    const u = i / 15,
      v = u * u * (3 - 2 * u);
    seam.push({
      timeMs: start + 250 * u,
      x: mix(from.x, to.x, v),
      y: mix(from.y, to.y, v),
      presence: mix(from.presence, to.presence, v),
    });
  }
  const budget = 601 - seam.length;
  const kept =
    before.length <= budget
      ? before
      : Array.from(
          { length: budget },
          (_, i) =>
            before[Math.floor((i * (before.length - 1)) / (budget - 1))]!,
        );
  return [...kept, ...seam];
}
