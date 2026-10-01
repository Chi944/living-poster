import { test, expect, type Locator } from "@playwright/test";

const recipes = [
  "Text pressure",
  "Magnetic turn",
  "Soft drift",
  "Letter wave",
  "Ripple",
  "Scatter",
  "Satellite",
  "Heartbeat",
  "Pendulum",
  "Spring",
  "Soft reveal",
  "Breathe",
  "Magnetic",
  "Personal space",
];

async function letterInk(canvas: Locator) {
  return canvas.evaluate(
    (element: HTMLCanvasElement) =>
      new Promise<{
        width: number;
        ink: number[];
        pointer: { left: number; top: number; right: number; bottom: number };
      }>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const { width, height } = element;
            const pixels = element
              .getContext("2d")!
              .getImageData(0, 0, width, height).data;
            const ink: number[] = [];
            const pointer = {
              left: width,
              top: height,
              right: -1,
              bottom: -1,
            };
            for (let index = 0; index < pixels.length; index += 4) {
              const [r, g, b] = pixels.slice(index, index + 3);
              const position = index / 4;
              if (r === 32 && g === 33 && b === 31) ink.push(position);
              // The demo cursor is navy and white. Its movement, including
              // covering existing text, must not count as animated lettering.
              if (r < 70 && g > r + 4 && b > g + 8) {
                const x = position % width;
                const y = Math.floor(position / width);
                pointer.left = Math.min(pointer.left, x - 6);
                pointer.top = Math.min(pointer.top, y - 6);
                pointer.right = Math.max(pointer.right, x + 6);
                pointer.bottom = Math.max(pointer.bottom, y + 6);
              }
            }
            resolve({ width, ink, pointer });
          }),
        );
      }),
  );
}

test("all fourteen recipe buttons animate the selected lettering, including centered Magnetic", async ({
  page,
}) => {
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
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page
    .getByRole("button", { name: "Create blank square canvas", exact: true })
    .click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("MOVE");
  await text.press("Tab");
  const size = page.getByRole("spinbutton", { name: "Size", exact: true });
  await size.fill("140");
  await size.press("Tab");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  const y = page.getByRole("spinbutton", { name: "Y", exact: true });
  await y.fill("540");
  await y.press("Tab");
  await expect(y).toHaveValue("540");
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Open motion playground" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion playground" });
  const canvas = dialog.getByLabel("Motion preview", { exact: true });
  const time = dialog.getByLabel("Preview time");

  for (const [index, recipe] of recipes.entries()) {
    await test.step(recipe, async () => {
      if (index > 0 && index % 6 === 0)
        await dialog.getByRole("button", { name: "Next motion page" }).click();
      await dialog
        .getByRole("button", { name: `Preview ${recipe}`, exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Pause motion preview" }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Pause motion preview" })
        .click();
      // Both samples use the actual scrubber while paused, so changes to its
      // clock, another template layer, or a moving cursor cannot mask failure.
      await time.press("Home");
      await time.press("PageUp");
      const before = await letterInk(canvas);
      await time.press("PageUp");
      await time.press("PageUp");
      const after = await letterInk(canvas);
      expect(
        before.ink.length,
        `${recipe} has visible lettering`,
      ).toBeGreaterThan(500);
      const outsidePointer = (position: number) => {
        const x = position % before.width;
        const y = Math.floor(position / before.width);
        return [before.pointer, after.pointer].every(
          (rect) =>
            x < rect.left || x > rect.right || y < rect.top || y > rect.bottom,
        );
      };
      const first = new Set(before.ink.filter(outsidePointer));
      const second = new Set(after.ink.filter(outsidePointer));
      const changed =
        [...first].filter((position) => !second.has(position)).length +
        [...second].filter((position) => !first.has(position)).length;
      expect(
        changed,
        `${recipe} must change text pixels away from either cursor footprint`,
      ).toBeGreaterThan(50);
    });
  }
});
