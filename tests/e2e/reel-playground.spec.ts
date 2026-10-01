import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import type { Scene } from "../../packages/core/src";

async function open(page: Page) {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      json: {
        free: true,
        authenticated: false,
        needsSetup: true,
        storage: "sqlite",
        ai: { available: false, model: "qwen3:4b" },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Setting the type…")).toHaveCount(0);
  await page.waitForFunction(() => document.fonts.check("24px LP-space-bold"));
}

async function selectHeadline(page: Page) {
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
}

async function exportScene(page: Page): Promise<Scene> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Editable scene/ }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  return JSON.parse(await readFile((await (await downloaded).path())!, "utf8"));
}

test("preview playback, pointer keys and cancel leave the complete poster unchanged", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await selectHeadline(page);
  const before = await exportScene(page);
  const launch = page.getByRole("button", { name: "Open motion playground" });
  await launch.click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  const preview = dialog.getByLabel("Motion preview", { exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Play motion preview" }),
  ).toBeVisible();
  const image = () =>
    preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const initial = await image();
  await preview.press("ArrowRight");
  await expect.poll(image).not.toBe(initial);
  await dialog.getByRole("button", { name: "Play motion preview" }).click();
  await expect
    .poll(() => dialog.getByLabel("Preview time").inputValue())
    .not.toBe("0");
  await dialog.getByRole("button", { name: "Pause motion preview" }).click();
  await page.screenshot({
    path: testInfo.outputPath("playground-desktop.png"),
  });
  await dialog.getByRole("button", { name: "Preview Magnetic turn" }).click();
  await dialog.getByRole("button", { name: "Close motion playground" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(launch).toBeFocused();
  expect(await exportScene(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("applying pressure changes only selected motion and one undo restores it", async ({
  page,
}) => {
  await open(page);
  await selectHeadline(page);
  const before = await exportScene(page);
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  await dialog
    .getByRole("button", { name: "Apply Text pressure animation" })
    .click();
  await expect(dialog).not.toBeVisible();
  const after = await exportScene(page);
  const headline = before.layers.find(
    (layer) => layer.name === "Gravity headline",
  )!;
  const changed = after.layers.find((layer) => layer.id === headline.id)!;
  expect(changed.behaviors.map((behavior) => behavior.type)).toEqual([
    "pressure",
  ]);
  expect({ ...changed, behaviors: headline.behaviors }).toEqual(headline);
  expect(after.layers.filter((layer) => layer.id !== headline.id)).toEqual(
    before.layers.filter((layer) => layer.id !== headline.id),
  );
  expect(after.pointer).toEqual(before.pointer);
  expect(after.artboard).toEqual(before.artboard);
  expect(after.revision.parentId).toBe(before.revision.id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await exportScene(page);
  expect({ ...undone, revision: before.revision }).toEqual(before);
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("EDITABLE");
  await page.getByRole("textbox", { name: "Text", exact: true }).press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("EDITABLE");
});

test("Scatter applies the exact randomized motion shown in its preview", async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      contents: "export * from './packages/core/src/index.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "esm",
    write: false,
    platform: "browser",
  });
  await page.route("**/__reel-test-core.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: bundle.outputFiles[0].text,
    }),
  );
  await open(page);
  await selectHeadline(page);
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  await dialog
    .getByRole("button", { name: "Preview Scatter", exact: true })
    .click();
  const time = dialog.getByLabel("Preview time");
  await time.press("Home");
  for (let index = 0; index < 3; index++) await time.press("PageUp");
  const timeMs = Number(await time.inputValue());
  expect(timeMs).toBeGreaterThan(1000);
  expect(timeMs).toBeLessThan(5000);
  const preview = await dialog
    .getByLabel("Motion preview", { exact: true })
    .evaluate(
      (canvas: HTMLCanvasElement) =>
        new Promise<{ png: string; width: number; height: number }>(
          (resolve) => {
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                resolve({
                  png: canvas.toDataURL(),
                  width: canvas.width,
                  height: canvas.height,
                }),
              ),
            );
          },
        ),
    );
  await dialog
    .getByRole("button", { name: "Apply Scatter animation", exact: true })
    .click();
  const scene = await exportScene(page);
  expect(
    scene.layers
      .find((layer) => layer.name === "Gravity headline")
      ?.behaviors.map((behavior) => behavior.type),
  ).toEqual(["scatter"]);
  const appliedFrame = await page.evaluate(
    async ({ scene, timeMs, width, height }) => {
      const source = "/__reel-test-core.js";
      const core = await import(source);
      await core.loadFonts();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      core.paintFrame(
        canvas.getContext("2d"),
        core.evaluateScene(core.compileScene(scene), {
          timeMs,
          pointer: core.samplePointer(scene, timeMs),
        }),
        width / scene.artboard.width,
      );
      return canvas.toDataURL();
    },
    { scene, timeMs, width: preview.width, height: preview.height },
  );
  expect(appliedFrame).toBe(preview.png);
});

