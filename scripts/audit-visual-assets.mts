import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLevel } from '../miniprogram/fortress/levels';

// Read-only runtime audit. Reports and previews stay outside the mini-program.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'miniprogram');
const output = resolve(root, 'docs/visual-audit');
const app = JSON.parse(await readFile(resolve(source, 'app.json'), 'utf8'));
const packages = [{ root: '', name: 'main', bytes: 0 }, ...app.subPackages.map((p: { root: string; name: string }) => ({ ...p, bytes: 0 }))];
const files: { path: string; bytes: number; width?: number; height?: number; decodedRgbaBytes?: number; package: string }[] = [];
async function scan(dir: string): Promise<void> {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!entry.isFile()) continue;
    const name = relative(source, path);
    const data = await readFile(path);
    const pack = packages.find((p: { root: string }) => p.root && name.startsWith(`${p.root}/`)) ?? packages[0];
    pack.bytes += data.length;
    if (!['.png', '.svg', '.jpg', '.webp'].includes(extname(path))) continue;
    const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (extname(path) === '.png' && (!png || data.length < 24)) throw new Error(`Invalid PNG: ${name}`);
    const dimensions = png ? { width: data.readUInt32BE(16), height: data.readUInt32BE(20) } : undefined;
    files.push({ path: name, bytes: data.length, ...dimensions,
      ...(dimensions ? { decodedRgbaBytes: dimensions.width * dimensions.height * 4 } : {}), package: pack.name });
  }
}
await scan(source);
const words = [getLevel(1), getLevel(3)].flatMap(level => level.words.map(word => {
  const path = word.fruitImagePath.replace(/^\//, '');
  const file = files.find(file => file.path === path);
  if (!file) throw new Error(`Missing learning image: ${word.id} ${path}`);
  return { id: word.id, meaning: word.meaningZh, category: level.category, ...file,
    owner: level.id === 1 ? 84 : 85,
    battle: level.id === 1 ? `assets/images/fortress/zombie-body-${word.id}.png + shared legs + learning badge` : `fortress/canvas-scene.ts::drawAnimal(${word.id})`,
    bossBadge: path,
    entryPoints: ['home vocabulary gallery', 'fortress-choice listening/skill quiz', 'battle mixed waves and Boss badge', 'retirement word', 'victory word particles'],
  };
}));
if (words.length !== 27 || new Set(words.map(w => w.id)).size !== 27) throw new Error('Expected 27 unique words');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'inventory.json'), JSON.stringify({
  schemaVersion: 1, evidence: 'Local source scan, not WeChat compiled sizes or resident GPU memory',
  packages, words, files,
}, null, 2) + '\n');
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const cards = words.map(w => `<article><img src="../../miniprogram/${escape(w.path)}" alt="${escape(w.meaning)}"><b>${escape(w.id)} · ${escape(w.meaning)}</b><small>${w.width}×${w.height} · ${(w.bytes / 1024).toFixed(1)} KiB · RGBA ${((w.decodedRgbaBytes ?? 0) / 1024).toFixed(0)} KiB</small><code>${escape(w.path)}</code><small>制作 #${w.owner} · 战斗 ${escape(w.battle)}</small></article>`).join('\n');
await writeFile(resolve(output, 'current-assets.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>27词现状盘点</title><style>body{font:16px system-ui;background:#f6f1e7;color:#243e39;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}article{background:white;padding:20px;border-radius:16px;display:flex;flex-direction:column;gap:10px}img{width:160px;height:160px;object-fit:contain;align-self:center;background:repeating-conic-gradient(#eee 0% 25%,#fff 0% 50%) 50%/16px 16px}small,code{font-size:12px;overflow-wrap:anywhere}p{max-width:950px;line-height:1.7}</style><h1>27词现状盘点</h1><p>当前资源目录直接引用；这是素材目录，不是实机截图或新样张。图片统一置于160×160 CSS像素框，仅便于风格对比，不代表游戏实际尺寸。RGBA为宽×高×4估算，未含纹理副本和画布。</p><main>${cards}</main></html>\n`);
console.log(`Audited ${files.length} image files and ${words.length} words. Report: docs/visual-audit/inventory.json`);
for (const p of packages) console.log(`${p.name}: ${(p.bytes / 1024).toFixed(1)} KiB; headroom ${((2097152 - p.bytes) / 1024).toFixed(1)} KiB`);
