import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const fontAssets = [
  ['space-regular', 'space-grotesk', 400], ['space-bold', 'space-grotesk', 700],
  ['fraunces-regular', 'fraunces', 400], ['fraunces-bold', 'fraunces', 700],
  ['mono-regular', 'ibm-plex-mono', 400], ['mono-bold', 'ibm-plex-mono', 700],
];
export async function prepareAssets() {
  const dir = path.resolve('apps/web/public/fonts');
  await mkdir(dir, { recursive: true });
  const hashes = {};
  for (const [id, family, weight] of fontAssets) {
    const source = path.resolve(`node_modules/@fontsource/${family}/files/${family}-latin-${weight}-normal.woff2`);
    await copyFile(source, path.join(dir, `${id}.woff2`));
    hashes[id] = createHash('sha256').update(await readFile(source)).digest('hex');
  }
  let licenses = 'Living Poster bundled fonts\n\n';
  for (const family of ['space-grotesk', 'fraunces', 'ibm-plex-mono']) {
    const license = await readFile(`node_modules/@fontsource/${family}/LICENSE`, 'utf8');
    licenses += `\n${family}\n${'='.repeat(family.length)}\n${license}\n`;
  }
  await writeFile(path.join(dir, 'LICENSES.txt'), licenses);
  await writeFile(path.join(dir, 'hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
}
if (process.argv[1]?.endsWith('assets.mjs')) await prepareAssets();
