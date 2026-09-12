/** Records real UI actions and a real local Ollama response. No model answers are mocked. */
import { chromium, expect } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { buildServer } from "../apps/api/src/server";

const temporary = await mkdtemp(join(tmpdir(), "living-poster-demo-"));
const output = resolve("docs/assets");
await mkdir(output, { recursive: true });
const server = await buildServer({
  dataDir: temporary,
  staticDir: resolve("dist/web"),
});
await server.listen({ host: "127.0.0.1", port: 4331 });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1512, height: 982 },
  recordVideo: { dir: temporary, size: { width: 1512, height: 982 } },
  reducedMotion: "reduce",
});
try {
  const setup = await server.inject({
    method: "POST",
    url: "/api/auth/setup",
    headers: { host: "127.0.0.1:4331" },
    payload: { password: randomUUID() },
  });
  if (setup.statusCode !== 200)
    throw Error("Could not initialize isolated demo studio.");
  await context.addCookies([
    {
      name: "lp_session",
      value: setup.cookies[0].value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4331");
  await expect(page.getByText("Setting the type…")).toHaveCount(0);
  await expect(page.locator(".model-status")).toContainText(
    process.env.OLLAMA_MODEL || "qwen3:4b",
  );
  const start = Date.now();
  const at = async (seconds: number) => {
    const remaining = start + seconds * 1000 - Date.now();
    if (remaining > 0) await page.waitForTimeout(remaining);
  };
  // These captions describe the recording. They do not alter scenes or model results.
  const caption = async (text: string) =>
    page.evaluate((text) => {
      let el = document.getElementById("demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-caption";
        el.style.cssText =
          "position:fixed;top:21px;left:465px;z-index:1000;padding:9px 16px;border-radius:5px;background:#e7e9dc;color:#343b28;font:13px Studio,system-ui;pointer-events:none;max-width:445px";
        document.body.append(el);
      }
      el.textContent = text;
    }, text);
  await page.screenshot({ path: join(output, "studio.png") });
  await caption("01 / Start with a composition");
  await at(4);
  await page
    .getByRole("button", { name: "Gravity headline", exact: true })
    .click();
  await caption("02 / Describe a change · real local AI");
  await page
    .getByLabel("Describe a change")
    .pressSequentially("Let the Gravity headline float gently.", { delay: 45 });
  await page.getByRole("button", { name: "Apply AI instruction" }).click();
  await expect(page.locator(".ai-message.applied")).toBeVisible({
    timeout: 100_000,
  });
  if (Date.now() - start > 25_000)
    throw Error(
      "Local inference exceeded this 60-second demo schedule. Rerun when the model is warm.",
    );
  await at(17);
  await page.getByRole("button", { name: "Play poster", exact: true }).click();
  await at(23);
  await page
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  await caption("03 / Refine it directly");
  const y = page.getByRole("spinbutton", { name: "Y", exact: true });
  const original = Number(await y.inputValue());
  await y.fill(String(original + 30));
  await y.press("Tab");
  await at(29);
  await caption("04 / Undo, without losing the animation");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(y).toHaveValue(String(original));
  await at(34);
  await page.getByLabel("Playhead").fill("2400");
  await page.getByRole("button", { name: "Play poster", exact: true }).click();
  await at(42);
  await caption("05 / Export a living poster");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await at(48);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML" }).click();
  const download = await downloadPromise;
  await download.saveAs(join(output, "demo-poster.html"));
  await caption("One HTML file. Animated. Entirely offline.");
  await at(55);
  await caption("living poster / Words with a little life.");
  await at(62);
  const video = page.video()!;
  await page.close();
  await context.close();
  const source = await video.path();
  const ffmpeg = process.env.FFMPEG || "ffmpeg";
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-y",
        "-i",
        source,
        "-t",
        "60",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        join(output, "living-poster-demo.mp4"),
      ],
      { stdio: "ignore", windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolvePromise() : reject(Error(`ffmpeg exited ${code}`)),
    );
  });
  await writeFile(
    join(output, "demo-metadata.json"),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        model: process.env.OLLAMA_MODEL || "qwen3:4b",
        modelTransport: "Real local Ollama through the application API",
        instruction: "Let the Gravity headline float gently.",
        apiCost: 0,
        durationSeconds: 60,
        source:
          "Playwright screen recording; descriptive captions overlaid in browser; no scene state injected.",
      },
      null,
      2,
    ),
  );
  console.log(
    "Saved docs/assets/living-poster-demo.mp4 and demo-poster.html. Real local AI; API cost $0.",
  );
} finally {
  await context.close();
  await browser.close();
  await server.close();
  if (
    !resolve(temporary).startsWith(
      resolve(tmpdir()) + "\\living-poster-demo-",
    ) &&
    !resolve(temporary).startsWith(resolve(tmpdir()) + "/living-poster-demo-")
  )
    throw Error("Unexpected demo temporary directory.");
  await rm(temporary, { recursive: true, force: true });
}
