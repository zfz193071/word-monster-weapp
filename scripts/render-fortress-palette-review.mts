import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { HomeRoomScene } from '../miniprogram/home/room-scene';
import { drawHouseFortress } from '../miniprogram/houses/battle-art';
import { fortressPalette } from '../miniprogram/houses/fortress-palette';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const output = fileURLToPath(new URL('../docs/visual-audit/fortress-palette/', import.meta.url));
await mkdir(output, { recursive: true });
const width = 390, homeHeight = 500, battleHeight = 560, dpr = 2;
const rowHeight = battleHeight + 100;
const sheet = createCanvas(width * dpr * 2 + 100, rowHeight * dpr * 5);
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#f6f1e7'; ctx.fillRect(0, 0, sheet.width, sheet.height);
const entries = [];

for (let level = 1; level <= 5; level++) {
  const home = createCanvas(width * dpr, homeHeight * dpr);
  const homeContext = home.getContext('2d');
  homeContext.fillStyle = '#dceacb'; homeContext.fillRect(0, 0, home.width, home.height);
  const scene = new HomeRoomScene(home, width, homeHeight, dpr, 0);
  scene.setHouseLevel(level); scene.setWeaponLevel(1);
  const battle = createCanvas(width * dpr, battleHeight * dpr);
  const battleContext = battle.getContext('2d');
  battleContext.scale(dpr, dpr);
  battleContext.fillStyle = '#dceacb'; battleContext.fillRect(0, 0, width, battleHeight);
  battleContext.fillStyle = '#c2a87f'; battleContext.fillRect(0, 400, width, 80);
  drawHouseFortress(battleContext as never, level, width);
  const y = (level - 1) * rowHeight * dpr;
  ctx.fillStyle = '#263d38'; ctx.font = 'bold 36px sans-serif';
  ctx.fillText(`Lv ${level} · ${['Wood', 'Reinforced wood', 'Stone', 'Battlements', 'Armored'][level - 1]}`, 24, y + 42);
  ctx.font = '24px sans-serif'; ctx.fillText('Home', 24, y + 80); ctx.fillText('Battle', width * dpr + 76, y + 80);
  ctx.drawImage(home, 24, y + 100);
  ctx.drawImage(battle, width * dpr + 76, y + 100);
  entries.push({ level, palette: fortressPalette(level), homeSize: [width, homeHeight], battleSize: [width, battleHeight] });
  scene.dispose();
}

await writeFile(resolve(output, 'contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(resolve(output, 'report.json'), JSON.stringify({
  source: 'Production HomeRoomScene and drawHouseFortress renderers; fixed phone-sized DPR2 fixture. Not WeChat simulator or device capture.',
  entries,
}, null, 2) + '\n');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>五级堡垒配色对照</title><style>body{font:16px system-ui;background:#f6f1e7;color:#263d38;margin:24px}img{display:block;width:min(100%,1280px);height:auto}p{max-width:900px;line-height:1.7}</style><h1>首页 / 战斗堡垒 · 五级配色对照</h1><p>左侧由首页正式绘制器按手机390×500、DPR 2渲染；右侧由战斗正式堡垒绘制器按390×560、DPR 2渲染后并排。等级1–2保持木材及加固梁，3–4保持石材，5保持金属护板和金色包边。固定朝向的离屏静态夹具，用于颜色核对；不是微信模拟器、自然游戏场景或真机截图。</p><p><a href="report.json">色板与尺寸记录</a></p><img src="contact-sheet.png" alt="首页和战斗场景五级堡垒并排对照"></html>`);
console.log(`Rendered five home/battle level comparisons to ${output}`);
