import { test, expect, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      json: {
        free: true,
        authenticated: false,
        needsSetup: false,
        storage: "sqlite",
        ai: {
          available: false,
          model: "qwen3:4b",
          reason: "Offline for UI regression tests",
        },
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Edit canvas", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Setting the type…")).toHaveCount(0);
  await page.waitForFunction(() => document.fonts.check("24px LP-space-bold"));
}

test("interrupted pointer recordings always return to an editable canvas", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  for (const action of [
    "Pause playback",
    "Edit canvas",
    "Cancel pointer recording",
  ]) {
    await page
      .getByRole("button", { name: "Record pointer loop", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel pointer recording" }),
    ).toBeVisible();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Record pointer loop", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Playhead")).toBeEnabled();
    await page
      .getByRole("textbox", { name: "Text", exact: true })
      .fill("EDITABLE");
    await page.getByRole("textbox", { name: "Text", exact: true }).press("Tab");
    await expect(
      page.getByRole("textbox", { name: "Text", exact: true }),
    ).toHaveValue("EDITABLE");
  }
  await page
    .getByRole("button", { name: "Record pointer loop", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Record pointer loop", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record pointer loop", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Size", exact: true }).fill("120");
  await page
    .getByRole("spinbutton", { name: "Size", exact: true })
    .press("Tab");
  await expect(
    page.getByRole("button", { name: "Record pointer loop", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "Size", exact: true }),
  ).toHaveValue("120");
});

test("invalid inspector drafts recover and can be corrected immediately", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  const size = page.getByRole("spinbutton", { name: "Size", exact: true });
  const before = await size.inputValue();
  await size.fill("999");
  await size.press("Tab");
  await expect(size).toHaveValue(before);
  await size.fill("130");
  await size.press("Tab");
  await expect(size).toHaveValue("130");
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("A".repeat(240));
  await text.press("Tab");
  await expect(text).toHaveValue("GRAVITY");
  await text.fill("BETTER");
  await text.press("Tab");
  await expect(text).toHaveValue("BETTER");
  await size.fill("190");
  await size.press("Escape");
  await expect(size).toHaveValue("130");
});

test("blank formats, animated canvas selection and double-click text editing work together", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await expect(page.locator(".blank-canvases button")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Create blank square canvas" })
    .click();
  await expect(page.getByLabel("Artboard format")).toHaveValue("square");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByLabel("Layer name")).toHaveValue("New text");
  await page.getByRole("button", { name: "Apply Heartbeat animation" }).click();
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  const art = page.locator("canvas.artboard");
  const box = (await art.boundingBox())!;
  await page.mouse.dblclick(
    box.x + box.width * 0.48,
    box.y + box.height * 0.484,
  );
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await expect(text).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Play poster", exact: true }),
  ).toBeVisible();
  await text.fill("THRIVE");
  await text.press("Tab");
  await expect(text).toHaveValue("THRIVE");
  const x = Number(
    await page.getByRole("spinbutton", { name: "X", exact: true }).inputValue(),
  );
  await art.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue(String(x + 1));
  await page.getByLabel("Artboard format").selectOption("landscape");
  await expect(page.locator(".stage-meta")).toContainText("1920 × 1080");
  const resized = (await art.boundingBox())!;
  expect(resized.width / resized.height).toBeCloseTo(1920 / 1080, 1);
  await page.getByRole("button", { name: "Apply Spring animation" }).click();
  await page.getByRole("button", { name: "Edit canvas", exact: true }).click();
  await text.fill("STILL EDITABLE");
  await text.press("Tab");
  await expect(text).toHaveValue("STILL EDITABLE");
  expect(errors).toEqual([]);
});

test("templates can be filtered by canvas format", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page.getByLabel("Filter templates by format").selectOption("story");
  await expect(page.locator(".example-grid button")).toHaveCount(1);
  await page.locator(".example-grid button").click();
  await expect(page.getByLabel("Artboard format")).toHaveValue("story");
  await page.getByRole("button", { name: "Edit canvas", exact: true }).click();
  await expect(page.locator(".render-error")).toHaveCount(0);
});
