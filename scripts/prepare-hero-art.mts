import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LEVEL_ONE_HERO_FRAME } from '../miniprogram/fortress/hero-art';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const source = 'docs/visual-audit/hero/originals/hero-back-weapon-1-aiming.png';
const target = 'miniprogram/assets/images/fortress/hero-back-weapon-1-textured.png';
const image = await loadImage(source);
if (image.width !== 1122 || image.height !== 1402) throw Error('Recalibrate source muzzle before changing image dimensions');
// Resample the complete alpha image, without cropping or thresholding edges.
const width = 337, height = 421;
const canvas = createCanvas(width, height);
canvas.getContext('2d').drawImage(image, 0, 0, width, height);
await writeFile(target, canvas.toBuffer('image/png'));
const files = await Promise.all([source, target].map(async path => {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
await writeFile('docs/visual-audit/hero/aiming-manifest.json', JSON.stringify({
  tool: 'built-in image_gen', prompt: 'aiming-prompt.txt',
  sourceSize: {width:image.width,height:image.height}, sourceMuzzle: {x:770,y:330},
  runtimeSize: {width,height}, frame: LEVEL_ONE_HERO_FRAME,
  encoding: 'Full RGBA image resampled for runtime; alpha preserved; not lossless',
  decodedRgbaBytes: width * height * 4, runtimeInstalled: true,
  visualAcceptance: 'Pending full-scene and device acceptance', files,
}, null, 2) + '\n');
console.log(files);
