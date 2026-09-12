import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  CURRENT_RENDERER_VERSION,
  FONT_IDS,
  reviseScene,
  supportedText,
  validateScene,
  type Scene,
  type FontId,
} from "../packages/core/src/schema";
import { FONT_OPTIONS, fontCss } from "../packages/core/src/fonts";
import { FONT_MANIFEST } from "../packages/core/src/font-manifest";
import { applyOperations } from "../packages/core/src/commands";

const legacyHashes = {
  "space-regular":
    "65fd17fcbd2e2f522940b5f67ead3d23329e02891aa5495e74d11a499c0b0673",
  "space-bold":
    "35f8aec56cfd5cbfdb03cc68733a54a0b05bb3617ffcd5fd332badc0b045ca55",
  "fraunces-regular":
    "e558f39453a9c611908be04294b50dea5f21ae6c49b41c6e47f4115e91f90209",
  "fraunces-bold":
    "c38570d224b830056e69484bb9e768e1d3fa7ba4755c8891a3c6d366194d2ff3",
  "mono-regular":
    "08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7",
  "mono-bold":
    "4f84d86cfd060f4ded334358ff8a4c81d4db2ed5addd568359d693f44a87765a",
};

function fixture(fonts: readonly FontId[] = FONT_IDS): Scene {
  return {
    schemaVersion: 1,
    rendererVersion: CURRENT_RENDERER_VERSION,
    id: "font-specimen",
    revision: { id: "font-specimen-v1", parentId: null },
    seed: 1,
    artboard: { width: 1080, height: 1350, background: "#FFFFFF" },
    timeline: { durationMs: 6000, fps: 30, loop: true },
    fonts: fonts.map((id) => ({ id, assetHash: "bundled-v1" })),
    pointer: { mode: "disabled" },
    layers: fonts.map((fontId, index) => ({
      id: `text-${fontId}`,
      name: fontId,
      kind: "text",
      fontId,
      text: "Café & type — 123!",
      fontSize: 24,
      lineHeight: 1,
      trackingEm: 0,
      align: "left",
      fill: "#151515",
      visible: true,
      locked: false,
      opacity: 1,
      layout: { x: 50, y: 50 + index * 50, rotationDeg: 0 },
      behaviors: [],
    })),
  };
}

describe("expanded free bundled font library", () => {
  it("ships19 exact binaries with searchable metadata across10 families", () => {
    expect(FONT_OPTIONS).toHaveLength(19);
    expect(new Set(FONT_OPTIONS.map((font) => font.familyLabel)).size).toBe(10);
    expect(new Set(FONT_OPTIONS.map((font) => font.category))).toEqual(
      new Set(["sans", "serif", "mono", "display", "handwriting"]),
    );
    for (const font of FONT_OPTIONS) {
      const bytes = readFileSync(`apps/web/public/fonts/${font.id}.woff2`);
      expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        font.sha256,
      );
      expect(font.label).toContain(font.familyLabel);
      expect(fontCss(font.id, 48)).toBe(`${font.weight} 48px "LP-${font.id}"`);
    }
    const licenses = readFileSync("apps/web/public/fonts/LICENSES.txt", "utf8");
    expect(licenses.match(/SIL OPEN FONT LICENSE Version 1\.1/g)).toHaveLength(
      10,
    );
    expect(() => validateScene(fixture())).not.toThrow();
  });

  it("preserves the original six exact font bytes for legacy posters", () => {
    for (const [id, hash] of Object.entries(legacyHashes))
      expect(FONT_MANIFEST[id as FontId].sha256).toBe(hash);
    for (const rendererVersion of ["1.0.0", "1.1.0"] as const) {
      const scene = fixture(FONT_IDS.slice(0, 6));
      scene.rendererVersion = rendererVersion;
      expect(validateScene(scene).rendererVersion).toBe(rendererVersion);
      expect(reviseScene(scene).rendererVersion).toBe("1.2.0");
      expect(scene.rendererVersion).toBe(rendererVersion);
    }
  });

  it("requires renderer1.2 for added fonts including unused references", () => {
    for (const rendererVersion of ["1.0.0", "1.1.0"] as const) {
      const scene = fixture(["dm-bold"]);
      scene.rendererVersion = rendererVersion;
      expect(() => validateScene(scene)).toThrow(
        /font library requires renderer 1.2.0/,
      );
      scene.layers = [];
      expect(() => validateScene(scene)).toThrow(
        /font library requires renderer 1.2.0/,
      );
    }
  });

  it("uses each actual cmap rather than assuming identical Latin font coverage", () => {
    for (const id of FONT_IDS) {
      expect(supportedText("Café & type — 123!\n€20", id)).toBe(true);
      expect(supportedText("漢字😀", id)).toBe(false);
    }
    // U+00B5 is absent from the bundled Playfair subset; U+0301 is absent in Archivo.
    expect(supportedText("µ", "playfair-regular")).toBe(false);
    expect(supportedText("µ", "space-regular")).toBe(true);
    expect(supportedText("e\u0301", "archivo-black")).toBe(false);
    expect(supportedText("e\u0301", "dm-regular")).toBe(true);
  });

  it("adds newly chosen AI font references atomically and upgrades legacy revisions", () => {
    const scene = fixture(["space-regular"]);
    scene.rendererVersion = "1.0.0";
    const next = applyOperations(scene, [
      {
        type: "setTypography",
        layerId: "text-space-regular",
        changes: { fontId: "dm-bold" },
      },
      {
        type: "setTypography",
        layerId: "text-space-regular",
        changes: { fontId: "dm-bold" },
      },
    ]).scene;
    expect(next.rendererVersion).toBe("1.2.0");
    expect(next.fonts).toEqual([
      { id: "space-regular", assetHash: "bundled-v1" },
      { id: "dm-bold", assetHash: "bundled-v1" },
    ]);
    expect(scene.fonts).toEqual([
      { id: "space-regular", assetHash: "bundled-v1" },
    ]);
    expect(scene.rendererVersion).toBe("1.0.0");
    if (scene.layers[0]!.kind !== "text") throw new Error("Expected text");
    scene.layers[0]!.text = "µ";
    expect(() =>
      applyOperations(scene, [
        {
          type: "setTypography",
          layerId: "text-space-regular",
          changes: { fontId: "playfair-bold" },
        },
      ]),
    ).toThrow(/Unsupported character/);
    expect(scene.layers[0]!.fontId).toBe("space-regular");
  });

  it("checks installed assets against the frozen manifest and blocks unexpected updates", () => {
    execFileSync(process.execPath, ["scripts/assets.mjs", "--check"]);
    const result = execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      "import {verifyFontAsset} from './scripts/assets.mjs'; try { verifyFontAsset('dm-bold', new Uint8Array([1, 2, 3]), 'expected'); process.exit(1); } catch(error) { if(!error.message.includes('frozen manifest')) process.exit(2); }",
    ]);
    expect(result.byteLength).toBe(0);
  });
});
