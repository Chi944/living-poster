import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
  await page.waitForFunction(() => document.fonts.check("24px LP-caveat-bold"));
}
test("each editing task is reachable directly in a single panel on a laptop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  for (const [tab, control] of [
    ["Text & style", "Choose typeface: Space Grotesk Bold"],
    ["Motion", "Apply Personal space animation"],
    ["AI", "Apply AI instruction"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("button", { name: control, exact: true }),
    ).toBeInViewport();
    expect(
      await page
        .locator(".tool-content")
        .evaluate((element) => element.scrollTop),
    ).toBe(0);
    const innerScrollers = await page
      .locator(".tool-content")
      .evaluate(
        (element) =>
          Array.from(element.querySelectorAll<HTMLElement>("*")).filter(
            (child) =>
              child.getClientRects().length &&
              ["auto", "scroll"].includes(getComputedStyle(child).overflowY) &&
              child.scrollHeight > child.clientHeight + 1,
          ).length,
      );
    expect(innerScrollers).toBe(0);
  }
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("spinbutton", { name: "Rotation", exact: true }),
  ).toBeInViewport();
  const previousX = await page
    .getByRole("spinbutton", { name: "X", exact: true })
    .inputValue();
  await page
    .getByRole("tab", { name: "Layout", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Motion", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Motion", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue(previousX);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("font previews search all nineteen faces and fit wider text with undo", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose typeface: Space Grotesk Bold" })
    .click();
  await expect(page.locator(".font-results > button")).toHaveCount(19);
  const previewFits = await page
    .locator(".font-results > button")
    .first()
    .evaluate((card) => {
      const preview = card
        .querySelector(".font-sample")!
        .getBoundingClientRect();
      const box = card.getBoundingClientRect();
      return preview.height >= 30 && preview.bottom <= box.bottom;
    });
  expect(previewFits).toBe(true);
  await page.getByLabel("Search fonts").press("Escape");
  await expect(
    page.getByRole("button", { name: "Choose typeface: Space Grotesk Bold" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Choose typeface: Space Grotesk Bold" })
    .click();
  await page.getByLabel("Search fonts").fill("Playfair");
  await expect(page.locator(".font-results > button")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Use Playfair Display Bold", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Choose a typeface" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Choose typeface: Playfair Display Bold",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("GRAVITY");
  await expect(page.locator(".render-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose typeface: Space Grotesk Bold" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose typeface: Space Grotesk Bold" })
    .click();
  await page.getByLabel("Font category").selectOption("handwriting");
  await expect(page.locator(".font-results > button")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Use Caveat Bold", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose typeface: Caveat Bold" }),
  ).toBeVisible();
});

test("clicking the artboard commits pending text before changing selection", async ({
  page,
}) => {
  await open(page);
  const headline = page.getByRole("button", {
    name: "Gravity headline",
    exact: true,
  });
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await headline.click();
  await text.fill("EARTH");
  await page.locator(".artboard").click({ position: { x: 4, y: 4 } });
  await expect(text).toHaveCount(0);
  await headline.click();
  await expect(text).toHaveValue("EARTH");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveValue("GRAVITY");
});

test("template dialog cycles keyboard focus past disabled pagination", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page.getByLabel("Search templates").fill("Fresh press");
  await expect(
    page.getByRole("button", { name: "Next template page" }),
  ).toBeDisabled();
  const close = page.getByRole("button", { name: "Close dialog" });
  await close.focus();
  await close.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: /^FRESH PRESS/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("templates are searchable and paginated without a long gallery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await page.getByRole("button", { name: "Browse all examples" }).click();
  await expect(page.getByText("22 templates", { exact: true })).toBeVisible();
  await expect(page.locator(".example-grid > button")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Next template page" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Next template page" }).click();
  await expect(page.getByText("Page 2 of 4", { exact: true })).toBeVisible();
  await page.getByLabel("Search templates").fill("night garden");
  await expect(page.locator(".example-grid > button")).toHaveCount(1);
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await page.locator(".example-grid > button").click();
  await expect(page.getByLabel("Project name")).toHaveValue("NIGHT GARDEN");
  await expect(page.getByLabel("Artboard format")).toHaveValue("story");
  await expect(page.locator(".render-error")).toHaveCount(0);
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page
    .getByLabel("Filter templates by category")
    .selectOption("Wellness");
  await expect(page.locator(".example-grid > button").first()).toBeVisible();
  await page.getByLabel("Search templates").fill("no matching template");
  await expect(
    page.getByText("No templates match.", { exact: false }),
  ).toBeVisible();
});

test("mobile uses full-width views and preserves text edits across navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const views = page.getByRole("navigation", { name: "Studio views" });
  await expect(page.locator(".artboard")).toBeVisible();
  await views.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(views.getByRole("button", { name: "Tools" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("MOTION");
  await text.press("Tab");
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Apply Breathe animation" }).click();
  await views.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".artboard")).toBeVisible();
  await page.getByRole("button", { name: "Edit canvas", exact: true }).click();
  await views.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await expect(text).toHaveValue("MOTION");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
