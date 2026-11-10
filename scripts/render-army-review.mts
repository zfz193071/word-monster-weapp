import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {drawSoldier} from '../miniprogram/fortress/soldier-art';
import {SOLDIER_TYPES} from '../miniprogram/fortress/army';
import {soldierStats} from '../miniprogram/fortress/soldier-types';
const require=createRequire(import.meta.url);
const {createCanvas}=require(process.env.WM_CANVAS_MODULE??'@napi-rs/canvas');
const canvas=createCanvas(960,480),c=canvas.getContext('2d');
c.fillStyle='#f1ecd8';c.fillRect(0,0,960,480);
for(let row=0;row<2;row++)for(let i=0;i<6;i++){
 const type=SOLDIER_TYPES[i],skill={level:row?5:1,quality:row?'elite' as const:'crude' as const};const stats=soldierStats(type,skill,10);
 c.fillStyle=row?'#263d35':'#dde5c9';c.fillRect(i*160,row*240,160,240);
 c.save();c.translate(i*160+80,row*240+125);c.scale(2,2);
 drawSoldier(c,{id:type,slot:0,source:'skill',soldierType:type,skill,evolved:stats.evolved,hp:stats.maxHp*.6,maxHp:stats.maxHp,position:{x:0,y:0},attackRemainingMs:0},70,'review');c.restore();
 c.fillStyle=row?'#f1ecd8':'#263d35';c.font='16px sans-serif';c.textAlign='center';c.fillText(type,i*160+80,row*240+195);
 c.font='12px sans-serif';c.fillText(row?'Lv.5 elite · 2×':'Lv.1 crude · 2×',i*160+80,row*240+218);
}
await writeFile('docs/visual-audit/army/soldiers.png',canvas.toBuffer('image/png'));
