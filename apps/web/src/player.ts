import { compileScene, evaluateScene, loadFonts, paintFrame, samplePointer, validateScene, type PointerSample } from '../../../packages/core/src/index';

async function start() {
  const status = document.getElementById('status')!;
  try {
    const binary = atob(document.getElementById('poster-data')!.textContent!.trim());
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)))) as { scene: unknown; fonts: Record<string, string>; licenses: string };
    const scene = validateScene(payload.scene);
    await loadFonts(payload.fonts);
    const compiled = compileScene(scene);
    const canvas = document.getElementById('poster') as HTMLCanvasElement;
    canvas.width = scene.artboard.width; canvas.height = scene.artboard.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
    const toggle = document.getElementById('toggle') as HTMLButtonElement;
    const restart = document.getElementById('restart') as HTMLButtonElement;
    const slider = document.getElementById('time') as HTMLInputElement;
    const live = document.getElementById('live') as HTMLButtonElement;
    const clock = document.getElementById('clock')!;
    slider.max = String(scene.timeline.durationMs - 1);
    const text = scene.layers.flatMap(layer => layer.kind === 'text' ? [layer.text] : []).join('\n');
    document.getElementById('description')!.textContent = text;
    canvas.setAttribute('aria-label', text || 'Animated geometric poster');
    document.getElementById('licenses')!.textContent = payload.licenses;
    document.getElementById('mode')!.textContent = scene.pointer.mode === 'recorded' ? 'Recorded pointer' : scene.pointer.mode === 'fixed' ? 'Fixed pointer' : 'Pointer inactive';
    let time = 0; let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now(); let pointer: PointerSample | null = null; let liveEnabled = false;
    const updateToggle = () => { toggle.textContent = playing ? 'Pause' : 'Play'; toggle.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation'); };
    updateToggle();
    toggle.onclick = () => { playing = !playing; last = performance.now(); updateToggle(); };
    restart.onclick = () => { time = 0; last = performance.now(); };
    slider.oninput = () => { time = Number(slider.value); playing = false; updateToggle(); };
    live.onclick = () => { liveEnabled = !liveEnabled; live.setAttribute('aria-pressed', String(liveEnabled)); live.textContent = liveEnabled ? 'Live pointer: on' : 'Live pointer: off'; };
    canvas.onpointermove = event => { const rect = canvas.getBoundingClientRect(); pointer = { x: (event.clientX - rect.left) * scene.artboard.width / rect.width, y: (event.clientY - rect.top) * scene.artboard.height / rect.height, presence: 1 }; };
    canvas.onpointerleave = () => { pointer = null; };
    document.addEventListener('visibilitychange', () => { last = performance.now(); });
    function draw(now: number) {
      if (playing && !document.hidden) time = (time + Math.max(0, now - last)) % scene.timeline.durationMs;
      last = now;
      paintFrame(ctx!, evaluateScene(compiled, { timeMs: time, pointer: liveEnabled ? pointer : samplePointer(scene, time) }), 1);
      slider.value = String(time); clock.textContent = `${(time / 1000).toFixed(1)} s`;
      requestAnimationFrame(draw);
    }
    status.textContent = '';
    // Exposed for reproducible export verification, with no editable scene or network capability.
    Object.defineProperty(window, 'livingPosterPlayer', { value: { seek(ms: number) { playing = false; time = Math.max(0, Math.min(ms, scene.timeline.durationMs)); updateToggle(); paintFrame(ctx!, evaluateScene(compiled, { timeMs: time, pointer: samplePointer(scene, time) }), 1); }, rendererVersion: scene.rendererVersion } });
    requestAnimationFrame(draw);
  } catch (error) {
    status.textContent = `This poster could not load: ${error instanceof Error ? error.message : 'Invalid presentation data.'}`;
  }
}
void start();
