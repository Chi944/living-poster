import { test, expect, type Page } from "@playwright/test";
import { EXAMPLES } from "../../packages/core/src";

async function editHeadline(page: Page, text: string) {
  await page.getByRole("tab", { name: "Text & style", exact: true }).click();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Text", exact: true });
  await input.fill(text);
  await input.press("Tab");
  await expect(input).toHaveValue(text);
}

test("demo resets edits without opening storage or changing the regular studio", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await editHeadline(page, "OWNER");
  await page.getByLabel("Project name").fill("Existing browser library");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText(
    "Saved to local library",
  );

  // Catch both reads and writes, including accidental opening of an empty DB.
  await context.addInitScript(() => {
    if (!/^\/demo\/?$/.test(location.pathname)) return;
    Object.defineProperty(window, "demoStorageAttempts", {
      value: [],
      configurable: true,
    });
    const denied = () => {
      (
        window as unknown as { demoStorageAttempts: string[] }
      ).demoStorageAttempts.push("storage");
      throw new Error("Unexpected persistent storage access in demo");
    };
    IDBFactory.prototype.open = denied;
    Storage.prototype.getItem = denied;
    Storage.prototype.setItem = denied;
    Storage.prototype.removeItem = denied;
    Storage.prototype.clear = denied;
  });
  const errors: string[] = [],
    unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || /:1143[45]/.test(url.href))
      unexpected.push(url.href);
  });
  await page.goto("/demo");
  await expect(page.getByLabel("Project name")).toHaveValue("GRAVITY");
  await expect(page.locator(".save-status")).toHaveText(
    "Temporary demo · resets on reload",
  );
  for (const name of ["Save", "Share", "Library", "Open project library"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  }
  await expect(page.getByRole("tab", { name: "AI", exact: true })).toHaveCount(
    0,
  );
  await editHeadline(page, "DEMO");
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await expect(
    page.getByText("Existing browser library", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Studio settings" }).click();
  await expect(
    page.getByText("This tab only · no saved data", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect local Ollama" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("GRAVITY");
  await editHeadline(page, "AGAIN");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("GRAVITY");
  await page
    .getByRole("tab", { name: "Text & style", exact: true })
    .press("End");
  await expect(
    page.getByRole("tab", { name: "Motion", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { demoStorageAttempts: string[] })
          .demoStorageAttempts,
    ),
  ).toEqual([]);

  await editHeadline(page, "BEFORE");
  await page.goto("/fonts/LICENSES.txt");
  await page.goBack();
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("GRAVITY");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { demoStorageAttempts: string[] })
          .demoStorageAttempts,
    ),
  ).toEqual([]);

  await page.goto("/");
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Existing browser library",
  );
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("OWNER");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page
      .locator(".project-open")
      .filter({ hasText: "Existing browser library" }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("demo sessions are independent between tabs and remain usable on mobile", async ({
  page,
  context,
}) => {
  await page.goto("/demo/");
  await editHeadline(page, "FIRST TAB");
  const other = await context.newPage();
  await other.goto("/demo");
  await other
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    other.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("GRAVITY");
  await other.setViewportSize({ width: 390, height: 844 });
  await expect(
    other.getByRole("button", { name: "Reset demo", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "Tools", exact: true }),
  ).toBeVisible();
  expect(
    await other.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await other.close();
});

test("fragments are ignored and explicit imports and downloads stay within the demo", async ({
  page,
}) => {
  const scene = structuredClone(EXAMPLES[0].scene);
  const headline = scene.layers.find(
    (layer) => layer.id === "gravity-headline",
  );
  if (headline?.kind !== "text") throw new Error("Missing bundled headline");
  headline.text = "IMPORT";
  await page.goto("/demo#v1.deflate.untrusted-snapshot");
  await expect(page.getByLabel("Project name")).toHaveValue("GRAVITY");
  await page.getByRole("button", { name: "Studio settings" }).click();
  await page.getByLabel("Import scene").setInputFiles({
    name: "temporary-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scene)),
  });
  await expect(page.getByLabel("Project name")).toHaveValue("temporary-import");
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("IMPORT");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("button", { name: "Editable scene JSON", exact: false })
    .click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.json$/);
  await page.reload();
  await expect(page.getByLabel("Project name")).toHaveValue("GRAVITY");
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveValue("GRAVITY");
});
