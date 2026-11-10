import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { HERO_VARIANTS } from '../miniprogram/fortress/hero-art';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const files = [];
for (const variant of HERO_VARIANTS) {
  const original = await readFile(variant.source), image = await loadImage(original);
  if (image.width !== 1536 || image.height !== 1024) throw Error('Recalibrate changed hero source');
  // Runtime packaging only: complete image, no crop, repaint or alpha threshold.
  const width = 576, height = 384, canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  const encoded = canvas.toBuffer('image/png'), target = `miniprogram${variant.art.path}`;
  await writeFile(target, encoded);
  files.push({...variant, target, runtimeSize: {width, height}, bytes: encoded.length,
    decodedRgbaBytes: width * height * 4,
    sourceSha256: createHash('sha256').update(original).digest('hex'),
    sha256: createHash('sha256').update(encoded).digest('hex')});
}
await writeFile('docs/visual-audit/hero/guardian-manifest.json', JSON.stringify({
  encoding: 'Complete approved-source variants resampled for runtime; alpha retained; not lossless',
  combatMuzzle: {x:16.8,y:-34.4},
  acceptance: 'Appearance direction approved; source muzzle manually measured; full scene and devices pending', files,
}, null, 2) + '\n');
console.log(files.map(({level,bytes}) => ({level,bytes})));
