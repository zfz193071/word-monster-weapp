import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { BATTLE_WORDS } from '../miniprogram/fortress/fruit-catalog';

// Review fixture only: keep runtime paths, geometry, and gameplay untouched.
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/visual-audit/fruits/scenes');
await mkdir(output, { recursive: true });
const ids = BATTLE_WORDS.map(word => word.id);
const substitutions = new Map(BATTLE_WORDS.map(word => [word.fruitImagePath,
  resolve(root, `docs/visual-audit/fruits/variants/${word.id}-128.png`)]));
const report: object[] = [];
async function render(name: string, width: number, height: number, dpr: number, words: string[], bosses = false) {
  const initial = createOpeningEncounter('fruit-art-review', 'apple', 1);
  const canvas = createCanvas(width * dpr, height * dpr);
  const loaded = new Set<string>();
  canvas.requestAnimationFrame = () => 1;
  canvas.cancelAnimationFrame = () => {};
  canvas.createImage = () => {
    const image = new Image();
    const src = Object.getOwnPropertyDescriptor(Image.prototype, 'src')!;
    Object.defineProperty(image, 'src', {
      set(value: string) {
        if (substitutions.has(value)) loaded.add(value);
        src.set!.call(image, substitutions.get(value) ?? resolve(root, 'miniprogram', value.replace(/^\//, '')));
      },
      get() { return src.get!.call(image); },
    });
    return image;
  };
  (globalThis as any).wx = { createOffscreenCanvas: ({ width, height }: any) => createCanvas(width, height) };
  const scene = new CanvasScene(canvas, {
    initial, width, height, dpr, clientLeft: 0, preview: false,
    art: openingArt('apple', ids), onHud() {}, onEvents() {}, onError(error) { throw Error(error); },
  });
  try {
    scene.setPaused(true);
    if (!await scene.load()) throw Error(`${name}: scene did not load`);
    const state = scene.snapshot!;
    const arenaWidth = state.arenaWidth!;
    const monsters = words.map((wordId, index) => ({
      ...state.monsters[0], id: `review-${index}`, wordId, status: 'alive' as const,
      hp: 100, maxHp: 100, boss: bosses && index > 0,
      bossKind: bosses && index > 0 ? (index === 1 ? 'iron' as const : 'grand' as const) : undefined,
      position: bosses ? { x: 65 + index * 115, y: 245 } : {
        x: 36 + (index % 6) * (arenaWidth - 72) / 5,
        y: 110 + Math.floor(index / 6) * 110 + (index % 2) * 25,
      },
    }));
    // Invoke the production draw method without advancing combat or granting rewards.
    (scene as any).draw({ ...state, tick: 70, monsters });
    for (const id of new Set(words)) {
      if (!loaded.has(BATTLE_WORDS.find(word => word.id === id)!.fruitImagePath)) throw Error(`${name}: missing ${id}`);
    }
    const bytes = canvas.toBuffer('image/png');
    await writeFile(resolve(output, `${name}.png`), bytes);
    report.push({ name, width, height, dpr, arenaWidth, words, bosses,
      candidateSize: 128, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      source: 'Production CanvasScene, synthetic placement, review-only image substitution; not gameplay or device capture',
    });
    return canvas;
  } finally { scene.dispose(); }
}

for (const [device, width, height] of [['phone', 390, 620], ['ipad', 1024, 580]] as const) {
  for (const dpr of [1, 2, 3]) for (const density of ['low', 'high']) {
    const words = Array.from({ length: density === 'low' ? 6 : 18 }, (_, index) => ids[index % ids.length]);
    await render(`${device}-${density}-dpr${dpr}`, width, height, dpr, words);
  }
}
const sheet = createCanvas(1080, 1320), ctx = sheet.getContext('2d');
ctx.fillStyle = '#f6f1e7'; ctx.fillRect(0, 0, sheet.width, sheet.height);
for (const [index, id] of ids.entries()) {
  const canvas = await render(`${id}-bosses`, 360, 560, 2, [id, id, id], true);
  const x = index % 3 * 360, y = Math.floor(index / 3) * 330;
  ctx.fillStyle = '#263d38'; ctx.font = '18px sans-serif';
  ctx.fillText(`${id}: normal / iron / grand`, x + 12, y + 24);
  // One source pixel pair per output pixel: unchanged CSS-scale crop, no enlarged badges.
  ctx.drawImage(canvas, 0, 200, 720, 560, x, y + 40, 360, 280);
}
await writeFile(resolve(output, 'boss-contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const cards = report.map((entry: any) => `<figure><figcaption>${entry.name} · ${entry.width}×${entry.height} CSS px · DPR ${entry.dpr}</figcaption><img loading="lazy" src="${entry.name}.png" width="${entry.width}" height="${entry.height}"></figure>`).join('');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>水果战场与Boss审样</title><style>body{background:#f6f1e7;color:#263d38;font:16px system-ui;margin:24px}figure{margin:24px 0;overflow:auto;background:white;padding:16px;border-radius:12px}img{display:block;max-width:none}figcaption{margin-bottom:12px}p{max-width:900px;line-height:1.8}</style><h1>11词 · 帽标与Boss · 战场尺寸审样</h1><p>候选统一使用128px图。正式CanvasScene绘制，人工排列6/18只怪；手机与平板各DPR 1/2/3。图片按记录CSS尺寸显示，小屏可横向滚动。每词另列普通怪、铁桶Boss、最终Boss。均为离屏静态夹具，不是自然刷怪、微信截图、动态或设备验收；尚未替换游戏资源，待整套视觉确认。</p><p><a href="../review.html">水果母版与尺寸对照</a> · <a href="report.json">渲染记录</a> · <a href="boss-contact-sheet.png">Boss总览</a></p>${cards}</html>`);
console.log(`Rendered ${report.length} scene fixtures and the 11-word Boss contact sheet.`);
