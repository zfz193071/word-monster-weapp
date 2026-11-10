import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {drawSoldier,drawFallenSoldier} from '../miniprogram/fortress/soldier-art';
import {soldierSpritePath} from '../miniprogram/fortress/soldier-sprites';
import {SOLDIER_TYPES} from '../miniprogram/fortress/army';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.env.WM_CANVAS_MODULE??'@napi-rs/canvas');
const canvas=createCanvas(1080,720),c=canvas.getContext('2d');
c.fillStyle='#e5e8d7';c.fillRect(0,0,1080,720);
for(const [column,type] of SOLDIER_TYPES.entries()) {
 const image=await loadImage(`miniprogram${soldierSpritePath(type)}`);
 for(const [row,tick] of [100,109,118,136].entries()) {
  const soldier={id:type,slot:0,soldierType:type,hp:row<2?20:0,maxHp:30,position:{x:0,y:0},attackRemainingMs:1000,lastHitTick:100,hitCombatId:'review',lastShotTick:100,shotCombatId:'review',shotTarget:{x:0,y:-100}};
  c.save();c.translate(column*180+90,row*180+90);c.scale(2,2);
  (row<2?drawSoldier:drawFallenSoldier)(c,soldier,tick,'review',image);
  c.restore();c.fillStyle='#29483b';c.font='13px sans-serif';c.fillText(`${type} ${row<2?'hit':'fallen'} +${tick-100} · 2×`,column*180+10,row*180+165);
 }
}
await writeFile('docs/visual-audit/army/feedback-review.png',canvas.toBuffer('image/png'));
console.log('24 static feedback fixtures rendered; not device or natural-battle evidence.');