test("Play resumes the demo pointer after positioning it with keyboard arrows", async ({
  page,
}) => {
  await open(page);
  // A single pressure-driven text layer has no unrelated timed animation that
  // could make this pixel comparison pass while the pointer remains stuck.
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page
    .getByRole("button", { name: "Create blank square canvas", exact: true })
    .click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  const preview = dialog.getByLabel("Motion preview", { exact: true });
  await preview.press("ArrowRight");
  const keyboardFrame = await preview.evaluate(
    (canvas: HTMLCanvasElement) =>
      new Promise<string>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(canvas.toDataURL())),
        ),
      ),
  );
  // Use the keyboard so a pointerleave event cannot accidentally reset the
  // manual pointer before Play does its own reset.
  await dialog
    .getByRole("button", { name: "Play motion preview" })
    .press("Enter");
  await expect
    .poll(async () =>
      Number(await dialog.getByLabel("Preview time").inputValue()),
    )
    .toBeGreaterThan(300);
  await dialog
    .getByRole("button", { name: "Pause motion preview" })
    .press("Enter");
  await expect
    .poll(() =>
      preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    )
    .not.toBe(keyboardFrame);
});

test("fourteen recipes are paginated, filtered and keyboard accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await selectHeadline(page);
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  const previews = dialog.getByRole("button", { name: /^Preview / });
  const next = dialog.getByRole("button", { name: "Next motion page" });
  await expect(previews).toHaveCount(6);
  await expect(
    dialog.getByRole("button", { name: "Previous motion page" }),
  ).toBeDisabled();
  const names = new Set<string>();
  for (let index = 0; index < 3; index++) {
    for (const button of await previews.all())
      names.add((await button.getAttribute("aria-label"))!);
    if (index < 2) await next.click();
  }
  expect(names.size).toBe(14);
  await expect(next).toBeDisabled();
  await dialog.getByLabel("Motion category").selectOption("pointer");
  await expect(previews).toHaveCount(3);
  await expect(
    dialog.getByRole("button", { name: "Preview Text pressure" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Preview Magnetic turn" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Preview Personal space" }),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await dialog.getByLabel("Motion category").selectOption("type");
  await expect(
    dialog.getByRole("button", { name: "Preview Letter wave" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Preview Magnetic turn" }),
  ).toHaveCount(0);
  await dialog.getByLabel("Motion category").selectOption("ambient");
  await expect(
    dialog.getByRole("button", { name: "Preview Soft drift" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Preview Text pressure" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Preview Soft drift" }).click();
  await expect(
    dialog.getByRole("button", { name: "Apply Soft drift animation" }),
  ).toBeInViewport();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const close = dialog.getByRole("button", { name: "Close motion playground" });
  await close.focus();
  await close.press("Tab");
  await expect(
    dialog.getByLabel("Motion preview", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open motion playground" }),
  ).toBeFocused();
});

test("mobile preview and apply fit the viewport without nested scrolling", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await selectHeadline(page);
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  await expect(
    dialog.getByLabel("Motion preview", { exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "Apply Text pressure animation" }),
  ).toBeInViewport();
  const fits = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return (
      box.left >= 0 &&
      box.right <= innerWidth &&
      box.top >= 0 &&
      box.bottom <= innerHeight
    );
  });
  expect(fits).toBe(true);
  const scrollContainers = await dialog.evaluate(
    (element) =>
      Array.from(element.querySelectorAll<HTMLElement>("*")).filter(
        (child) =>
          ["auto", "scroll"].includes(getComputedStyle(child).overflowY) &&
          child.scrollHeight > child.clientHeight + 1,
      ).length,
  );
  expect(scrollContainers).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("playground-mobile.png") });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Preview Magnetic turn" }).click();
  await dialog
    .getByRole("button", { name: "Apply Magnetic turn animation" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByLabel("Poster artboard.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit canvas", exact: true }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("GRAVITY");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
