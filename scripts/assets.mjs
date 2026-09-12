import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const fontAssets = [
  ["space-regular", "space-grotesk", 400],
  ["space-bold", "space-grotesk", 700],
  ["fraunces-regular", "fraunces", 400],
  ["fraunces-bold", "fraunces", 700],
  ["mono-regular", "ibm-plex-mono", 400],
  ["mono-bold", "ibm-plex-mono", 700],
  ["dm-regular", "dm-sans", 400],
  ["dm-bold", "dm-sans", 700],
  ["playfair-regular", "playfair-display", 400],
  ["playfair-bold", "playfair-display", 700],
  ["baskerville-regular", "libre-baskerville", 400],
  ["baskerville-bold", "libre-baskerville", 700],
  ["barlow-regular", "barlow-condensed", 400],
  ["barlow-bold", "barlow-condensed", 700],
  ["archivo-black", "archivo-black", 400],
  ["caveat-regular", "caveat", 400],
  ["caveat-bold", "caveat", 700],
  ["nunito-regular", "nunito-sans", 400],
  ["nunito-bold", "nunito-sans", 700],
];
export function verifyFontAsset(id, bytes, expectedHash) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (!expectedHash || hash !== expectedHash)
    throw new Error(
      `Bundled font ${id} differs from its frozen manifest. Review the font update before shipping it.`,
    );
  return hash;
}
export async function prepareAssets({ checkOnly = false } = {}) {
  const manifestSource = await readFile(
    "packages/core/src/font-manifest.ts",
    "utf8",
  );
  const manifest = JSON.parse(
    manifestSource.match(/export const FONT_MANIFEST = (.*) as const;/s)?.[1] ??
      "null",
  );
  if (!manifest || Object.keys(manifest).length !== fontAssets.length)
    throw new Error(
      "Font catalog and frozen manifest must contain the same faces.",
    );
  const hashes = {};
  const files = [];
  for (const [id, family, weight] of fontAssets) {
    const source = path.resolve(
      `node_modules/@fontsource/${family}/files/${family}-latin-${weight}-normal.woff2`,
    );
    hashes[id] = verifyFontAsset(
      id,
      await readFile(source),
      manifest[id]?.sha256,
    );
    files.push([source, `${id}.woff2`]);
  }
  let licenses = "Living Poster bundled fonts\n\n";
  for (const family of new Set(fontAssets.map(([, family]) => family))) {
    const license = await readFile(
      `node_modules/@fontsource/${family}/LICENSE`,
      "utf8",
    );
    if (!/SIL OPEN FONT LICENSE Version 1\.1/i.test(license))
      throw new Error(
        `Review the free font license for ${family} before bundling it.`,
      );
    licenses += `\n${family}\n${"-".repeat(family.length)}\n${license}\n`;
  }
  if (checkOnly) return hashes;
  const dir = path.resolve("apps/web/public/fonts");
  await mkdir(dir, { recursive: true });
  for (const [source, name] of files)
    await copyFile(source, path.join(dir, name));
  await writeFile(path.join(dir, "LICENSES.txt"), licenses);
  await writeFile(
    path.join(dir, "hashes.json"),
    JSON.stringify(hashes, null, 2) + "\n",
  );
}
if (process.argv[1]?.endsWith("assets.mjs"))
  await prepareAssets({ checkOnly: process.argv.includes("--check") });
