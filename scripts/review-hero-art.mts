import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Offline alpha-composite review. Does not crop or replace runtime assets.
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../docs/visual-audit/hero/', import.meta.url));
const specs = [
  { id: 'before', file: 'hero-back-weapon-1-refined.png', scale: 1 },
  { id: 'edge-v1', file: 'hero-back-weapon-1-edge-refined.png', scale: 1 },
  { id: 'edge-v2', file: 'hero-back-weapon-1-edge-refined-v2.png', scale: 1 },
];
const report: any[] = [];
const sources: any[] = [];
for (const spec of specs) {
  const file = `originals/${spec.file}`;
  const bytes = await readFile(resolve(root, file));
  const image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  let transparent = 0, partial = 0, maxAlpha = 0;
  const bounds = [image.width, image.height, 0, 0];
  const visibleBounds = [...bounds];
  const include = (b: number[], x: number, y: number) => {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x + 1); b[3] = Math.max(b[3], y + 1);
  };
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const alpha = pixels[(y * image.width + x) * 4 + 3];
    maxAlpha = Math.max(maxAlpha, alpha);
    if (alpha === 0) transparent++; else {
      if (alpha < 255) partial++;
      include(bounds, x, y);
      if (alpha >= 128) include(visibleBounds, x, y);
    }
  }
  if (!transparent || maxAlpha < 128) throw Error(`${spec.id}: missing transparent region or visible subject`);
  const edgeClear = bounds[0] > 0 && bounds[1] > 0 && bounds[2] < image.width && bounds[3] < image.height;
  report.push({ ...spec, file, width: image.width, height: image.height, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), transparentPixels: transparent,
    semiTransparentPixels: partial, maxAlpha, contentBounds: bounds, visibleBoundsAlpha128: visibleBounds,
    edgeClear, rgbaBytes: image.width * image.height * 4 });
  sources.push(image);
}

const sheet = createCanvas(1080, 820), ctx = sheet.getContext('2d');
const drawSubject = (index: number, centerX: number, footY: number, height: number) => {
  const b = report[index].visibleBoundsAlpha128;
  const scale = height / (b[3] - b[1]);
  // Draw the complete original. Alpha threshold only determines framing, never removes pixels.
  ctx.drawImage(sources[index], centerX - (b[0] + b[2]) * scale / 2,
    footY - b[3] * scale, sources[index].width * scale, sources[index].height * scale);
};
for (const [row, background] of ['#f6f1e7', '#192633'].entries()) {
  const y = row * 410;
  ctx.fillStyle = background; ctx.fillRect(0, y, 1080, 410);
  ctx.fillStyle = row ? '#f6f1e7' : '#263340'; ctx.font = '18px sans-serif';
  ctx.fillText('Equal visible height: 200px / 48px. Scale comparison below: 60px.', 20, y + 26);
  for (let i = 0; i < specs.length; i++) {
    const x = 180 + i * 360;
    drawSubject(i, x - 40, y + 245, 200);
    drawSubject(i, x + 100, y + 245, 48);
    drawSubject(i, x, y + 385, 60 * specs[i].scale);
    ctx.fillStyle = row ? '#f6f1e7' : '#263340';
    ctx.fillText(specs[i].id, x - 45, y + 405);
  }
}
await writeFile(resolve(root, 'edge-comparison.png'), sheet.toBuffer('image/png'));
await writeFile(resolve(root, 'edge-review.json'), JSON.stringify({
  status: 'pending-visual-review', tool: 'built-in image_gen', runtimeInstalled: false,
  prompts: ['refinement-prompt.txt', 'edge-refinement-prompt.txt', 'edge-refinement-v2-prompt.txt'],
  framing: 'alpha >= 128 bounds for review sizing only; full originals composited without pixel removal',
  evidence: 'Static alpha composites only, not runtime mapping, collision, animation or device acceptance',
  images: report,
}, null, 2) + '\n');
await writeFile(resolve(root, 'edge-review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>#91 主角透明边缘审查</title><style>body{margin:24px auto;padding:0 20px;max-width:1100px;background:#eee9df;color:#263340;font:16px/1.7 system-ui}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{padding:8px 16px;border:1px solid #bbb}</style><h1>#91 主角透明边缘修整候选</h1><p>待视觉确认，未接入运行时。上/下半分别为浅/深底。三版均提供等高200px、48px与60px对照。按alpha≥128的可见主体计算高度，只用于审样；原图完整绘制，未去除半透明边缘。</p><img src="edge-comparison.png" alt="主角修整前后在浅深背景上的尺寸对照"><table><tr><th>角色</th><th>母版</th><th>KiB</th><th>非零alpha不触边</th></tr>${report.map(r => `<tr><td>${r.id}</td><td>${r.width}×${r.height}</td><td>${(r.bytes / 1024).toFixed(1)}</td><td>${r.edgeClear ? '通过' : '待修整'}</td></tr>`).join('')}</table><p>静态独立造型对照不等于游戏实际布局、帽标/血条遮挡、攻击时点、碰撞或设备验收。锚点、部件拆分及动态接入仍待完成。</p></html>`);
console.log(JSON.stringify(report.map(r => ({ id: r.id, edgeClear: r.edgeClear, maxAlpha: r.maxAlpha, bytes: r.bytes })), null, 2));
