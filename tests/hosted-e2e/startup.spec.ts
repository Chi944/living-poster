import { test, expect } from "@playwright/test";

test("a delayed browser library chunk never opens local password dialogs", async ({
  page,
}) => {
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chunkRequested = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/assets/hosted-api-*.js", async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await chunkRequested;
    await expect(
      page.getByRole("button", { name: "Edit canvas", exact: true }),
    ).toBeVisible();
    for (const name of ["Save", "Share", "Library", "Open project library"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeDisabled();
      // A user can click the visible controls during loading. Native disabled
      // controls ignore that click instead of assuming local authentication.
      await button.evaluate((element: HTMLButtonElement) => element.click());
    }
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Connect", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Describe a change").fill("Make the headline float.");
    await expect(
      page.getByRole("button", { name: "Apply AI instruction" }),
    ).toBeDisabled();
    await page.getByLabel("Describe a change").press("Control+Enter");
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  } finally {
    release();
  }
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();
  await page.getByLabel("Project name").fill("Startup recovery poster");
  await save.click();
  await expect(page.locator(".save-status")).toHaveText(
    "Saved to local library",
  );
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page
      .locator(".project-open")
      .filter({ hasText: "Startup recovery poster" }),
  ).toBeVisible();
});
