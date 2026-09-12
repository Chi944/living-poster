import { FONT_IDS, type FontId } from "./schema";
import { FONT_MANIFEST } from "./font-manifest";
import { sha256 } from "./hash";
export type FontCategory =
  | "sans"
  | "serif"
  | "mono"
  | "display"
  | "handwriting";
const FONT_FAMILIES: Record<
  FontId,
  { familyLabel: string; category: FontCategory; weight: 400 | 700 }
> = {
  "space-regular": {
    familyLabel: "Space Grotesk",
    category: "sans",
    weight: 400,
  },
  "space-bold": { familyLabel: "Space Grotesk", category: "sans", weight: 700 },
  "fraunces-regular": {
    familyLabel: "Fraunces",
    category: "serif",
    weight: 400,
  },
  "fraunces-bold": { familyLabel: "Fraunces", category: "serif", weight: 700 },
  "mono-regular": {
    familyLabel: "IBM Plex Mono",
    category: "mono",
    weight: 400,
  },
  "mono-bold": { familyLabel: "IBM Plex Mono", category: "mono", weight: 700 },
  "dm-regular": { familyLabel: "DM Sans", category: "sans", weight: 400 },
  "dm-bold": { familyLabel: "DM Sans", category: "sans", weight: 700 },
  "playfair-regular": {
    familyLabel: "Playfair Display",
    category: "serif",
    weight: 400,
  },
  "playfair-bold": {
    familyLabel: "Playfair Display",
    category: "serif",
    weight: 700,
  },
  "baskerville-regular": {
    familyLabel: "Libre Baskerville",
    category: "serif",
    weight: 400,
  },
  "baskerville-bold": {
    familyLabel: "Libre Baskerville",
    category: "serif",
    weight: 700,
  },
  "barlow-regular": {
    familyLabel: "Barlow Condensed",
    category: "sans",
    weight: 400,
  },
  "barlow-bold": {
    familyLabel: "Barlow Condensed",
    category: "sans",
    weight: 700,
  },
  "archivo-black": {
    familyLabel: "Archivo Black",
    category: "display",
    weight: 400,
  },
  "caveat-regular": {
    familyLabel: "Caveat",
    category: "handwriting",
    weight: 400,
  },
  "caveat-bold": {
    familyLabel: "Caveat",
    category: "handwriting",
    weight: 700,
  },
  "nunito-regular": {
    familyLabel: "Nunito Sans",
    category: "sans",
    weight: 400,
  },
  "nunito-bold": { familyLabel: "Nunito Sans", category: "sans", weight: 700 },
};
export const FONT_OPTIONS = FONT_IDS.map((id) => ({
  id,
  ...FONT_FAMILIES[id],
  label: `${FONT_FAMILIES[id].familyLabel}${id === "archivo-black" ? "" : FONT_FAMILIES[id].weight === 700 ? " Bold" : " Regular"}`,
  family: `LP-${id}`,
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
