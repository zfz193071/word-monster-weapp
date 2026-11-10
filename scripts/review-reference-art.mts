import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Inspect originals and build an HTML review. Never edits pixels or runtime assets.
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE || '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const base = resolve(root, 'docs/visual-audit');
const production = process.argv.includes('--production');
const output = resolve(base, production ? 'production-studies' : 'reference-studies');
const sources = [
  { id: 'fox-01', title: '蓝狐初稿', path: 'pets/originals/blue-fox-study-01.png', prompt: 'pets/prompt-01.txt', reference: 'concepts/style-study-01.png' },
  { id: 'fox-02', title: '蓝狐边缘修订', path: 'pets/originals/blue-fox-study-02.png', prompt: 'pets/prompt-02.txt', reference: 'pets/originals/blue-fox-study-01.png' },
  { id: 'hero-01', title: '主角初稿（火光待移除）', path: 'hero/reference-studies/hero-study-01.png', prompt: 'hero/reference-studies/prompt-01.txt', reference: 'concepts/style-study-01.png' },
  { id: 'hero-02', title: '主角修订（已移除火光）', path: 'hero/reference-studies/hero-study-02.png', prompt: 'hero/reference-studies/prompt-02.txt', reference: 'hero/reference-studies/hero-study-01.png' },
  { id: 'rabbit-existing', title: '兔子战斗代表图（复用已有新画风样张）', path: 'samples/originals/rabbit-battle.png', prompt: 'samples/prompts.json', reference: 'concepts/style-study-01.png' },
];
if (production) sources.splice(0, sources.length,
  { id: 'hero-front', title: '主角正面', path: 'hero/reference-studies/hero-front.png', prompt: 'hero/reference-studies/prompt-front.txt', reference: 'hero/reference-studies/hero-study-02.png' },
  { id: 'hero-level-1', title: '主角一级武器母版', path: 'hero/reference-studies/hero-study-02.png', prompt: 'hero/reference-studies/prompt-02.txt', reference: 'hero/reference-studies/hero-study-01.png' },
  ...Array.from({length:6}, (_,i) => ({id: `hero-level-${i+2}`, title: `主角${i+2}级武器`, path: `hero/weapon-variants/hero-back-${i+2}.png`, prompt: `hero/weapon-variants/prompt-${i+2}.txt`, reference: 'hero/reference-studies/hero-study-02.png'})),
  { id: 'fox-back', title: '蓝狐后视', path: 'pets/originals/blue-fox-back.png', prompt: 'pets/prompt-back.txt', reference: 'pets/originals/blue-fox-study-02.png' },
  { id: 'fox-parts', title: '蓝狐躯干与尾巴拆件', path: 'pets/blue-fox-parts.png', prompt: 'pets/blue-fox-parts-prompt.txt', reference: 'pets/originals/blue-fox-back.png' },
  { id: 'cat-battle-02', title: '新猫战斗造型（去暖光修订）', path: 'animals/cat-battle-study-02.png', prompt: 'animals/cat-battle-study-02-prompt.txt', reference: 'animals/cat-battle-study.png' },
  { id: 'cat-battle', title: '新猫战斗造型（暖光初稿）', path: 'animals/cat-battle-study.png', prompt: 'animals/cat-battle-study-prompt.txt', reference: 'animals/originals/cat.png' },
);
const report = [];
const approvedAppearances = new Set(['fox-02', 'hero-02', 'rabbit-existing']);
for (const source of sources) {
  const data = await readFile(resolve(base, source.path));
  await readFile(resolve(base, source.prompt));
  const reference = await readFile(resolve(base, source.reference));
  const image = await loadImage(data);
  const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, image.width, image.height).data;
  let transparent = 0, partial = 0, opaque = 0;
  const bounds = [image.width, image.height, -1, -1];
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const alpha = rgba[(y * image.width + x) * 4 + 3];
    if (alpha === 0) transparent++; else if (alpha < 255) partial++; else opaque++;
    if (alpha > 8) {
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
    }
  }
  if ((!production && !transparent) || bounds[2] < 0) throw Error(`Missing transparency or subject: ${source.id}`);
  const margins = [bounds[0] / image.width, bounds[1] / image.height,
    (image.width - 1 - bounds[2]) / image.width, (image.height - 1 - bounds[3]) / image.height];
  report.push({ ...source, status: approvedAppearances.has(source.id) ? 'appearance-approved-production-checks-pending' : production ? 'derived-production-candidate-checks-pending' : 'superseded-study', appearanceApproved: approvedAppearances.has(source.id), generator: 'built-in image_gen',
    bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'),
    referenceSha256: createHash('sha256').update(reference).digest('hex'),
    width: image.width, height: image.height, transparent, partial, opaque,
    boundsAlphaOver8: bounds, marginsAlphaOver8: margins, meets12PercentMargin: margins.every(value => value >= .12),
    note: 'Alpha>8 bounds only; not a claim that all faint pixels are cleared. Originals unchanged; not runtime assets or device evidence.' });
}
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ date: '2026-11-10', referenceApproved: 'style-study-01; hero02, fox02 and new plush rabbit appearances approved; formal parts and variants authorized', images: report }, null, 2) + '\n');
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const panels = report.map(item => `<article><h2>${escape(item.title)}</h2><p>${item.appearanceApproved ? '造型已批准，正式资源待验' : production ? '新母版衍生资源，制作检查中' : '历史初稿'} · ${item.width}×${item.height} · ${(item.bytes / 1024).toFixed(1)} KiB · 12%边距${item.meets12PercentMargin ? '通过' : '未达标'}</p><div class="pair">${['light','dark'].map(bg => `<div class="${bg}"><img src="../${item.path}" alt="${escape(item.title)} ${bg}" width="320"></div>`).join('')}</div><div class="sizes">${[48,96,160].map(size => `<figure><div class="checker"><img src="../${item.path}" width="${size}" alt="${size}px ${escape(item.title)}"></div><figcaption>${size}px宽度</figcaption></figure>`).join('')}</div><a href="../${item.path}">完整原图</a> · <a href="../${item.prompt}">准确提示词</a></article>`).join('\n');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新图代表审样</title><style>body{font:16px/1.65 system-ui;margin:24px;background:#f6f1e7;color:#243b39}main{max-width:1100px;margin:auto}article{background:white;border-radius:16px;padding:20px;margin:24px 0}.pair,.sizes{display:flex;flex-wrap:wrap;gap:16px}.pair>div{padding:12px;max-width:100%}.light{background:#fff3d9}.dark{background:#243641}img{max-width:100%;height:auto;display:block}.checker{background:repeating-conic-gradient(#ddd 0% 25%,white 0% 50%) 50%/16px 16px}figure{margin:12px}a{color:#215b88}</style><main><h1>新图代表审样</h1><p>用户已确认以 <a href="../concepts/style-study-01.png">style-study-01</a> 为准，先制作代表图供审查。这里只引用新母版和新生成图，没有使用旧程序角色；三类代表造型已获批准，正在制作正式部件与变体；本页原图尚未替换运行资源。小图用于可读性比较，不代表游戏最终尺寸、自然动画或真机验收。</p><p>本页使用PNG原始透明通道在浅深底上显示，未抠图或改写像素。<a href="manifest.json">尺寸、alpha、边距与哈希记录</a></p>${panels}</main></html>\n`);
console.log(`Reviewed ${report.length} original images; no runtime files changed.`);
