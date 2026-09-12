import { build as bundle } from "esbuild";
import { build as vite } from "vite";
import { mkdir } from "node:fs/promises";
import { prepareAssets } from "./assets.mjs";
const hosted = process.argv.includes("--hosted");
process.env.VITE_HOSTED = hosted ? "true" : "false";
await prepareAssets();
await mkdir("apps/web/public", { recursive: true });
await bundle({
  entryPoints: ["apps/web/src/player.ts"],
  outfile: "apps/web/public/player.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2022",
  platform: "browser",
});
await vite(hosted ? { build: { outDir: "../../dist/hosted" } } : {});
if (!hosted)
  await bundle({
    entryPoints: ["apps/api/src/index.ts"],
    outfile: "dist/server/index.js",
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node24",
    sourcemap: true,
  });
console.log(
  hosted
    ? "Built browser studio and standalone player for free static hosting."
    : "Built editor, standalone player, and local server.",
);
