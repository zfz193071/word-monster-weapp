import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { BATTLE_WORDS } from '../miniprogram/fortress/fruit-catalog';

// Offline review only. No runtime resources or mappings are modified.
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../docs/visual-audit/fruits/', import.meta.url));
const prompts = JSON.parse(await readFile(resolve(root, 'prompts.json'), 'utf8'));
const expected = BATTLE_WORDS.map(word => word.id);
if (expected.length !== 11 || new Set(['apple', ...Object.keys(prompts)]).size !== 11 || expected.some(id => id !== 'apple' && !prompts[id])) {
  throw Error('Fruit prompts must cover exactly the current 11-word catalog.');
}
await mkdir(resolve(root, 'variants'), { recursive: true });
const allowIncomplete = process.argv.includes('--allow-incomplete');
const missing: string[] = [];
for (const id of expected) {
  try { await access(resolve(root, id === 'apple' ? '../samples/originals/apple-display.png' : `originals/${id}.png`)); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; missing.push(id); }
}
if (missing.length && !allowIncomplete) throw Error(`Missing originals: ${missing.join(', ')}. Use --allow-incomplete only for explicitly labelled progress review.`);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const entries = [];
const sheet = createCanvas(1200, 1200), ctx = sheet.getContext('2d');
ctx.fillStyle = '#f6f1e7'; ctx.fillRect(0, 0, 1200, 1200);
for (const [index, word] of BATTLE_WORDS.entries()) {
  if (missing.includes(word.id)) {
    ctx.fillStyle = '#963b35'; ctx.font = '18px sans-serif';
    ctx.fillText(`${word.id}: NOT GENERATED`, index % 4 * 300 + 16, Math.floor(index / 4) * 400 + 25);
    continue;
  }
  const original = word.id === 'apple' ? '../samples/originals/apple-display.png' : `originals/${word.id}.png`;
  const bytes = await readFile(resolve(root, original));
  const source = await loadImage(bytes);
  const probe = createCanvas(source.width, source.height), p = probe.getContext('2d');
  p.drawImage(source, 0, 0);
  const pixels = p.getImageData(0, 0, source.width, source.height).data;
  let transparent = 0, partial = 0, visible = 0;
  let left = source.width, top = source.height, right = -1, bottom = -1;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const alpha = pixels[(y * source.width + x) * 4 + 3];
    if (alpha === 0) transparent++; else {
      visible++; if (alpha < 255) partial++;
      if (alpha > 8) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
  }
  if (transparent < source.width * source.height * .05 || !visible) throw Error(`${word.id}: missing genuine alpha`);
  const variants = [];
  for (const size of [64, 128, 256, 512]) {
    const canvas = createCanvas(size, size), c = canvas.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const scale = Math.min(size / source.width, size / source.height);
    c.drawImage(source, (size - source.width * scale) / 2, (size - source.height * scale) / 2, source.width * scale, source.height * scale);
    const output = canvas.toBuffer('image/png'), file = `variants/${word.id}-${size}.png`;
    await writeFile(resolve(root, file), output);
    variants.push({ file, size, bytes: output.length, rgbaBytes: size * size * 4, sha256: digest(output) });
  }
  const x = index % 4 * 300, y = Math.floor(index / 4) * 400;
  ctx.fillStyle = '#263d38'; ctx.font = '18px sans-serif'; ctx.fillText(word.id, x + 16, y + 25);
  ctx.fillStyle = '#233a40'; ctx.fillRect(x + 12, y + 40, 276, 245);
  const thumb = await loadImage(resolve(root, `variants/${word.id}-256.png`));
  ctx.drawImage(thumb, x + 35, y + 45, 230, 230);
  for (const [i, size] of [24, 48, 96].entries()) ctx.drawImage(thumb, x + 16 + i * 85, y + 300, size, size);
  entries.push({ wordId: word.id, meaningZh: word.meaningZh, audioPath: word.audioPath, original,
    width: source.width, height: source.height, bytes: bytes.length, sha256: digest(bytes),
    transparent, partial, contentBounds: { left, top, right, bottom }, variants, reviewStatus: 'pending-batch-visual-review' });
}
await writeFile(resolve(root, 'contact-sheet.png'), sheet.toBuffer('image/png'));
const totals = Object.fromEntries([64, 128, 256, 512].map(size => [size, entries.reduce((sum, e) => sum + e.variants.find(v => v.size === size)!.bytes, 0)]));
await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ date: '2026-11-09', issue: 84,
  source: 'Built-in image_gen; project apple sample used as style reference; no third-party images introduced.',
  rights: 'AI-generated project assets; not a claim of exclusive copyright.',
  processing: 'Original alpha preserved; aspect-preserving high-quality resize and lossless PNG encoding; no quantization.',
  status: missing.length ? 'Incomplete batch; missing originals; not integrated' : 'Batch prepared for review, not integrated or device-accepted', missing, totals, entries }, null, 2) + '\n');
const cards = entries.map(e => `<article><h2>${e.wordId} · ${e.meaningZh}</h2><div class="pair"><img src="variants/${e.wordId}-256.png"><img class="dark" src="variants/${e.wordId}-256.png"></div><div class="sizes">${e.variants.map(v => `<figure><img src="${v.file}" width="${v.size <= 128 ? 24 : 146}"><figcaption>${v.size}px · ${(v.bytes / 1024).toFixed(1)} KiB</figcaption></figure>`).join('')}</div><p>小图显示24 CSS px，大图146 CSS px。各设备DPR/Boss放大与动态场景仍待验证。</p></article>`).join('');
await writeFile(resolve(root, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>水果素材进度审查</title><style>body{margin:24px;background:#f6f1e7;color:#263d38;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:20px}article{background:white;padding:18px;border-radius:16px}.pair{display:flex}.pair img{width:50%;object-fit:contain;background:#fff5de}.pair .dark{background:#233a40}.sizes{display:flex;flex-wrap:wrap;align-items:end}figure{margin:10px}figcaption,p{font-size:13px;line-height:1.7}</style><h1>水果素材 · ${entries.length}/11</h1><p>${missing.length ? `尚缺：${missing.join('、')}（生成服务网络失败，重试仍失败）。` : '全部母版已生成。'}沿用苹果代表样张，其余逐张生成。每词一份透明母版共用展示/战斗候选。未替换游戏入口，整套视觉、实际场景及设备验收仍待完成。</p><main>${cards}</main></html>`);
console.log(JSON.stringify({ words: entries.length, missing, variants: entries.length * 4, alphaVerified: entries.length, totals }, null, 2));
