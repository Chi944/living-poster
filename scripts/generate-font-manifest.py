"""Refresh reviewed font binaries: python scripts/generate-font-manifest.py.

Requires the free fontTools and Brotli Python packages only when adding fonts.
Normal installs/builds check the committed manifest and do not require Python.
The manifest records real Unicode cmap entries, not Google Fonts CSS ranges.
"""

import hashlib
import json
from pathlib import Path
import subprocess

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
assets = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "import {fontAssets} from './scripts/assets.mjs'; process.stdout.write(JSON.stringify(fontAssets))",
], cwd=ROOT, text=True))

manifest = {}
for font_id, family, weight in assets:
    source = ROOT / f"node_modules/@fontsource/{family}/files/{family}-latin-{weight}-normal.woff2"
    with TTFont(source) as font:
        points = sorted({
            point
            for table in font["cmap"].tables if table.isUnicode()
            for point in table.cmap
        })
    ranges = []
    for point in points:
        if ranges and point == ranges[-1][1] + 1:
            ranges[-1][1] = point
        else:
            ranges.append([point, point])
    manifest[font_id] = {
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "coverage": ranges,
    }

target = ROOT / "packages/core/src/font-manifest.ts"
target.write_text(
    "/** Generated from the shipped WOFF2 binaries using scripts/generate-font-manifest.py. */\n"
    + "export const FONT_MANIFEST = "
    + json.dumps(manifest, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    + " as const;\n",
    encoding="utf-8",
)
print(f"Recorded exact SHA-256 and Unicode cmap coverage for {len(manifest)} font faces.")
