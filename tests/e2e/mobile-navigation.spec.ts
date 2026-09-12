import { test, expect, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function openStudio(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Setting the type…")).toHaveCount(0);
  await page.waitForFunction(() => document.fonts.check("24px LP-space-bold"));
}

test("choosing a template reveals the canvas, while a blank canvas opens its layers", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByRole("button", { name: "Layers", exact: true }).tap();
  await page.getByRole("button", { name: "Browse all examples" }).tap();
  await page
    .getByRole("textbox", { name: "Search templates" })
    .fill("Fresh press");
  await page.getByRole("button", { name: /^FRESH PRESS/ }).tap();
  await expect(page.getByLabel("Project name")).toHaveValue("FRESH PRESS");
  await expect(
    page.getByLabel("Poster artboard.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Canvas", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "New canvas", exact: true }).tap();
  await page
    .getByRole("button", { name: "Create blank square canvas", exact: true })
    .tap();
  await expect(
    page.getByRole("button", { name: "Layers", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Text", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Project name")).toHaveValue("Untitled square");
});

test("playback and pointer recording reveal the canvas from mobile tools or layers", async ({
  page,
}) => {
  await openStudio(page);
  const artboard = page.getByLabel("Poster artboard.", { exact: false });
  await page.getByRole("button", { name: "Tools", exact: true }).tap();
  await expect(artboard).toBeHidden();
  await page.getByRole("button", { name: "Play poster", exact: true }).tap();
  await expect(artboard).toBeVisible();
  await page.getByRole("button", { name: "Pause playback", exact: true }).tap();

  const previousPointerMode = await page
    .getByRole("combobox", { name: "Pointer mode" })
    .inputValue();
  await page.getByRole("button", { name: "Layers", exact: true }).tap();
  await expect(artboard).toBeHidden();
  await page
    .getByRole("button", { name: "Record pointer loop", exact: true })
    .tap();
  await expect(artboard).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Canvas", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Cancel pointer recording", exact: true })
    .tap();
  await expect(
    page.getByRole("combobox", { name: "Pointer mode" }),
  ).toHaveValue(previousPointerMode);
});

test("touch users can hide, show, lock and unlock layers without hover", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByRole("button", { name: "Layers", exact: true }).tap();
  const hide = page.getByRole("button", {
    name: "Hide Gravity headline",
    exact: true,
  });
  await expect(hide).toBeVisible();
  const box = await hide.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await hide.tap();
  await page
    .getByRole("button", { name: "Show Gravity headline", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Lock Gravity headline", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .tap();
  await page.getByRole("button", { name: "Layers", exact: true }).tap();
  await page
    .getByRole("button", { name: "Unlock Gravity headline", exact: true })
    .tap();
  await expect(
    page.getByRole("button", { name: "Lock Gravity headline", exact: true }),
  ).toBeVisible();
});
