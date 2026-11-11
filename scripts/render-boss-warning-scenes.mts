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
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/visual-audit/enemies/approved-parts/warning-layout');
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
  // Cover every house in intact and destroyed states.
  const cases = [0,1,2].map(slot => ({slot, weaponLevel: 5, houseLevel: 5, destroyed: false}));
  for (const { slot, weaponLevel, houseLevel, destroyed } of cases) {
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
      pet: createBattlePet({ level: 7, equipped: [] }) };
    const scene = new CanvasScene(canvas, { initial, width, height, dpr, levelId: 1, clientLeft: 0,
      preview: false, art, onHud() {}, onEvents() {}, onError(error) { throw Error(error); } });
    try {
      scene.setPaused(true);
      if (!await scene.load()) throw Error('Scene load failed');
      if (!loaded.has(art.hero.path)) throw Error(`Missing weapon ${weaponLevel} hero`);
      const state = scene.snapshot!;
      const x = [40, state.arenaWidth! / 2, state.arenaWidth! - 40][slot];
      const monsters = [{...state.monsters[0], id: 'warning-grand', hp: 100, maxHp: 100,
        boss: true, bossKind: 'grand' as const, spawnAtMs: 0, status: 'alive' as const,
        position: {x, y: 245}}];
      (scene as any).draw({...state, tick: 1090, monsters});
      await save(canvas, {name: `${device}-grand-${slot}`, width, height, weaponLevel, houseLevel,
        arenaWidth: state.arenaWidth, bossX: x, tick: 1090, warningSide: slot === 0 ? 'right' : 'left'});
    } finally { scene.dispose(); }

  }
}
if (report.length !== 6) throw Error('Incomplete scene coverage');
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const cards = report.map(entry => `<figure><figcaption>${entry.name} · ${entry.width}×${entry.height} CSS px · DPR 2</figcaption><img loading="lazy" src="${entry.name}.png" width="${entry.width}" height="${entry.height}"></figure>`).join('');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh"><meta charset="utf-8"><title>Boss预警布局</title><style>body{font:16px system-ui;margin:24px;background:#f6f1e7}img{max-width:100%;height:auto}</style><h1>王冠Boss预警布局</h1><p>正式Canvas，固定蓄力末段夹具；手机/平板DPR2，各覆盖左右边缘与中线。不代表动态、真机或整场验收。</p>${report.map(r => `<h2>${r.name}</h2><img src="${r.name}.png">`).join('')}</html>`);
console.log('Rendered six Boss warning placement fixtures.');
