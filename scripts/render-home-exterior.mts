import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { HomeRoomScene } from '../miniprogram/home/room-scene';

// Review the actual renderer; fixtures do not load or change the user's save.
const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const output = fileURLToPath(new URL('../docs/visual-audit/home-exterior/runtime/', import.meta.url));
await mkdir(output, { recursive: true });
const report = [];
const sheet = createCanvas(1280, 1500), ctx = sheet.getContext('2d');
ctx.fillStyle = '#f6f1e7'; ctx.fillRect(0, 0, 1280, 1500);
for (const [device, width, height] of [['phone', 390, 500], ['ipad', 1024, 580]] as const) {
  for (let level = 1; level <= 5; level++) for (let direction = 0; direction < 4; direction++) {
    const canvas = createCanvas(width * 2, height * 2);
    const yaw = direction * Math.PI / 2;
    const scene = new HomeRoomScene(canvas, width, height, 2, yaw);
    scene.setHouseLevel(level); scene.setWeaponLevel(7); scene.setPet({ level: 7, equipped: ['collar'] });
    const name = `${device}-h${level}-view${direction}.png`;
    const bytes = canvas.toBuffer('image/png');
    await writeFile(resolve(output, name), bytes);
    report.push({ name, width, height, dpr: 2, houseLevel: level, weaponLevel: 7, petLevel: 7, yaw,
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (device === 'phone') {
      const x = direction * 320, y = (level - 1) * 300;
      ctx.drawImage(canvas, x + 43, y, 234, 300);
      ctx.fillStyle = '#263d38'; ctx.font = '16px sans-serif';
      ctx.fillText(`Lv ${level} · ${direction * 90}°`, x + 12, y + 24);
    }
    scene.dispose();
  }
}
await writeFile(resolve(output, 'contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(resolve(output, 'report.json'), JSON.stringify({
  source: 'Production HomeRoomScene, fixed static fixtures; not WeChat or device screenshots; no save mutations.',
  entries: report,
}, null, 2) + '\n');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>首页外景运行时构图</title><style>body{font:16px system-ui;background:#f6f1e7;color:#263d38;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}figure{margin:0;background:#fff8e8;padding:12px}img{width:100%;height:auto}p{line-height:1.7}</style><h1>首页房屋外景 · 五级 × 四方向</h1><p>正式绘制器的固定离屏夹具，手机与平板比例、DPR 2，使用七级武器和七级蓝狐。仅检查结构、构图与静态遮挡；不代表最终美术、微信模拟器、动态性能或真机验收。页面按钮及弹窗不在这些画布图中。</p><main>${report.map(e => `<figure><figcaption>${e.name} · ${e.width}×${e.height}</figcaption><img loading="lazy" src="${e.name}"></figure>`).join('')}</main></html>`);
console.log(`Rendered ${report.length} exterior views.`);
