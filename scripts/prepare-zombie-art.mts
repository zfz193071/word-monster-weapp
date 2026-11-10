import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const directory = 'docs/visual-audit/enemies/textured';
const source = `${directory}/apple-zombie-source.png`;
const target = 'miniprogram/assets/images/fortress/zombie-apple-textured.png';
const image = await loadImage(source);
if (image.width !== 1254 || image.height !== 1254) throw Error('Recalibrate leg split for changed source');
const canvas = createCanvas(256, 320), c = canvas.getContext('2d');
// Preserve alpha inside the crop. Exterior low-alpha residue is trimmed too.
const crop = [160,40,960,1200].map(value => value * 1254 / 1280);
c.drawImage(image, ...crop, 0, 0, 256, 320);
await writeFile(target, canvas.toBuffer('image/png'));
const files = await Promise.all([source, target].map(async path => {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
await writeFile(`${directory}/manifest.json`, JSON.stringify({ tool: 'built-in image_gen', prompt: 'prompt.txt',
  sourceSize: [1254,1254], crop, runtimeSize: [256,320], decodedRgbaBytes: 256*320*4,
  encoding: 'RGBA PNG; resampled with alpha preserved; not lossless',
  scope: 'Apple normal enemies only; bosses and special enemy types retain existing artwork',
  visualAcceptance: 'Pending full scene and device acceptance', files }, null, 2) + '\n');
console.log(files);
