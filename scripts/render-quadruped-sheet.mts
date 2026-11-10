import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { drawQuadruped, QUADRUPED_SHAPES } from '../miniprogram/fortress/quadruped-art';
const require = createRequire(import.meta.url);
const {createCanvas} = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const ids=Object.keys(QUADRUPED_SHAPES), canvas=createCanvas(960,ids.length*128);
const c=canvas.getContext('2d'); c.fillStyle='#f6f1e7';c.fillRect(0,0,canvas.width,canvas.height);
for(const [row,id] of ids.entries()){
 c.fillStyle='#26352f';c.font='16px sans-serif';c.fillText(id,8,row*128+20);
 for(let frame=0;frame<8;frame++){
  c.save();c.translate(65+frame*118,row*128+70);c.scale(1.6,1.6);
  drawQuadruped(c,id,frame*QUADRUPED_SHAPES[id].stride/8,0);c.restore();
 }
}
const output=resolve('docs/visual-audit/locomotion/revised');await mkdir(output,{recursive:true});
await writeFile(resolve(output,'quadruped-poses.png'),canvas.toBuffer('image/png'));
