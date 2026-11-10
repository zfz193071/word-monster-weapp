import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {drawSoldier} from '../miniprogram/fortress/soldier-art';
import {soldierSpritePath} from '../miniprogram/fortress/soldier-sprites';

// Actual renderer, fixed committed-hit fixtures; no save or combat mutation.
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.env.WM_CANVAS_MODULE??'@napi-rs/canvas');
const canvas=createCanvas(1000,1000),c=canvas.getContext('2d');
c.fillStyle='#dfe6cd';c.fillRect(0,0,1000,1000);
const types=['rifle','flamethrower','rocket','jetpack','tank'] as const;
for(const [row,type] of types.entries()){
 const image=await loadImage(`miniprogram${soldierSpritePath(type)}`);
 for(const [col,[dx,dy]] of [[0,-65],[65,0],[-52,-39],[0,65]].entries()){
  c.save();c.translate(col*250+125,row*200+105);c.scale(2,2);
  drawSoldier(c,{id:type,slot:0,soldierType:type,hp:30,maxHp:30,position:{x:0,y:0},attackRemainingMs:0,lastShotTick:200,shotCombatId:'review',shotTarget:{x:dx,y:dy}},207,'review',image);
  c.restore();c.fillStyle='#29483b';c.font='14px sans-serif';c.fillText(`${type} · direction ${col+1} · 2×`,col*250+12,row*200+192);
 }
}
await writeFile('docs/visual-audit/army/muzzle-review.png',canvas.toBuffer('image/png'));
console.log('Rendered 20 fixed shot views; not device screenshots.');
