import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { createBattlePet } from '../miniprogram/pets/battle';

// Static review fixtures: production rendering, unchanged runtime assets and rules.
const require = createRequire(import.meta.url);
const { createCanvas, Image, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/visual-audit/scenes');
await mkdir(output, { recursive: true });
const report: any[] = [];
const dpr = 2;
(globalThis as any).wx = { createOffscreenCanvas: ({ width, height }: any) => createCanvas(width, height) };
async function save(canvas: any, entry: any) {
  const bytes = canvas.toBuffer('image/png');
  await writeFile(resolve(output, `${entry.name}.png`), bytes);
  report.push({ ...entry, dpr, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    source: 'Production renderer with fixed static fixture; no asset substitution; not device or gameplay capture' });
}
for (const [device, width, height] of [['phone', 390, 620], ['ipad', 1024, 580]] as const) {
  for (let levelId = 1; levelId <= 8; levelId++) {
    const weaponLevel = 1, houseLevel = 1;
    const canvas = createCanvas(width * dpr, height * dpr);
    canvas.requestAnimationFrame = () => 1;
    canvas.cancelAnimationFrame = () => {};
    const loaded = new Set<string>();
    canvas.createImage = () => {
      const image = new Image();
      const src = Object.getOwnPropertyDescriptor(Image.prototype, 'src')!;
      Object.defineProperty(image, 'src', {
        set(value: string) { loaded.add(value); src.set!.call(image, resolve(root, 'miniprogram', value.replace(/^\//, ''))); },
        get() { return src.get!.call(image); },
      });
      return image;
    };
    const art = openingArt('apple', ['apple'], weaponLevel);
    const initial = { ...createOpeningEncounter('current-art-audit', 'apple', 1), weaponLevel, houseLevel,
      pet: createBattlePet({ level: 1, equipped: [] }) };
    const scene = new CanvasScene(canvas, { initial, width, height, dpr, levelId, clientLeft: 0,
      preview: false, art, onHud() {}, onEvents() {}, onError(error) { throw Error(error); } });
    try {
      scene.setPaused(true);
      if (!await scene.load()) throw Error('Scene load failed');
      if (!loaded.has(art.hero.path)) throw Error(`Missing weapon ${weaponLevel} hero`);
      const state = scene.snapshot!;
      const monsters = ['normal', 'iron', 'grand'].map((kind, index) => ({ ...state.monsters[0],
        id: `audit-${kind}`, hp: 100, maxHp: 100, status: 'alive' as const, boss: index > 0,
        bossKind: index > 0 ? kind as 'iron' | 'grand' : undefined,
        position: { x: state.arenaWidth! * (index + 1) / 4, y: 245 } }));
      (scene as any).draw({ ...state, tick: 70, monsters });
      await save(canvas, { name: `${device}-level-${levelId}`, width, height,
        levelId, weaponLevel, houseLevel, arenaWidth: state.arenaWidth, heroPath: art.hero.path,
        bosses: ['normal', 'iron', 'grand'], petLevel: 1 });
    } finally { scene.dispose(); }

  }
}
if (report.length !== 16) throw Error('Incomplete scene coverage');
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
// Reduced overview is for navigation; individual DPR 2 captures retain their native size.
for (const device of ['phone', 'ipad']) {
  const sheet = createCanvas(1200, device === 'phone' ? 1030 : 410);
  const c = sheet.getContext('2d'); c.fillStyle = '#f6f1e7'; c.fillRect(0, 0, sheet.width, sheet.height);
  for (const [i, entry] of report.filter(e => e.name.startsWith(device)).entries()) {
    const image = await loadImage(resolve(output, `${entry.name}.png`));
    const x = (i % 4) * 300, y = Math.floor(i / 4) * (device === 'phone' ? 515 : 205);
    c.fillStyle = '#263d38'; c.font = '18px sans-serif'; c.fillText(`Level ${entry.levelId}`, x + 8, y + 22);
    c.drawImage(image, x + 8, y + 32, 284, 284 * entry.height / entry.width);
  }
  await writeFile(resolve(output, `${device}-overview.png`), sheet.toBuffer('image/png'));
}
const cards = report.map(entry => `<figure><figcaption>${entry.name} · ${entry.width}×${entry.height} CSS px · DPR 2</figcaption><img loading="lazy" src="${entry.name}.png" width="${entry.width}" height="${entry.height}"></figure>`).join('');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>八关场景对照</title><style>body{font:16px system-ui;background:#f6f1e7;color:#263d38;margin:24px}figure{background:white;padding:16px;overflow:auto;margin:24px 0}figcaption{margin-bottom:12px}img{display:block;max-width:none}p{max-width:900px;line-height:1.8}</style><h1>八关背景 · 手机与平板</h1><p>正式CanvasScene绘制器，固定第一关苹果怪/两类Boss、一级武器/房屋/蓝狐，逐关仅切换背景以控制对比变量。并非各关自然刷怪、微信截图、真实设备或动态验收。首页及五级房屋沿用此前基线。</p><a href="report.json">尺寸与哈希</a> · <a href="../current-scenes/review.html">五级房屋与首页基线</a>${cards}</html>`);
console.log(`Rendered ${report.length} scene comparison fixtures.`);
