import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Scene } from "../../packages/core/src";

test.use({ hasTouch: true });

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
}

async function exportScene(page: Page, fixedPointer = false): Promise<Scene> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Editable scene/ }).click();
  if (fixedPointer)
    await page.getByLabel("Pointer in the export").selectOption("fixed");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  return JSON.parse(await readFile((await (await downloaded).path())!, "utf8"));
}

async function pressurePoster(page: Page) {
  await open(page);
  await page.getByRole("button", { name: "New canvas", exact: true }).click();
  await page
    .getByRole("button", { name: "Create blank square canvas", exact: true })
    .click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("tab", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: "Open motion playground" }).click();
  await page
    .getByRole("button", { name: "Apply Text pressure animation" })
    .click();
}

test("Restart keeps playback running and leaves paused playback paused", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Play poster", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel("Playhead").inputValue()))
    .toBeGreaterThan(200);
  await page.getByRole("button", { name: "Restart playback" }).click();
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByLabel("Playhead").inputValue()))
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Pause playback" }).click();
  await page.getByRole("button", { name: "Restart playback" }).click();
  await expect(page.getByLabel("Playhead")).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "Play poster", exact: true }),
  ).toBeVisible();
});

test("Restart cancels an in-progress recording without replacing its saved path", async ({
  page,
}) => {
  await open(page);
  const before = await exportScene(page);
  await page
    .getByRole("button", { name: "Record pointer loop", exact: true })
    .click();
  await page.getByRole("button", { name: "Restart playback" }).click();
  await expect(
    page.getByRole("button", { name: "Record pointer loop", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play poster", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Playhead")).toHaveValue("0");
  expect((await exportScene(page)).pointer).toEqual(before.pointer);
});

test("Fixed pointer keeps the last canvas position active after moving to the control", async ({
  page,
}) => {
  await pressurePoster(page);
  const canvas = page.getByLabel("Poster artboard.", { exact: false });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
  await page.mouse.move(box.x + box.width + 10, box.y + box.height + 10);
  await page.getByLabel("Pointer mode").selectOption("fixed");
  const scene = await exportScene(page);
  expect(scene.pointer.mode).toBe("fixed");
  if (scene.pointer.mode !== "fixed")
    throw new Error("Expected a fixed pointer");
  expect(scene.pointer.sample.presence).toBe(1);
  expect(scene.pointer.sample.x).toBeCloseTo(scene.artboard.width * 0.4, 0);
  expect(scene.pointer.sample.y).toBeCloseTo(scene.artboard.height * 0.45, 0);
});

test("touch previews reactive motion without moving layers and Edit canvas restores dragging", async ({
  page,
}) => {
  await pressurePoster(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await exportScene(page);
  const canvas = page.getByLabel("Poster artboard.", { exact: false });
  const box = (await canvas.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const touch = async (
    type: "touchStart" | "touchMove" | "touchEnd",
    x = 0.5,
    y = 0.5,
  ) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd"
          ? []
          : [{ x: box.x + box.width * x, y: box.y + box.height * y, id: 1 }],
    });
  const image = () =>
    canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await touch("touchStart", 0.4, 0.45);
  const initial = await image();
  await touch("touchMove", 0.7, 0.5);
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  await expect.poll(image).not.toBe(initial);
  await touch("touchEnd");
  expect((await exportScene(page)).layers).toEqual(before.layers);
  await page.getByRole("button", { name: "Edit canvas", exact: true }).click();
  await touch("touchStart", 0.5, 0.5);
  await touch("touchMove", 0.55, 0.5);
  await touch("touchEnd");
  const after = await exportScene(page);
  expect(after.layers[0].layout.x).toBeGreaterThan(before.layers[0].layout.x);
  await session.detach();
});

test("Freeze current pointer exports an active pointer after leaving the canvas", async ({
  page,
}) => {
  await pressurePoster(page);
  const box = (await page
    .getByLabel("Poster artboard.", { exact: false })
    .boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.mouse.move(box.x - 10, box.y - 10);
  const scene = await exportScene(page, true);
  if (scene.pointer.mode !== "fixed")
    throw new Error("Expected a fixed pointer");
  expect(scene.pointer.sample.presence).toBe(1);
  expect(scene.pointer.sample.x).toBeCloseTo(scene.artboard.width * 0.6, 0);
  expect(scene.pointer.sample.y).toBeCloseTo(scene.artboard.height * 0.5, 0);
});

test("touch input records a pointer loop and cancellation releases capture", async ({
  page,
}) => {
  await pressurePoster(page);
  const before = await exportScene(page);
  await page.getByLabel("Loop duration").selectOption("2000");
  await page
    .getByRole("button", { name: "Record pointer loop", exact: true })
    .click();
  const box = (await page
    .getByLabel("Poster artboard.", { exact: false })
    .boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const touch = async (
    type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
    x = 0.5,
  ) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: ["touchEnd", "touchCancel"].includes(type)
        ? []
        : [{ x: box.x + box.width * x, y: box.y + box.height * 0.5, id: 1 }],
    });
  await touch("touchStart", 0.4);
  await expect(
    page.getByRole("button", { name: "Cancel pointer recording" }),
  ).toBeVisible();
  await touch("touchMove", 0.6);
  await expect
    .poll(async () => Number(await page.getByLabel("Playhead").inputValue()))
    .toBeGreaterThan(250);
  await touch("touchCancel");
  await expect(
    page.getByRole("button", { name: "Cancel pointer recording" }),
  ).toBeVisible();
  await touch("touchStart", 0.5);
  await touch("touchMove", 0.65);
  await touch("touchEnd");
  await expect(page.getByLabel("Pointer mode")).toHaveValue("recorded", {
    timeout: 5000,
  });
  const after = await exportScene(page);
  if (after.pointer.mode !== "recorded")
    throw new Error("Expected recorded input");
  expect(after.pointer.samples.some((sample) => sample.presence > 0)).toBe(
    true,
  );
  expect(after.layers.map((layer) => layer.layout)).toEqual(
    before.layers.map((layer) => layer.layout),
  );
  await session.detach();
});

test("selecting Live pointer from paused tools starts a visible preview", async ({
  page,
}) => {
  await pressurePoster(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Edit canvas", exact: true }).click();
  await page.getByLabel("Pointer mode").selectOption("disabled");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByLabel("Pointer mode").selectOption("live");
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Poster artboard.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("HOVER OR TOUCH · EDIT CANVAS TO MOVE", { exact: true }),
  ).toBeVisible();
});
