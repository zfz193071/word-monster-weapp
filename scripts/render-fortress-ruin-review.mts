import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const output = 'docs/visual-audit/battlefield-overhaul/fortress/destroyed-runtime';
await mkdir(output, { recursive: true });
(globalThis as any).wx = { createOffscreenCanvas: ({ width, height }: any) => createCanvas(width, height) };
const report: any[] = [];
for (const [device, width, height] of [['phone', 390, 620], ['ipad', 1024, 580]] as const) {
  for (const hp of [1, 0]) {
    const canvas = createCanvas(width * 2, height * 2);
    canvas.requestAnimationFrame = () => 1; canvas.cancelAnimationFrame = () => {};
    canvas.createImage = () => {
      const image = new Image();
      const src = Object.getOwnPropertyDescriptor(Image.prototype, 'src')!;
      Object.defineProperty(image, 'src', { set(value: string) {
        src.set!.call(image, resolve('miniprogram', value.replace(/^\//, '')));
      }, get() { return src.get!.call(image); } });
      return image;
    };
    const opening = createOpeningEncounter('ruin-review', 'apple', 1);
    const initial = { ...opening, houseLevel: 1, base: { ...opening.base, hp },
      status: hp === 0 ? 'baseDestroyed' as const : opening.status };
    const scene = new CanvasScene(canvas, { initial, width, height, dpr: 2, levelId: 1,
      clientLeft: 0, preview: false, art: openingArt('apple', ['apple'], 1),
      onHud() {}, onEvents() {}, onError(error) { throw Error(error); } });
    try {
      scene.setPaused(true);
      if (!await scene.load()) throw Error('Scene load failed');
      const name = `${device}-${hp ? 'intact' : 'destroyed'}`;
      const bytes = canvas.toBuffer('image/png');
      await writeFile(`${output}/${name}.png`, bytes);
      report.push({ name, hp, width, height, dpr: 2, sha256: createHash('sha256').update(bytes).digest('hex'),
        evidence: 'Production renderer, fixed fixture, not natural gameplay or device verification' });
    } finally { scene.dispose(); }
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
await writeFile(`${output}/review.html`, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>一级堡垒摧毁对照</title><style>body{font:16px system-ui;background:#f6f1e7;color:#263d38;margin:24px}img{max-width:100%;height:auto}figure{display:inline-block;vertical-align:top;margin:8px;max-width:48%}</style><h1>一级堡垒：1生命与0生命</h1><p>正式Canvas绘制器，手机390×620、平板1024×580，DPR 2固定夹具。不是自然战斗、模拟器或真机验收；主角与怪物仍待整场美术整改。</p>${report.map(e => `<figure><figcaption>${e.name}</figcaption><img src="${e.name}.png" width="${e.width}"></figure>`).join('')}<p><a href="report.json">尺寸与哈希</a></p></html>`);
console.log(`Rendered ${report.length} fixtures.`);
