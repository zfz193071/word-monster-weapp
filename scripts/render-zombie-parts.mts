import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { APPLE_ZOMBIE_PARTS, BOSS_ZOMBIE_PARTS, drawAppleZombieParts, drawBossZombieParts } from '../miniprogram/fortress/zombie-art';
import { monsterGait } from '../miniprogram/fortress/monster-gait';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const output = 'docs/visual-audit/enemies/approved-parts/runtime';
await mkdir(output, {recursive:true});
for (const kind of ['apple','iron','grand'] as const) {
const art = kind === 'apple' ? APPLE_ZOMBIE_PARTS : BOSS_ZOMBIE_PARTS[kind];
const image = await loadImage(`miniprogram${art.path}`);
const draw = (c:any, gait:any) => kind === 'apple' ? drawAppleZombieParts(c,image,gait) : drawBossZombieParts(c,image,gait,kind);
for (const dark of [false,true]) {
  const canvas = createCanvas(1800,650), c = canvas.getContext('2d');
  c.fillStyle = dark ? '#25302e' : '#f6eddc'; c.fillRect(0,0,1800,650);
  for (let index=0;index<8;index++) {
    const gait = monsterGait(index*18/8,0);
    c.save(); c.translate(index*225+112,190); c.scale(1.5,1.5);
    draw(c,gait); c.restore();
    c.save(); c.translate(index*225+112,485); const scale = 40/128*2*(kind === 'grand' ? 2 : kind === 'iron' ? 1.5 : 1); c.scale(scale,scale);
    draw(c,gait); c.restore();
    c.fillStyle=dark?'#f6eddc':'#25302e'; c.font='14px sans-serif';
    c.fillText(`Phase ${index}/8`,index*225+75,625);
  }
  await writeFile(`${output}/${kind}-walk-${dark?'dark':'light'}.png`,canvas.toBuffer('image/png'));
}
}
console.log('Rendered eight gait phases, enlarged and actual logical size at DPR 2, on two backgrounds');
