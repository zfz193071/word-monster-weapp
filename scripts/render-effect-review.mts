import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { createBattlePet } from '../miniprogram/pets/battle';

// Static review fixtures: production rendering, fixed impact positions and tick; not natural gameplay or device evidence.
const require = createRequire(import.meta.url);
const { createCanvas, Image, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/visual-audit/effects', process.argv[2] === 'before' ? 'before' : 'after');
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
  for (const count of [3, 18]) {
    const levelId = 1;
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
      const monsters = Array.from({length: count}, (_, index) => ({ ...state.monsters[0],
        id: `effect-${index}`, hp: 100, maxHp: 100, status: 'alive' as const,
        boss: index === count - 1, bossKind: index === count - 1 ? 'grand' as const : undefined,
        position: {x: state.arenaWidth! * (index % 3 + 1) / 4, y: 160 + Math.floor(index / 3) * 45} }));
      const elementImpacts = monsters.map((monster, index) => ({
        kind: (['flame', 'frost', 'lightning'] as const)[index % 3], position: monster.position,
        target: monsters[(index + 1) % count].position, radius: 45, untilTick: 95,
        iceChain: index % 2 === 0,
      }));
      (scene as any).draw({ ...state, tick: 70, monsters, elementImpacts });
      await save(canvas, { name: `${device}-${count === 3 ? 'low' : 'high'}`, width, height,
        levelId, count, tick: 70, untilTick: 95, impactCount: elementImpacts.length });
    } finally { scene.dispose(); }

  }
}
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Rendered ${report.length} static effect fixtures in ${output}`);
