import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
// Optional offline image QA dependency; never bundled into the game.
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../docs/visual-audit/samples/', import.meta.url));
const prompts = JSON.parse(await readFile(resolve(root, 'prompts.json'), 'utf8'));
await mkdir(resolve(root, 'variants'), { recursive: true });
const entries = [];
for (const name of Object.keys(prompts)) {
  const path = `originals/${name}.png`;
  const bytes = await readFile(resolve(root, path));
  const source = await loadImage(bytes);
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
  const rgba = ctx.getImageData(0, 0, source.width, source.height).data;
  let transparent = 0, partial = 0, opaque = 0;
  let left = source.width, top = source.height, right = -1, bottom = -1;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const a = rgba[(y * source.width + x) * 4 + 3];
    if (a === 0) transparent++; else {
      if (a === 255) opaque++; else partial++;
      if (a > 8) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
  }
  const alphaVerified = transparent > rgba.length / 4 * .05 && opaque + partial > 0;
  const variants = [];
  for (const size of name.endsWith('display') ? [256, 512] : [64, 128, 256]) {
    const out = createCanvas(size, size), c = out.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(source, 0, 0, size, size);
    const data = out.toBuffer('image/png');
    const file = `variants/${name}-${size}.png`;
    await writeFile(resolve(root, file), data);
    variants.push({ file, size, bytes: data.length, rgbaBytes: size * size * 4, sha256: createHash('sha256').update(data).digest('hex') });
  }
  entries.push({ name, path, width: source.width, height: source.height, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), alphaVerified, transparent, partial, opaque,
    contentBounds: { left, top, right, bottom }, variants });
}
await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ date: '2026-11-09', tool: 'built-in image_gen',
  status: 'representative-samples-pending-review', reference: '../concepts/style-study-01.png',
  processing: 'Generated originals preserved. Canvas high-quality resize and lossless PNG encoding only; no palette quantization or manual background removal.',
  evidence: 'Alpha pixel inspection and static size variants, not device performance or final visual acceptance.', entries }, null, 2) + '\n');
console.log(entries.map(e => ({ name: e.name, alphaVerified: e.alphaVerified, originalBytes: e.bytes, variants: e.variants.map(v => [v.size, v.bytes]) })));
if (entries.some(e => !e.alphaVerified)) throw Error('Some generated originals do not have genuine transparent alpha; do not treat them as transparent assets.');
// Contact sheet for reviewing alpha edges on both backgrounds and small-scale silhouettes.
const sheet = createCanvas(1080, 800), sheetContext = sheet.getContext('2d');
sheetContext.fillStyle = '#f6f1e7'; sheetContext.fillRect(0, 0, 1080, 800);
for (const [index, name] of ['apple-display','rabbit-display','bird-display','apple-battle','rabbit-battle','bird-battle'].entries()) {
  const x = index % 3 * 360, y = Math.floor(index / 3) * 400;
  const im = await loadImage(resolve(root, `variants/${name}-256.png`));
  sheetContext.fillStyle = '#263d38'; sheetContext.font = '18px sans-serif'; sheetContext.fillText(name, x + 18, y + 26);
  sheetContext.fillStyle = '#233a40'; sheetContext.fillRect(x + 12, y + 40, 336, 260);
  sheetContext.drawImage(im, x + 60, y + 42, 256, 256);
  sheetContext.drawImage(im, x + 25, y + 320, 48, 48);
  sheetContext.drawImage(im, x + 100, y + 310, 80, 80);
  sheetContext.fillStyle = '#263d38'; sheetContext.font = '13px sans-serif'; sheetContext.fillText('48px / 80px review', x + 190, y + 350);
}
await writeFile(resolve(root, 'contact-sheet.png'), sheet.toBuffer('image/png'));
