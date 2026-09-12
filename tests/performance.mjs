// Real Canvas 2D benchmark, no application server or AI calls required.
// node tests/performance.mjs [--assert]; LP_BENCH_SECONDS=30 by default.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const seconds = Number(process.env.LP_BENCH_SECONDS ?? 30);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120)
  throw new Error("LP_BENCH_SECONDS must be between 1 and 120.");
const root = process.cwd(),
  outputPath = path.join(root, "tests/core-artifacts/performance.json");
const bundle = await build({
  entryPoints: [path.join(root, "packages/core/src/index.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "LivingPosterCore",
  platform: "browser",
  target: "es2023",
});
const ids = [
  "space-regular",
  "space-bold",
  "fraunces-regular",
  "fraunces-bold",
  "mono-regular",
  "mono-bold",
];
const sources = Object.fromEntries(
  await Promise.all(
    ids.map(async (id) => [
      id,
      `data:font/woff2;base64,${(await readFile(path.join(root, `apps/web/public/fonts/${id}.woff2`))).toString("base64")}`,
    ]),
  ),
);
const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  conditions: {
    browser: browser.version(),
    headless: true,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryGiB: Math.round(os.totalmem() / 1024 ** 3),
    durationSeconds: seconds,
    warmupMs: 1800,
    viewport: { width: 1280, height: 900 },
    cssCanvas: { width: 540, height: 675 },
    canvasBacking: { width: 1080, height: 1350 },
    dpr: 2,
    network: "disabled; font bytes embedded",
    timing:
      "performance.now around synchronous evaluator and Canvas commands; requestAnimationFrame callback intervals. These are not physical display presentation times.",
    workload:
      "No model requests initiated by this benchmark. Other processes are not stopped or controlled.",
  },
  browserEnvironment: null,
  results: [],
};
try {
  const page = await browser.newPage({
    viewport: report.conditions.viewport,
    deviceScaleFactor: 2,
  });
  await page.route("**/*", (route) =>
    route.request().url() === "http://localhost/core-benchmark"
      ? route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><html><body></body></html>",
        })
      : route.abort(),
  );
  await page.goto("http://localhost/core-benchmark");
  await page.setContent(
    '<style>body{margin:0;background:#e5e2db;display:grid;place-items:center;min-height:100vh}canvas{width:540px;height:675px}</style><canvas id="poster" width="1080" height="1350"></canvas>',
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  report.browserEnvironment = await page.evaluate(async (sources) => {
    await globalThis.LivingPosterCore.loadFonts(sources);
    const gpuCanvas = document.createElement("canvas"),
      gl = gpuCanvas.getContext("webgl"),
      debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio,
      graphicsRenderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : "unavailable",
      fontCount: document.fonts.size,
    };
  }, sources);
  const cases = await page.evaluate(() => {
    const core = globalThis.LivingPosterCore;
    function stress(id, layerCount, glyphCount, behaviorCount) {
      const scene = core.cloneScene(core.EXAMPLES[0].scene);
      scene.id = id;
      scene.revision = { id: `${id}-revision`, parentId: null };
      scene.seed = 20260913;
      scene.pointer = {
        mode: "fixed",
        sample: { x: 540, y: 675, presence: 1 },
      };
      scene.layers = [];
      const columns = layerCount === 64 ? 8 : 4,
        rows = layerCount / columns;
      for (let i = 0; i < layerCount; i++) {
        const count =
            Math.floor(glyphCount / layerCount) +
            (i < glyphCount % layerCount ? 1 : 0),
          x =
            (layerCount === 64 ? 82 : 112) +
            (i % columns) * ((layerCount === 64 ? 916 : 856) / (columns - 1)),
          y = 160 + Math.floor(i / columns) * (1050 / (rows - 1));
        const layer = {
          id: `${id}-layer-${i}`,
          name: `Stress ${i + 1}`,
          kind: "text",
          visible: true,
          locked: false,
          opacity: 1,
          layout: { x, y, rotationDeg: 0 },
          fill: "#20211F",
          text: "TYPE+TIME=ALIVE!".repeat(3).slice(0, count),
          fontId: "mono-regular",
          fontSize: layerCount === 64 ? 12 : 14,
          lineHeight: 1.1,
          trackingEm: 0,
          align: "center",
          behaviors: [],
        };
        const types = ["float", "wave", "scatter", "repel"],
          n =
            Math.floor(behaviorCount / layerCount) +
            (i < behaviorCount % layerCount ? 1 : 0);
        for (const type of types.slice(0, n)) {
          const b = core.defaultBehavior(type, 6000, layer);
          b.id = `${layer.id}-${type}`;
          layer.behaviors.push(b);
        }
        scene.layers.push(layer);
      }
      return core.validateScene(scene);
    }
    globalThis.benchmarkScenes = [
      ...core.EXAMPLES.map((e) => ({
        id: e.id,
        scene: e.scene,
        category: "example",
      })),
      {
        id: "typical-24-400-60",
        scene: stress("typical", 24, 400, 60),
        category: "typical",
      },
      {
        id: "limit-64-1024-256",
        scene: stress("limit", 64, 1024, 256),
        category: "limit",
      },
    ];
    return globalThis.benchmarkScenes.map(({ id, category, scene }) => {
      core.compileScene(scene);
      return { id, category };
    });
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  for (let index = 0; index < cases.length; index++) {
    const result = await page.evaluate(
      async ({ index, seconds }) => {
        const core = globalThis.LivingPosterCore,
          { id, scene, category } = globalThis.benchmarkScenes[index],
          compileStart = performance.now(),
          compiled = core.compileScene(scene),
          compileMs = performance.now() - compileStart;
        const ctx = document.querySelector("canvas").getContext("2d"),
          warmupMs = 1800,
          evaluateTimes = [],
          paintTimes = [],
          combinedTimes = [],
          intervals = [];
        let boundsCorrections = 0,
          drawCount = 0;
        await new Promise((resolve) => {
          let start = null,
            previous = null;
          function tick(now) {
            if (start === null) start = now;
            const elapsed = now - start,
              a = performance.now(),
              frame = core.evaluateScene(compiled, {
                timeMs: elapsed,
                pointer: core.samplePointer(scene, elapsed),
              }),
              b = performance.now();
            core.paintFrame(ctx, frame);
            const c = performance.now();
            if (elapsed >= warmupMs) {
              evaluateTimes.push(b - a);
              paintTimes.push(c - b);
              combinedTimes.push(c - a);
              if (previous !== null) intervals.push(now - previous);
              boundsCorrections += frame.boundsCorrections;
              drawCount = frame.units.length;
            }
            previous = now;
            if (elapsed >= warmupMs + seconds * 1000) resolve();
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
        const stats = (values) => {
          const sorted = [...values].sort((a, b) => a - b),
            at = (q) =>
              sorted[
                Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)
              ] ?? 0;
          return {
            samples: sorted.length,
            p50Ms: at(0.5),
            p95Ms: at(0.95),
            p99Ms: at(0.99),
            maxMs: sorted.at(-1) ?? 0,
            meanMs: values.reduce((a, b) => a + b, 0) / values.length,
          };
        };
        const combined = stats(combinedTimes),
          interval = stats(intervals),
          target =
            category === "limit"
              ? { rafP95Ms: 34 }
              : { evaluatePaintP95Ms: 12, rafP95Ms: 20 };
        return {
          id,
          category,
          layers: scene.layers.length,
          graphemes: compiled.glyphCount,
          behaviors: compiled.behaviorCount,
          drawCount,
          compileMs,
          evaluate: stats(evaluateTimes),
          paint: stats(paintTimes),
          evaluateAndPaint: combined,
          rafInterval: interval,
          boundsCorrections,
          target,
          meetsTimingTargets:
            interval.p95Ms <= target.rafP95Ms &&
            (!("evaluatePaintP95Ms" in target) ||
              combined.p95Ms <= target.evaluatePaintP95Ms),
        };
      },
      { index, seconds },
    );
    report.results.push(result);
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
    console.log(
      `${result.id}: evaluate+paint p95 ${result.evaluateAndPaint.p95Ms.toFixed(2)} ms; rAF p95 ${result.rafInterval.p95Ms.toFixed(2)} ms; ${result.meetsTimingTargets ? "target met" : "target missed"} (${result.evaluateAndPaint.samples} samples)`,
    );
  }
  console.log(
    `Recorded ${path.relative(root, outputPath)}. Headless rAF is not a physical display measurement.`,
  );
  if (
    process.argv.includes("--assert") &&
    report.results.some((r) => !r.meetsTimingTargets)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
