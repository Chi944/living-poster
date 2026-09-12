import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const password = "browser-suite-local-only";
let harness = "";
test.beforeAll(async ({ request }) => {
  await request.post("/api/auth/setup", {
    data: { password },
    headers: { origin: "http://127.0.0.1:4328" },
  });
  const bundle = await build({
    stdin: {
      contents:
        "export * from './packages/core/src/index.ts'; export * from './apps/web/src/exports.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "esm",
    write: false,
    platform: "browser",
  });
  harness = bundle.outputFiles[0].text;
});
async function open(page: Page, auth = true) {
  if (auth)
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: { password },
          headers: { origin: "http://127.0.0.1:4328" },
        })
      ).ok(),
    ).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play poster", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Setting the type…")).toHaveCount(0);
  await page.waitForFunction(() => document.fonts.check("24px LP-space-bold"));
}
async function selectHeadline(page: Page) {
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
}
async function harnessRoute(page: Page) {
  await page.route("**/__harness.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: harness }),
  );
}

test("manual typography, direct drag, keyboard nudge, undo/redo and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await selectHeadline(page);
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("MOTION");
  await page.getByRole("textbox", { name: "Text", exact: true }).press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("MOTION");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  const x = Number(
    await page.getByRole("spinbutton", { name: /^X( px)?$/ }).inputValue(),
  );
  const art = page.getByLabel("Poster artboard.", { exact: false });
  await art.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("spinbutton", { name: /^X( px)?$/ })).toHaveValue(
    String(x + 1),
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: /^X( px)?$/ })).toHaveValue(
    String(x),
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: /^X( px)?$/ })).toHaveValue(
    String(x + 1),
  );
  const box = await art.boundingBox();
  if (!box) throw Error("No artboard");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.52, {
    steps: 5,
  });
  await page.mouse.up();
  await page.getByLabel("Project name").fill("Browser workflow");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText(
    "Saved to local library",
  );
  const projects = await (await page.request.get("/api/projects")).json();
  const saved = projects.projects.find(
    (p: any) => p.name === "Browser workflow",
  );
  expect(saved).toBeTruthy();
  const snapshot = await (
    await page.request.get(`/api/projects/${saved.id}`)
  ).json();
  expect(
    snapshot.scene.layers.find((l: any) => l.name === "Gravity headline").text,
  ).toBe("MOTION");
  await page.getByLabel("Project name").fill("Renamed browser workflow");
  await page.getByLabel("Project name").press("Tab");
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/projects/${saved.id}`)).json())
          .project.name,
    )
    .toBe("Renamed browser workflow");
  await page.reload();
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Renamed browser workflow",
  );
  await selectHeadline(page);
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("MOTION");
  expect(errors).toEqual([]);
});

test("searchable templates, shape creation, behavior controls and recorded pointer", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Browse all examples" }).click();
  await expect(page.locator(".example-grid button")).toHaveCount(6);
  await expect(page.locator(".template-filter-row")).toContainText(
    "22 templates",
  );
  await page
    .getByRole("textbox", { name: "Search templates", exact: true })
    .fill("Personal Space");
  await expect(page.locator(".example-grid button")).toHaveCount(1);
  await page
    .locator(".example-grid button")
    .filter({ hasText: "Personal Space" })
    .click();
  await expect(page.getByLabel("Project name")).toHaveValue("PERSONAL SPACE");
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await expect(page.getByLabel("Layer name")).toHaveValue("New shape");
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Add behaviour" }).click();
  await page.getByRole("button", { name: "Float", exact: true }).click();
  await page
    .locator(".motion-card summary")
    .filter({ hasText: "Float" })
    .click();
  await expect(page.getByLabel("Horizontal", { exact: true })).toBeVisible();
  await page.getByLabel("Horizontal", { exact: true }).fill("15");
  await page.getByLabel("Horizontal", { exact: true }).press("Tab");
  await page.getByLabel("Loop duration").selectOption("2000");
  await page
    .getByRole("button", { name: "Record pointer loop", exact: true })
    .click();
  const box = await page.locator(".artboard").boundingBox();
  if (!box) throw Error("No artboard");
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(
      box.x + box.width * (0.2 + i * 0.08),
      box.y + box.height * 0.6,
    );
    await page.waitForTimeout(260);
  }
  await expect(page.getByLabel("Pointer mode")).toHaveValue("recorded", {
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText(
    "Saved to local library",
  );
  const projects = await (await page.request.get("/api/projects")).json();
  const project = projects.projects.find(
    (p: any) => p.name === "PERSONAL SPACE",
  );
  const saved = await (
    await page.request.get(`/api/projects/${project.id}`)
  ).json();
  expect(saved.scene.pointer.samples.length).toBeGreaterThan(20);
  expect(saved.scene.pointer.samples[0].timeMs).toBe(0);
  expect(saved.scene.pointer.samples.at(-1).timeMs).toBe(2000);
  expect(saved.scene.pointer.samples[0].x).toBe(
    saved.scene.pointer.samples.at(-1).x,
  );
});

test("share is anonymous, pinned to a revision, and revocable", async ({
  page,
  browser,
}) => {
  await open(page);
  await page.getByLabel("Project name").fill("Pinned poster");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const share = page.locator(".share-link");
  await expect(share).toBeVisible();
  const url = (await share.getAttribute("href"))!;
  const token = new URL(url).pathname.split("/").at(-1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await selectHeadline(page);
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("NEW");
  await page.getByRole("textbox", { name: "Text", exact: true }).press("Tab");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText(
    "Saved to local library",
  );
  const guest = await browser.newContext({ reducedMotion: "reduce" });
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await expect(
    guestPage.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(
    (await guest.request.get("http://127.0.0.1:4328/api/projects")).status(),
  ).toBe(401);
  const snapshot = await (
    await guest.request.get(`http://127.0.0.1:4328/api/presentations/${token}`)
  ).json();
  expect(
    snapshot.scene.layers.find((l: any) => l.name === "Gravity headline").text,
  ).toBe("GRAVITY");
  expect(snapshot).not.toHaveProperty("history");
  const shares = await (await page.request.get("/api/shares")).json();
  const entry = shares.shares.find((s: any) => s.url === new URL(url).pathname);
  expect(entry).toBeTruthy();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Share links", exact: true }).click();
  await page
    .locator(".library-list article")
    .filter({ hasText: "Pinned poster" })
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(
    page.locator(".library-list article").filter({ hasText: "Pinned poster" }),
  ).toContainText("Revoked");
  expect(
    (
      await guest.request.get(
        `http://127.0.0.1:4328/api/presentations/${token}`,
      )
    ).status(),
  ).toBe(404);
  await guest.close();
});

