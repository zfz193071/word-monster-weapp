import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { GUARDIAN_BODY, GUARDIAN_RIGS, drawGuardianRig } from '../miniprogram/fortress/guardian-rig';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const output='docs/visual-audit/hero/parts-study/runtime';await mkdir(output,{recursive:true});
const body=await loadImage(`miniprogram${GUARDIAN_BODY.path}`);
for(const dark of [false,true]) {
 const canvas=createCanvas(1800,1000),c=canvas.getContext('2d');c.fillStyle=dark?'#25302e':'#f6eddc';c.fillRect(0,0,1800,1000);
 for(const [row,rig] of GUARDIAN_RIGS.entries()) {
  const arms=await loadImage(`miniprogram${rig.art.path}`);
  for(let col=0;col<9;col++) {
   const angle=(col-4)*Math.PI/9;c.save();c.translate(col*200+100,row*200+105);c.scale(1.8,1.8);
   drawGuardianRig(c,body,arms,rig,{x:0,y:0},{x:Math.sin(angle),y:-Math.cos(angle)});c.restore();
   c.fillStyle=dark?'#f6eddc':'#25302e';c.font='16px sans-serif';c.fillText(`W${rig.level} · ${(col-4)*20}°`,col*200+65,row*200+185);
  }
 }
 await writeFile(`${output}/joint-poses-${dark?'dark':'light'}.png`,canvas.toBuffer('image/png'));
}
console.log('Rendered 45 poses on each of two backgrounds using production rig and runtime images');
