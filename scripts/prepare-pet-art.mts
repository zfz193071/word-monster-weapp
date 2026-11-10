import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Packaging only: retain the complete generated atlas and its original alpha.
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const source = 'docs/visual-audit/pets/blue-fox-parts.png';
const target = 'miniprogram/character-assets/blue-fox-parts.png';
const original = await readFile(source), image = await loadImage(original);
if (image.width !== 2172 || image.height !== 724) throw Error('Pet atlas changed; recalibrate anchors');
const width = 1086, height = 362, canvas = createCanvas(width, height);
canvas.getContext('2d').drawImage(image, 0, 0, width, height);
const encoded = canvas.toBuffer('image/png');
await writeFile(target, encoded);
await writeFile('docs/visual-audit/pets/parts-manifest.json', JSON.stringify({
  generator: 'built-in image_gen', prompt: 'blue-fox-parts-prompt.txt',
  reference: 'originals/blue-fox-back.png', source, target,
  sourceSize: [2172, 724], runtimeSize: [width, height],
  encoding: 'Full atlas resampled to half dimensions; original alpha retained, not lossless',
  sourceSha256: createHash('sha256').update(original).digest('hex'),
  runtimeSha256: createHash('sha256').update(encoded).digest('hex'),
  runtimeBytes: encoded.length, decodedRgbaBytes: width * height * 4,
  acceptance: 'Appearance master approved; tail assembly, accessories, animation and devices pending',
}, null, 2) + '\n');
console.log({target, bytes:encoded.length});
