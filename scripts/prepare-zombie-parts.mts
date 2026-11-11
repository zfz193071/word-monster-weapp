import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { APPLE_ZOMBIE_PARTS, BOSS_ZOMBIE_PARTS } from '../miniprogram/fortress/zombie-art';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const files = [];
for (const [kind, art] of Object.entries({apple: APPLE_ZOMBIE_PARTS, ...BOSS_ZOMBIE_PARTS})) {
const source = art.source, input = await readFile(source), image = await loadImage(input);
const expected = kind === 'grand' ? [1774,887] : [2172,724];
if (image.width !== expected[0] || image.height !== expected[1]) throw Error('Recalibrate changed atlas');
const runtime = kind === 'grand' ? [888,444] : [1086,362];
const canvas = createCanvas(...runtime);
canvas.getContext('2d').drawImage(image, 0, 0, ...runtime);
const bytes = canvas.toBuffer('image/png'), target = `miniprogram${art.path}`;
await writeFile(target, bytes);
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const refs = kind === 'grand' ? ['docs/visual-audit/enemies/approved-parts/grand-boss-study-01.png', 'docs/visual-audit/enemies/approved-parts/grand-parts-01.png'] : ['docs/visual-audit/battlefield-overhaul/interior-study/interior-01.png', 'docs/visual-audit/concepts/style-study-01.png'];
const references = await Promise.all(refs.map(async path => ({path, sha256: sha(await readFile(path))})));
files.push({ kind,
  generator: 'built-in image_gen', prompt: `${kind}-parts-${kind === 'grand' ? '02' : '01'}-prompt.txt`, references,
  encoding: 'Full atlas uniformly resampled to approximately half size; alpha retained, no background removal or pixel retouching',
  scope: 'Ordinary apple and two Boss identities from approved masters; runtime visual/device acceptance pending',
  source, sourceSize: expected, sourceSha256: sha(input), target, runtimeSize: runtime,
  sha256: sha(bytes), bytes: bytes.length, decodedRgbaBytes: runtime[0]*runtime[1]*4,
});
console.log({target, bytes: bytes.length});
}
await writeFile('docs/visual-audit/enemies/approved-parts/manifest.json', JSON.stringify({files}, null, 2) + '\n');
