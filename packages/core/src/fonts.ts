import { FONT_IDS, type FontId } from "./schema";
import { FONT_MANIFEST } from "./font-manifest";
import { sha256 } from "./hash";
export const FONT_OPTIONS = FONT_IDS.map((id) => ({
  id,
  label: `${id.startsWith("space") ? "Space Grotesk" : id.startsWith("fraunces") ? "Fraunces" : "IBM Plex Mono"} ${id.endsWith("bold") ? "Bold" : "Regular"}`,
  family: `LP-${id}`,
  weight: id.endsWith("bold") ? 700 : 400,
  url: `/fonts/${id}.woff2`,
  assetHash: "bundled-v1",
  license: "SIL Open Font License 1.1",
  sha256: FONT_MANIFEST[id].sha256,
  coverage: FONT_MANIFEST[id].coverage,
}));
const loaded = new Set<FontId>();
const pending = new Map<FontId, Promise<void>>();
/** Resolves only when every exact bundled face has loaded. Overrides embed the same files in offline HTML. */
export async function loadFonts(
  sources?: Partial<Record<string, string>>,
): Promise<void> {
  if (typeof FontFace === "undefined" || typeof document === "undefined")
    throw new Error("Font loading requires a browser canvas");
  if (
    sources &&
    Object.keys(sources).some((id) => !FONT_IDS.includes(id as FontId))
  )
    throw new Error("Unknown bundled font");
  await Promise.all(
    FONT_OPTIONS.filter(
      (f) => sources === undefined || sources[f.id] !== undefined,
    ).map(async (f) => {
      if (loaded.has(f.id) && !sources?.[f.id]) return;
      if (pending.has(f.id)) return pending.get(f.id);
      const promise = (async () => {
        try {
          const source = sources?.[f.id] ?? f.url;
          let bytes: ArrayBuffer;
          if (source.startsWith("data:font/woff2;base64,")) {
            const raw = atob(source.slice(source.indexOf(",") + 1));
            bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
          } else {
            const response = await fetch(source);
            if (!response.ok) throw new Error("Missing font asset");
            bytes = await response.arrayBuffer();
          }
          const hash = sha256(bytes);
          if (hash !== f.sha256) throw new Error("Font asset hash mismatch");
          const face = new FontFace(f.family, bytes, {
            weight: String(f.weight),
            style: "normal",
          });
          await face.load();
          document.fonts.add(face);
          loaded.add(f.id);
        } catch {
          throw new Error(
            `Could not load ${f.label}. Retry loading the bundled font.`,
          );
        } finally {
          pending.delete(f.id);
        }
      })();
      pending.set(f.id, promise);
      await promise;
    }),
  );
}
export function fontCss(fontId: FontId, fontSize: number): string {
  const f = FONT_OPTIONS.find((f) => f.id === fontId)!;
  return `${f.weight} ${fontSize}px "${f.family}"`;
}
export function assertFontReady(fontId: FontId): void {
  if (!loaded.has(fontId))
    throw new Error(
      `Font ${fontId} is not loaded. Await loadFonts() before compiling.`,
    );
}
