import { compileScene, evaluateScene, loadFonts, paintFrame, samplePointer, validateScene, type PointerSample, type Scene } from '../../../packages/core/src/index';

function filename(scene: Scene) {
  const title = scene.layers.find(layer => layer.kind === 'text');
  return (title?.kind === 'text' ? title.text : 'living-poster').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-|-$/g, '') || 'living-poster';
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function createPng(scene: Scene, timeMs: number, pointer: PointerSample | null, scale = 1): Promise<Blob> {
  if (![1, 2].includes(scale)) throw new Error('PNG scale must be 1 or 2.');
  const snapshot = validateScene(structuredClone(scene));
  const capturedPointer = pointer ? { ...pointer } : null;
  await loadFonts();
  const compiled = compileScene(snapshot);
  const frame = evaluateScene(compiled, { timeMs, pointer: capturedPointer });
  const canvas = document.createElement('canvas');
  canvas.width = snapshot.artboard.width * scale; canvas.height = snapshot.artboard.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create an export canvas.');
  paintFrame(ctx, frame, scale);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG could not be encoded. Please retry.')), 'image/png'));
}

export async function exportPng(scene: Scene, timeMs: number, pointer: PointerSample | null = samplePointer(scene, timeMs)) {
  const snapshot = structuredClone(scene);
  downloadBlob(await createPng(snapshot, timeMs, pointer), `${filename(snapshot)}.png`);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

async function getAsset(url: string): Promise<Response> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Could not load presentation asset (${url}). Run npm run build and retry.`);
  return response;
}

export async function createHtml(scene: Scene): Promise<string> {
  const snapshot = validateScene(structuredClone(scene));
  await loadFonts();
  compileScene(snapshot);
  const fontIds = [...new Set(snapshot.layers.flatMap(layer => layer.kind === 'text' ? [layer.fontId] : []))];
  const fonts: Record<string, string> = {};
  const [player, licenses] = await Promise.all([
    getAsset('/player.js').then(r => r.text()),
    getAsset('/fonts/LICENSES.txt').then(r => r.text()),
    ...fontIds.map(async id => { fonts[id] = `data:font/woff2;base64,${base64(new Uint8Array(await (await getAsset(`/fonts/${id}.woff2`)).arrayBuffer()))}`; }),
  ]);
  // Only application-authored player code is executable. User data is UTF-8/base64 JSON.
  const payload = base64(new TextEncoder().encode(JSON.stringify({ scene: snapshot, fonts, licenses })));
  const safePlayer = player.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Living Poster presentation</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e8e6e1;color:#20211f;font:14px system-ui,sans-serif;min-height:100vh;display:grid;grid-template-rows:1fr auto}main{display:flex;align-items:center;justify-content:center;padding:24px;min-height:0}canvas{max-width:100%;max-height:calc(100vh - 120px);width:auto;height:auto;box-shadow:0 4px 24px #0002;background:white}footer{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:14px 20px;background:#fff9}button{border:1px solid #989b96;border-radius:6px;background:white;color:#20211f;padding:9px 14px;font:inherit;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #a83220;outline-offset:3px}input[type=range]{width:160px;accent-color:#a83220}details{max-width:700px;margin:0 auto;padding:12px}pre{white-space:pre-wrap;font:12px/1.5 monospace}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}#status{position:fixed;top:16px;left:16px;background:white;padding:10px;border-radius:6px}#status:empty{display:none}@media(max-width:600px){main{padding:12px}canvas{max-height:calc(100svh - 170px)}footer{gap:8px}}</style>
</head><body><main><canvas id="poster" role="img" aria-label="Animated typography poster"></canvas><p id="description" class="sr-only"></p></main>
<footer><button id="toggle" aria-label="Play animation">Play</button><button id="restart">Restart</button><input id="time" type="range" min="0" step="10" value="0" aria-label="Animation time"><output id="clock">0.0 s</output><button id="live" aria-pressed="false">Live pointer: off</button><span id="mode"></span></footer>
<details><summary>Font licenses</summary><pre id="licenses"></pre></details><p id="status" role="status">Loading poster…</p>
<script id="poster-data" type="application/octet-stream">${payload}</script><script>${safePlayer}</script></body></html>`;
}

export async function exportHtml(scene: Scene) {
  const snapshot = structuredClone(scene);
  downloadBlob(new Blob([await createHtml(snapshot)], { type: 'text/html;charset=utf-8' }), `${filename(snapshot)}.html`);
}

export function downloadScene(scene: Scene) {
  downloadBlob(new Blob([JSON.stringify(validateScene(scene), null, 2)], { type: 'application/json' }), `${filename(scene)}.living-poster.json`);
}