test("PNG download and offline HTML use identical frames and inert poster text", async ({
  page,
  browser,
}, testInfo) => {
  await open(page);
  await harnessRoute(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /A moment in time/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  const download = await downloadPromise;
  const png = await readFile((await download.path())!);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1350);
  const result = await page.evaluate(async () => {
    const source = "/__harness.js";
    const m = await import(source);
    await m.loadFonts();
    const scene = structuredClone(m.EXAMPLES[0].scene);
    const layer = scene.layers.find((l: any) => l.name === "gravity footnote");
    layer.text = "</script><img src=x onerror=alert(1)>";
    layer.fontSize = 14;
    const compiled = m.compileScene(scene);
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    m.paintFrame(
      canvas.getContext("2d"),
      m.evaluateScene(compiled, {
        timeMs: 2300,
        pointer: m.samplePointer(scene, 2300),
      }),
    );
    return {
      html: await m.createHtml(scene),
      png: canvas.toDataURL("image/png"),
    };
  });
  const offlinePath = testInfo.outputPath("living-poster.html");
  await writeFile(offlinePath, result.html);
  const offline = await browser.newContext({
    offline: true,
    reducedMotion: "reduce",
  });
  const player = await offline.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  player.on("pageerror", (e) => errors.push(e.message));
  player.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  player.on("dialog", (d) => {
    errors.push("Poster text executed");
    void d.dismiss();
  });
  await player.goto(pathToFileURL(offlinePath).href);
  await expect(player.locator("#status")).toBeEmpty();
  const exported = await player.evaluate(() => {
    (window as any).livingPosterPlayer.seek(2300);
    return (document.getElementById("poster") as HTMLCanvasElement).toDataURL(
      "image/png",
    );
  });
  expect(exported).toBe(result.png);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  expect(await player.locator("img").count()).toBe(0);
  await expect(player.locator("#licenses")).toContainText(
    "SIL OPEN FONT LICENSE",
  );
  await offline.close();
});

test("missing or corrupted fonts fail closed with a useful retry", async ({
  page,
}) => {
  await page.route("**/fonts/space-bold.woff2", (route) =>
    route.fulfill({ body: "corrupt bytes", contentType: "font/woff2" }),
  );
  await page.goto("/");
  await expect(page.locator(".font-error")).toContainText(
    /font|integrity|hash/i,
  );
  await expect(page.getByRole("button", { name: "Retry fonts" })).toBeVisible();
});

test("keyboard controls and responsive layout remain accessible", async ({
  page,
}) => {
  await open(page, false);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".artboard")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a corrected pending AI instruction supersedes the old reply and preserves the correction", async ({
  page,
}) => {
  let submitted: any = null,
    posts = 0,
    ready = false;
  await page.route("**/api/capabilities", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      json: {
        ...body,
        ai: { available: true, model: "controlled-browser-fixture" },
      },
    });
  });
  await page.route("**/api/ai/edits", async (route) => {
    submitted = route.request().postDataJSON();
    posts++;
    await route.fulfill({
      json: { requestId: submitted.requestId, status: "queued" },
    });
  });
  await page.route("**/api/ai/edits/*", async (route) =>
    route.fulfill({
      json: {
        requestId: submitted.requestId,
        status: ready ? "completed" : "running",
        result: ready
          ? {
              kind: "edit",
              operations: [
                {
                  type: "setFill",
                  layerId: submitted.selectedLayerIds[0],
                  colour: "#124578",
                },
              ],
              summary: "Changed the headline colour.",
            }
          : undefined,
      },
    }),
  );
  await page.route("**/api/ai/edits/*/disposition", async (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await open(page);
  await selectHeadline(page);
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  const prompt = page.getByLabel("Describe a change");
  await prompt.fill("Change the headline colour.");
  await page.getByRole("button", { name: "Apply AI instruction" }).click();
  await expect(page.locator(".ai-message")).toContainText(/Queued|Composing/);
  await prompt.fill("Use a different blue for the headline.");
  await prompt.press("Control+Enter");
  expect(posts).toBe(1);
  ready = true;
  await expect(page.locator(".ai-message")).toContainText(
    "Response superseded",
  );
  await expect(prompt).toHaveValue("Use a different blue for the headline.");
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await expect(page.getByLabel("Fill", { exact: true })).toHaveValue("#20211f");
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Apply AI instruction" }).click();
  await expect(page.locator(".ai-message.applied")).toBeVisible();
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await expect(page.getByLabel("Fill", { exact: true })).toHaveValue("#124578");
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo this change", exact: true }),
  ).toBeVisible();
  await page.locator(".artboard").focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Undo this change", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await expect(page.getByLabel("Fill", { exact: true })).toHaveValue("#20211f");
});
