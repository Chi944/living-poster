import { test, expect, type Page } from "@playwright/test";

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

test("adding attraction visibly moves a centered shape", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page
    .getByRole("button", { name: "Create blank square canvas" })
    .click();
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  const canvas = page.getByLabel("Poster artboard.", { exact: false });
  const frame = () =>
    canvas.evaluate(
      (element: HTMLCanvasElement) =>
        new Promise<string>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(element.toDataURL())),
          ),
        ),
    );
  const still = await frame();
  await page
    .getByRole("button", { name: "Add behaviour", exact: true })
    .click();
  await page.getByRole("button", { name: "Attract", exact: true }).click();
  const time = page.getByLabel("Playhead", { exact: true });
  await time.press("Home");
  for (let i = 0; i < 5; i++) await time.press("PageUp");
  await expect.poll(async () => (await frame()) !== still).toBe(true);
});

test("Motion offers a direct layer choice when no layer is selected", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  const target = page.getByRole("combobox", { name: "Layer to animate" });
  await expect(target).toBeVisible();
  await target.selectOption({ label: "Gravity headline" });
  await page.getByRole("button", { name: "Open motion playground" }).click();
  await expect(
    page.getByRole("dialog", { name: "Motion playground" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply Text pressure animation" }),
  ).toBeEnabled();
});

test("an empty canvas offers a working route from Motion to adding a layer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page
    .getByRole("button", { name: "Create blank square canvas" })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  const layerTools = page.getByRole("button", { name: "Open layer tools" });
  await expect(layerTools).toBeVisible();
  await layerTools.click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open motion playground" }),
  ).toBeEnabled();
});

test("adding a behavior starts its preview and reveals the canvas on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page
    .getByRole("button", { name: "Add behaviour", exact: true })
    .click();
  await page.getByRole("button", { name: "Float", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Poster artboard.", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Playhead", { exact: true }).inputValue()),
    )
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Edit canvas", exact: true }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add behaviour", exact: true }),
  ).toBeVisible();
});
