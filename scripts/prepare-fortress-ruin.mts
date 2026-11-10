import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const source = 'docs/visual-audit/battlefield-overhaul/fortress/level-1-destroyed-source.png';
const target = 'miniprogram/fortress-assets/fortress-level-1-destroyed-v1.png';
const image = await loadImage(source);
// Match the intact wall aspect ratio and baseline; retain >3.5x logical pixel density.
const crop = { x: 0, y: 196, width: 2172, height: 428 };
const width = 1440, height = 284;
const canvas = createCanvas(width, height);
canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
await writeFile(target, canvas.toBuffer('image/png'));
const files = await Promise.all([source, target].map(async path => {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
await writeFile('docs/visual-audit/battlefield-overhaul/fortress/destroyed-manifest.json', JSON.stringify({
  tool: 'built-in image_gen', reference: 'miniprogram/fortress-assets/fortress-level-1-v1.png',
  prompt: 'destroyed-prompt.txt', sourceSize: { width: image.width, height: image.height },
  crop, width, height, encoding: 'PNG RGBA; preserved alpha; cropped and resampled',
  decodedRgbaBytes: width * height * 4, files,
}, null, 2) + '\n');
console.log(files);
