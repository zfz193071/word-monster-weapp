import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { HomeRoomScene } from '../miniprogram/home/room-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { createBattlePet } from '../miniprogram/pets/battle';

// Static review fixtures: production rendering, unchanged runtime assets and rules.
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/visual-audit/current-scenes');
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
  // Cover every weapon, then every house without duplicating the level-one pair.
  const cases = [...Array.from({ length: 7 }, (_, i) => ({ weaponLevel: i + 1, houseLevel: 1 })),
    ...Array.from({ length: 4 }, (_, i) => ({ weaponLevel: 1, houseLevel: i + 2 }))];
  for (const { weaponLevel, houseLevel } of cases) {
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
    const scene = new CanvasScene(canvas, { initial, width, height, dpr, levelId: 1, clientLeft: 0,
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
      await save(canvas, { name: `${device}-battle-w${weaponLevel}-h${houseLevel}`, width, height,
        weaponLevel, houseLevel, arenaWidth: state.arenaWidth, heroPath: art.hero.path,
        bosses: ['normal', 'iron', 'grand'], petLevel: 1 });
    } finally { scene.dispose(); }
    const homeCanvas = createCanvas(width * dpr, height * dpr);
    const home = new HomeRoomScene(homeCanvas, width, height, dpr);
    try {
      home.setWeaponLevel(weaponLevel); home.setHouseLevel(houseLevel); home.setPet({ level: 1, equipped: [] });
      await save(homeCanvas, { name: `${device}-home-w${weaponLevel}-h${houseLevel}`, width, height, weaponLevel, houseLevel, petLevel: 1 });
    } finally { home.dispose(); }
  }
}
if (report.length !== 44) throw Error('Incomplete scene coverage');
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const cards = report.map(entry => `<figure><figcaption>${entry.name} · ${entry.width}×${entry.height} CSS px · DPR 2</figcaption><img loading="lazy" src="${entry.name}.png" width="${entry.width}" height="${entry.height}"></figure>`).join('');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>现行美术基线</title><style>body{font:16px system-ui;background:#f6f1e7;color:#263d38;margin:24px}figure{background:white;padding:16px;overflow:auto;margin:24px 0}figcaption{margin-bottom:12px}img{display:block;max-width:none}p{max-width:900px;line-height:1.8}</style><h1>七级武器 · 五级房屋 · Boss · 蓝狐</h1><p>正式首页与战场绘制器，现行素材，无候选图替换。固定普通怪/铁桶Boss/最终Boss及一级蓝狐，仅供改造前对照。手机与平板尺寸是审查夹具，首页仅画布，不包含页面按钮和弹窗；不是微信设备截图、自然战斗或动画验收。静态图不证明枪口弹道、攻击时序或碰撞正确。</p><a href="report.json">尺寸、路径和哈希记录</a>${cards}</html>`);
console.log(`Rendered ${report.length} current-art baseline scenes.`);
