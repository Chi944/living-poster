import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Edit canvas", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => document.fonts.check("24px LP-space-bold"));
}
async function editHeadline(page: Page, words: string) {
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill(words);
  await text.press("Tab");
  await expect(text).toHaveValue(words);
}

test("browser studio saves and restores without authentication, server API, or loopback calls", async ({
  page,
}) => {
  const unexpected: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/") ||
      /:1143[45]/.test(request.url())
    )
      unexpected.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await editHeadline(page, "FREEFORM");
  await page.getByLabel("Project name").fill("Browser saved poster");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText("Saved");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Browser saved poster",
  );
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("FREEFORM");
  await page.getByRole("button", { name: "Studio settings" }).click();
  await expect(
    page.getByText("No password is needed here.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect local Ollama" }),
  ).toBeVisible();
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("portable presentation opens in a separate browser profile and remains an immutable snapshot", async ({
  page,
  browser,
}) => {
  await open(page);
  await editHeadline(page, "SHARED");
  await page.getByLabel("Project name").fill("Portable snapshot");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = page.locator(".share-link");
  await expect(link).toBeVisible();
  const url = (await link.getAttribute("href"))!;
  expect(url).toContain("/p/shared#v1.");
  await expect(
    page.getByText("cannot be revoked", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await editHeadline(page, "CHANGED");
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const viewer = await context.newPage();
  const errors: string[] = [];
  viewer.on("pageerror", (error) => errors.push(error.message));
  await viewer.goto(url);
  await expect(viewer.locator("canvas")).toBeVisible();
  await expect(viewer.locator(".presentation .sr-only")).toContainText(
    "SHARED",
  );
  await expect(viewer.locator(".presentation .sr-only")).not.toContainText(
    "CHANGED",
  );
  await expect(
    viewer.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  await viewer.reload();
  await expect(viewer.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("four blank formats resize correctly and remain editable after motion presets", async ({
  page,
}) => {
  await open(page);
  for (const [format, width, height] of [
    ["square", 1080, 1080],
    ["story", 1080, 1920],
    ["landscape", 1920, 1080],
    ["portrait", 1080, 1350],
  ] as const) {
    await page.getByRole("button", { name: "New canvas", exact: true }).click();
    await page
      .getByRole("button", { name: `Create blank ${format} canvas` })
      .click();
    await expect(page.getByLabel("Artboard format")).toHaveValue(format);
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByRole("tab", { name: "Motion", exact: true }).click();
    await page
      .getByRole("button", { name: "Apply Heartbeat animation" })
      .click();
    await page
      .getByRole("button", { name: "Edit canvas", exact: true })
      .click();
    await page.getByRole("tab", { name: "Text & style", exact: true }).click();
    const text = page.getByRole("textbox", { name: "Text", exact: true });
    await text.fill(format.toUpperCase());
    await text.press("Tab");
    await expect(text).toHaveValue(format.toUpperCase());
    const rect = (await page.locator("canvas.artboard").boundingBox())!;
    expect(rect.width / rect.height).toBeCloseTo(width / height, 1);
  }
});

test("hosted landscape HTML export works offline with bundled fonts", async ({
  page,
  browser,
}, info) => {
  await open(page);
  await page.getByLabel("Artboard format").selectOption("landscape");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Living poster Self-contained HTML",
      exact: false,
    })
    .click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download HTML", exact: true })
    .click();
  const download = await downloadEvent;
  const file = info.outputPath("hosted-landscape.html");
  await download.saveAs(file);
  expect((await readFile(file, "utf8")).length).toBeGreaterThan(100000);
  const context = await browser.newContext({
    offline: true,
    reducedMotion: "reduce",
  });
  const viewer = await context.newPage();
  const errors: string[] = [];
  viewer.on("pageerror", (error) => errors.push(error.message));
  await viewer.goto(pathToFileURL(file).href);
  await expect(viewer.locator("#status")).toBeEmpty();
  await expect(viewer.locator("#poster")).toHaveAttribute("width", "1920");
  await expect(viewer.locator("#poster")).toHaveAttribute("height", "1080");
  await expect(
    viewer.getByRole("button", { name: "Play animation" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("damaged share links fail clearly without an editable private workspace", async ({
  page,
}) => {
  await page.goto("/p/shared#v1.deflate.invalid");
  await expect(page.getByRole("alert")).toContainText(/damaged|invalid/);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
});
