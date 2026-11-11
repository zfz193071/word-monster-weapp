import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Packaging only: preserve complete images and alpha, with uniform resampling.
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const directory = 'docs/visual-audit/battlefield-overhaul/interior-layers';
const material = process.argv[2] ?? 'wood';
if (!['wood', 'reinforced', 'stone', 'castle', 'armored'].includes(material)) throw Error('Unknown material');
const packageName = material === 'wood' ? 'fortress-assets' : `${material}-fortress-assets`;
const files = [];
const parts = !['wood', 'reinforced'].includes(material) ? ['interior', 'front'] : ['interior', 'front', 'ruin'];
for (const part of parts) {
  const source = `${directory}/${material}-${part}-01.png`;
  const target = `miniprogram/${packageName}/${material}-${part}-v2.png`;
  const input = await readFile(source), image = await loadImage(input);
  const width = 1086, height = Math.round(image.height * width / image.width);
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  const bytes = canvas.toBuffer('image/png');
  await writeFile(target, bytes);
  files.push({ source, target, sourceSize: [image.width, image.height], runtimeSize: [width, height],
    sourceSha256: createHash('sha256').update(input).digest('hex'),
    runtimeSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    decodedRgbaBytes: width * height * 4 });
}
const reference = material === 'wood' ? 'docs/visual-audit/battlefield-overhaul/interior-study/interior-01.png' : `${directory}/${material === 'castle' ? 'stone' : material === 'armored' ? 'castle' : 'wood'}-interior-01.png`;
const references = material === 'wood' ? [reference] : material === 'reinforced' ? [reference, `${directory}/wood-front-01.png`, `${directory}/${material}-interior-01.png`] : material === 'stone' ? [`${directory}/wood-interior-01.png`, `${directory}/wood-front-01.png`, `${directory}/stone-interior-01.png`] : material === 'castle' ? [`${directory}/stone-interior-01.png`, `${directory}/stone-front-01.png`, `${directory}/castle-interior-01.png`] : [`${directory}/castle-interior-01.png`, `${directory}/castle-front-01.png`, `${directory}/armored-interior-01.png`];
await writeFile(`${directory}/${material === 'wood' ? 'manifest' : material + '-manifest'}.json`, JSON.stringify({ generator: 'built-in image_gen',
  references: await Promise.all(references.map(async path => ({path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}))),
  reference, referenceSha256: createHash('sha256').update(await readFile(reference)).digest('hex'),
  encoding: 'Whole images uniformly resampled to half size; alpha preserved, not lossless',
  prompts: parts.map(part => `${material}-${part}-prompt.txt`),
  acceptance: 'Approved interior direction and five house materials; final runtime and device review pending', files }, null, 2) + '\n');
console.log(files);
