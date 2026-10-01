import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Scene } from "../../packages/core/src";

async function open(page: Page) {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      json: {
        free: true,
        authenticated: false,
        needsSetup: false,
        storage: "sqlite",
        ai: { available: false, model: "qwen3:4b" },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Setting the type…")).toHaveCount(0);
  await page.waitForFunction(() => document.fonts.check("24px LP-space-bold"));
}

async function scene(page: Page): Promise<Scene> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Editable scene/ }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

async function edgeText(page: Page) {
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page
    .getByRole("button", { name: "Create blank story canvas", exact: true })
    .click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("PRESS");
  await text.press("Tab");
  const size = page.getByRole("spinbutton", { name: "Size", exact: true });
  await size.fill("140");
  await size.press("Tab");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  const y = page.getByRole("spinbutton", { name: "Y", exact: true });
  await y.fill("180");
  await y.press("Tab");
  await expect(y).toHaveValue("180");
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
}

test("choosing a recipe starts its preview; pause and scrub remain controllable", async ({
  page,
}) => {
  await open(page);
  await edgeText(page);
  const before = await scene(page);
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  await expect(
    dialog.getByRole("button", { name: "Play motion preview" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Preview Soft drift", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Pause motion preview" }),
  ).toBeVisible();
  const time = dialog.getByLabel("Preview time");
  await expect
    .poll(async () => Number(await time.inputValue()))
    .toBeGreaterThan(300);
  await dialog.getByRole("button", { name: "Pause motion preview" }).click();
  const paused = await time.inputValue();
  await page.waitForTimeout(160);
  await expect(time).toHaveValue(paused);
  await time.press("Home");
  await time.press("PageUp");
  await expect
    .poll(async () => Number(await time.inputValue()))
    .toBeGreaterThan(0);
  await expect(
    dialog.getByRole("button", { name: "Play motion preview" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close motion playground" }).click();
  expect(await scene(page)).toEqual(before);
});

test("the demo pointer changes actual edge-layer ink for pressure and repel", async ({
  page,
}) => {
  await open(page);
  await edgeText(page);
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  const canvas = dialog.getByLabel("Motion preview", { exact: true });
  // Compare only the selected black lettering. The preview pointer's white/navy
  // ring cannot make this pass when it travels through empty artboard space.
  const ink = () =>
    canvas.evaluate(
      (element: HTMLCanvasElement) =>
        new Promise<{ count: number; hash: number }>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const pixels = element
                .getContext("2d")!
                .getImageData(
                  0,
                  0,
                  element.width,
                  Math.round(element.height / 3),
                ).data;
              let count = 0,
                hash = 2166136261;
              for (let index = 0; index < pixels.length; index += 4)
                if (
                  pixels[index] === 32 &&
                  pixels[index + 1] === 33 &&
                  pixels[index + 2] === 31
                ) {
                  count++;
                  hash = Math.imul(hash ^ index, 16777619) >>> 0;
                }
              resolve({ count, hash });
            }),
          );
        }),
    );
  const time = dialog.getByLabel("Preview time");
  for (const recipe of ["Text pressure", "Personal space"]) {
    await dialog.getByLabel("Motion category").selectOption("pointer");
    await dialog
      .getByRole("button", { name: `Preview ${recipe}`, exact: true })
      .click();
    const pause = dialog.getByRole("button", { name: "Pause motion preview" });
    if (await pause.count()) await pause.click();
    await time.press("Home");
    const initial = await ink();
    expect(initial.count).toBeGreaterThan(100);
    await time.press("PageUp");
    await time.press("PageUp");
    expect(await ink()).not.toEqual(initial);
    if (recipe === "Text pressure") {
      await time.press("Home");
      for (let index = 0; index < 20; index++) await canvas.press("ArrowDown");
      expect(await ink()).not.toEqual(initial);
      // Re-clicking a selected recipe is also a replay action. Keep the mouse
      // outside the preview so pointerleave cannot perform the reset for us.
      await dialog
        .getByRole("button", { name: "Preview Text pressure", exact: true })
        .press("Enter");
      await dialog
        .getByRole("button", { name: "Pause motion preview" })
        .press("Enter");
      await time.press("Home");
      expect(await ink()).toEqual(initial);
    }
  }
});

test("shape previews omit the empty typography filter and work at small sizes", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  await expect(
    dialog.getByLabel("Motion category").locator('option[value="type"]'),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 640 });
  const canvas = dialog.getByLabel("Motion preview", { exact: true });
  expect(
    await canvas.evaluate((element) => {
      const canvas = element.getBoundingClientRect();
      const holder = element.parentElement!.getBoundingClientRect();
      return (
        canvas.width <= holder.width + 1 && canvas.height <= holder.height + 1
      );
    }),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Preview Soft drift", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Pause motion preview" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(await dialog.getByLabel("Preview time").inputValue()),
    )
    .toBeGreaterThan(150);
});

test("personal-space demo reaches the pivot of a wide left-aligned layer", async ({
  page,
}) => {
  await open(page);
  await edgeText(page);
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("PRESSPRESS");
  await text.press("Tab");
  // Keep each intermediate edit within the artboard while moving from centered
  // text to a long line whose pivot is near the left edge.
  const size = page.getByRole("spinbutton", { name: "Size", exact: true });
  await size.fill("60");
  await size.press("Tab");
  await page
    .getByRole("combobox", { name: "Alignment", exact: true })
    .selectOption("left");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("40");
  await x.press("Tab");
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await size.fill("140");
  await size.press("Tab");
  await expect(size).toHaveValue("140");
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  await dialog.getByLabel("Motion category").selectOption("pointer");
  await dialog
    .getByRole("button", { name: "Preview Personal space", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Pause motion preview" }).click();
  const time = dialog.getByLabel("Preview time");
  const leftInk = () =>
    dialog.getByLabel("Motion preview", { exact: true }).evaluate(
      (canvas: HTMLCanvasElement) =>
        new Promise<number>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const pixels = canvas
                .getContext("2d")!
                .getImageData(
                  0,
                  0,
                  canvas.width,
                  Math.round(canvas.height / 3),
                ).data;
              let left = canvas.width;
              for (let index = 0; index < pixels.length; index += 4)
                if (
                  pixels[index] === 32 &&
                  pixels[index + 1] === 33 &&
                  pixels[index + 2] === 31
                )
                  left = Math.min(left, (index / 4) % canvas.width);
              resolve(left);
            }),
          );
        }),
    );
  await time.press("Home");
  const start = await leftInk();
  await time.press("PageUp");
  await time.press("PageUp");
  expect(await leftInk()).not.toBe(start);
});
