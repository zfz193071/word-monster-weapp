import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const source = 'docs/visual-audit/battlefield-overhaul/fortress/level-1-source.png';
const target = 'miniprogram/battlefield-assets/fortress-level-1-v1.png';
const image = await loadImage(source);
// Pack the transparent sprite; retain alpha and enough pixels for >3x native wall size.
const crop = { x: 20, y: 150, width: 2132, height: 420 };
const width = 1536, height = Math.round(width * crop.height / crop.width);
const canvas = createCanvas(width, height);
canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
await writeFile(target, canvas.toBuffer('image/png'));
const files = await Promise.all([source, target].map(async path => { const bytes = await readFile(path); return {path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}; }));
await writeFile('docs/visual-audit/battlefield-overhaul/fortress/manifest.json', JSON.stringify({tool:'built-in image_gen',reference:'docs/visual-audit/concepts/style-study-01.png',prompt:'prompt.txt',sourceSize:{width:image.width,height:image.height},crop,width,height,encoding:'PNG RGBA; alpha preserved; packed and resampled for runtime',decodedRgbaBytes:width*height*4,files},null,2)+'\n');
console.log({width,height,files});
