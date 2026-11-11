import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GUARDIAN_BODY, GUARDIAN_RIGS } from '../miniprogram/fortress/guardian-rig';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const files = [];
for (const item of [{ source: 'docs/visual-audit/hero/parts-study/guardian-parts-01.png', art: GUARDIAN_BODY }, ...GUARDIAN_RIGS]) {
  const input = await readFile(item.source), image = await loadImage(input);
  if (image.width !== 1774 || image.height !== 887) throw Error(`Recalibrate changed atlas: ${item.source}`);
  const canvas = createCanvas(720, 360); canvas.getContext('2d').drawImage(image, 0, 0, 720, 360);
  const bytes = canvas.toBuffer('image/png'), target = `miniprogram${item.art.path}`;
  await writeFile(target, bytes);
  files.push({ ...item, target, sourceSize: [1774, 887], runtimeSize: [720, 360], bytes: bytes.length,
    rgbaBytes: 720 * 360 * 4, sourceSha256: createHash('sha256').update(input).digest('hex'),
    sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('docs/visual-audit/hero/parts-study/rig-manifest.json', JSON.stringify({
  generator: 'built-in image_gen', generationRecord: 'docs/visual-audit/hero/parts-study/generation-status.json', encoding: 'Complete atlas uniformly resampled; original alpha retained; no pixel removal',
  acceptedScope: 'Approved guardian appearance and seven weapon identities; final animation/device acceptance pending',
  combatMuzzle: {lateral: 16.8, forward: 34.4}, missingLevels: [4, 7], files,
}, null, 2) + '\n');
console.log(files.map(file => ({path: file.target, bytes: file.bytes})));
