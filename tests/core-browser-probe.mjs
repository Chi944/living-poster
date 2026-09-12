// Actual-font geometry probe. Run: node tests/core-browser-probe.mjs
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const bundle = await build({
  entryPoints: [path.join(root, "packages/core/src/index.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "LivingPosterCore",
  platform: "browser",
  target: "es2023",
});
const fontIds = [
  "space-regular",
  "space-bold",
  "fraunces-regular",
  "fraunces-bold",
  "mono-regular",
  "mono-bold",
];
const sources = Object.fromEntries(
  await Promise.all(
    fontIds.map(async (id) => [
      id,
      `data:font/woff2;base64,${(await readFile(path.join(root, `apps/web/public/fonts/${id}.woff2`))).toString("base64")}`,
    ]),
  ),
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1140, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    "<style>body{margin:0;padding:24px;background:#e5e2db;display:grid;grid-template-columns:repeat(3,350px);gap:20px;font:12px monospace;align-items:start}canvas{display:block;width:350px;height:auto}p{margin:8px 0 0}</style>",
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async (sources) => {
    const core = globalThis.LivingPosterCore;
    await core.loadFonts(sources);
    const output = [];
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        core.newId(),
      )
    )
      throw new Error("UUID generation failed in the non-secure probe origin");
    for (const example of core.EXAMPLES) {
      try {
        const compiled = core.compileScene(example.scene),
          frames = [0, 1200, 2400, 3600, 4800, 6000].map((timeMs) =>
            core.evaluateScene(compiled, {
              timeMs,
              pointer: core.samplePointer(example.scene, timeMs),
            }),
          );
        const container = document.createElement("div"),
          canvas = document.createElement("canvas");
        canvas.width = example.scene.artboard.width;
        canvas.height = example.scene.artboard.height;
        core.paintFrame(canvas.getContext("2d"), frames[0]);
        container.append(canvas);
        const label = document.createElement("p");
        label.textContent = example.title;
        container.append(label);
        document.body.append(container);
        output.push({
          id: example.id,
          ok: true,
          glyphs: compiled.glyphCount,
          units: frames[0].units.length,
          endpointEqual:
            JSON.stringify(frames[0]) === JSON.stringify(frames.at(-1)),
          corrections: frames.map((f) => f.boundsCorrections),
          formats: core.CANVAS_PRESETS.map((preset) => {
            const resized = core.resizeScene(
              example.scene,
              preset.width,
              preset.height,
            );
            const resizedCompiled = core.compileScene(resized);
            const resizedFrames = [0, 1139, 2999, 4749, 6000].map((timeMs) =>
              core.evaluateScene(resizedCompiled, {
                timeMs,
                pointer: core.samplePointer(resized, timeMs),
              }),
            );
            for (const frame of resizedFrames) {
              for (const unit of frame.units) {
                if (
                  unit.bounds.x < 16 - 1e-6 ||
                  unit.bounds.y < 16 - 1e-6 ||
                  unit.bounds.x + unit.bounds.width >
                    preset.width - 16 + 1e-6 ||
                  unit.bounds.y + unit.bounds.height > preset.height - 16 + 1e-6
                )
                  throw Error(`Out of bounds in ${preset.id}`);
              }
            }
            return {
              id: preset.id,
              endpointEqual:
                JSON.stringify(resizedFrames[0]) ===
                JSON.stringify(resizedFrames.at(-1)),
              corrections: resizedFrames.map(
                (frame) => frame.boundsCorrections,
              ),
            };
          }),
        });
      } catch (error) {
        output.push({ id: example.id, ok: false, error: String(error) });
      }
    }
    return output;
  }, sources);
  await mkdir(path.join(root, "tests/core-artifacts"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "tests/core-artifacts/gallery.png"),
    fullPage: true,
  });
  console.log(JSON.stringify(result, null, 2));
  if (
    result.some(
      (r) =>
        !r.ok ||
        !r.endpointEqual ||
        r.formats.some((format) => !format.endpointEqual),
    )
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
