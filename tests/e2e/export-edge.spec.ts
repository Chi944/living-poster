import { test, expect, type Page, type Browser } from "@playwright/test";
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { EXAMPLES } from "../../packages/core/src/index";

let harness = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents:
        "export * from './packages/core/src/index.ts'; export * from './apps/web/src/exports.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  harness = result.outputFiles[0].text;
});
async function createFixture(page: Page, fixture: string) {
  await page.route("**/__export-edge.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: harness }),
  );
  await page.goto("/");
  return page.evaluate(async (fixture) => {
    const source = "/__export-edge.js";
    const core = await import(source);
    await core.loadFonts();
    const index = fixture.startsWith("example-") ? Number(fixture.slice(8)) : 0;
    const scene = structuredClone(core.EXAMPLES[index].scene);
    if (fixture === "all-fonts") {
      scene.layers = core.FONT_OPTIONS.map((font: any, index: number) => ({
        id: `face-${index}`,
        name: font.label,
        kind: "text",
        visible: true,
        locked: false,
        opacity: 1,
        layout: { x: 540, y: 180 + index * 180, rotationDeg: 0 },
        behaviors: [],
        text: "Aa ffi AV Café 0123",
        fontId: font.id,
        fontSize: 64,
        lineHeight: 1.1,
        trackingEm: 0.01,
        align: "center",
        fill: index % 2 ? "#a83220" : "#20211f",
      }));
    }
    if (fixture === "shapes") {
      const common = {
        visible: true,
        locked: false,
        opacity: 0.7,
        behaviors: [],
      };
      scene.layers = [
        {
          ...common,
          id: "rounded",
          name: "Rounded rectangle",
          kind: "shape",
          shape: "rect",
          width: 440,
          height: 220,
          cornerRadius: 70,
          fill: "#3e6285",
          layout: { x: 480, y: 450, rotationDeg: 24 },
        },
        {
          ...common,
          id: "ellipse",
          name: "Ellipse",
          kind: "shape",
          shape: "ellipse",
          width: 250,
          height: 320,
          fill: "#a83220",
          layout: { x: 650, y: 850, rotationDeg: -20 },
        },
      ];
      scene.layers[0].behaviors = [
        {
          ...core.defaultBehavior("repel", 6000, scene.layers[0]),
          params: { radius: 400, maxDistance: 100 },
        },
      ];
      scene.layers[1].behaviors = [
        core.defaultBehavior("float", 6000, scene.layers[1]),
      ];
      scene.pointer = {
        mode: "recorded",
        seamPolicy: "blend-250ms",
        samples: core.closePointerLoop(
          [
            { timeMs: 0, x: 320, y: 390, presence: 1 },
            { timeMs: 1000, x: 540, y: 675, presence: 0.5 },
            { timeMs: 4000, x: 760, y: 850, presence: 1 },
            { timeMs: 6000, x: 320, y: 390, presence: 1 },
          ],
          6000,
        ),
      };
    }
    if (fixture === "empty") {
      scene.layers = [];
      scene.pointer = {
        mode: "fixed",
        sample: { x: 540, y: 675, presence: 1 },
      };
    }
    core.validateScene(scene);
    const compiled = core.compileScene(scene),
      canvas = document.createElement("canvas");
    canvas.width = scene.artboard.width;
    canvas.height = scene.artboard.height;
    const ctx = canvas.getContext("2d")!;
    const times = [0, 200, 2300, 5999, 6000];
    const hashes: string[] = [];
    for (const timeMs of times) {
      core.paintFrame(
        ctx,
        core.evaluateScene(compiled, {
          timeMs,
          pointer: core.samplePointer(scene, timeMs),
        }),
      );
      const digest = await crypto.subtle.digest(
        "SHA-256",
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      hashes.push(
        Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      );
    }
    return {
      html: await core.createHtml(scene),
      hashes,
      times,
      width: canvas.width,
      height: canvas.height,
      fontCount: new Set(
        scene.layers
          .filter((layer: any) => layer.kind === "text")
          .map((layer: any) => layer.fontId),
      ).size,
    };
  }, fixture);
}
async function checkOffline(
  browser: Browser,
  path: string,
  data: Awaited<ReturnType<typeof createFixture>>,
) {
  await writeFile(path, data.html);
  const context = await browser.newContext({
    offline: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/i.test(request.url())) external.push(request.url());
  });
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator("#status")).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Play animation" }),
  ).toBeVisible();
  const result = await page.evaluate(async (times) => {
    const canvas = document.getElementById("poster") as HTMLCanvasElement,
      ctx = canvas.getContext("2d")!;
    const hashes: string[] = [];
    for (const time of times) {
      (window as any).livingPosterPlayer.seek(time);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      hashes.push(
        Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      );
    }
    const binary = atob(
      document.getElementById("poster-data")!.textContent!.trim(),
    );
    const payload = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    );
    return {
      hashes,
      width: canvas.width,
      height: canvas.height,
      fontCount: Object.keys(payload.fonts).length,
      embedded: Object.values(payload.fonts).every((source: any) =>
        source.startsWith("data:font/woff2;base64,"),
      ),
    };
  }, data.times);
  expect(result.hashes).toEqual(data.hashes);
  expect([result.width, result.height]).toEqual([data.width, data.height]);
  expect(result.fontCount).toBe(data.fontCount);
  expect(result.embedded).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await context.close();
}
for (const [index, { title: name }] of EXAMPLES.entries()) {
  test(`${name} offline export matches five exact evaluated frames`, async ({
    page,
    browser,
  }, info) => {
    const data = await createFixture(page, `example-${index}`);
    await checkOffline(browser, info.outputPath(`example-${index}.html`), data);
  });
}
for (const fixture of ["all-fonts", "shapes", "empty"]) {
  test(`${fixture} export embeds only needed fonts and replays offline`, async ({
    page,
    browser,
  }, info) => {
    const data = await createFixture(page, fixture);
    await checkOffline(browser, info.outputPath(`${fixture}.html`), data);
  });
}
test("a missing standalone player returned as an HTML fallback fails before downloading", async ({
  page,
}) => {
  await page.route("**/player.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>Application fallback</body></html>",
    }),
  );
  let error = "";
  try {
    await createFixture(page, "empty");
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  expect(error).toMatch(/presentation asset|player|JavaScript|content.type/i);
});
test("font bytes changed after successful loading are rejected during HTML packaging", async ({
  page,
}) => {
  await page.route("**/__export-edge.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: harness }),
  );
  await page.goto("/");
  await page.evaluate(async () => {
    const source = "/__export-edge.js";
    const core = await import(source);
    await core.loadFonts();
    (window as any).__edgeCore = core;
  });
  await page.route("**/fonts/mono-bold.woff2", (route) =>
    route.fulfill({
      contentType: "font/woff2",
      body: "Corrupt replacement font bytes",
    }),
  );
  const error = await page.evaluate(async () => {
    const core = (window as any).__edgeCore,
      scene = structuredClone(core.EXAMPLES[0].scene);
    scene.layers[0].fontId = "mono-bold";
    try {
      await core.createHtml(scene);
      return "";
    } catch (cause) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  });
  expect(error).toMatch(/font|hash|integrity/i);
});
