import { battlePetPosition } from './battle';
import type { CombatState } from '../fortress/types';
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
export const BATTLE_PET_ART = Object.freeze({
  path: '/character-assets/blue-fox-parts.png',
  source: 'docs/visual-audit/pets/parts-manifest.json',
  rights: '本项目内置 image_gen 制作，2026-11-10',
  approved: true,
});
export function drawBattlePet(c: Context, state: CombatState, image?: WechatMiniprogram.Image): void {
  const pet = state.pet; if (!pet) return;
  const position = battlePetPosition(state.player, state.arenaWidth), scale = pet.level >= 7 ? 1 : pet.level >= 4 ? .87 : .73;
  const oval = (x:number,y:number,rx:number,ry:number,color:string) => { c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill(); };
  c.save();c.translate(position.x,position.y);c.scale(scale,scale);
  oval(0,3,21,6,'#405e5540');
  if (image) {
    // Half-size atlas; tail rotates around its root behind the stationary body.
    c.save();c.translate(7,-20);c.rotate(Math.sin(state.tick*.025)*.12);
    c.drawImage(image,543,0,543,362,-29.92,-42.4,86.88,57.92);c.restore();
    c.drawImage(image,0,0,543,362,-44.8,-56.88,86.88,57.92);
  } else {
  c.save();c.rotate(Math.sin(state.tick*.025)*.12);oval(17,-10,13,7,'#85bdcf');oval(25,-11,6,5,'#fff0ce');c.restore();
  oval(0,-9,14,16,'#85bdcf');oval(-8,1,5,4,'#587e9d');oval(8,1,5,4,'#587e9d');
  oval(0,-25,17,13,'#85bdcf');
  for(const x of [-11,11]){c.fillStyle='#85bdcf';c.beginPath();c.moveTo(x-7,-32);c.lineTo(x,-49);c.lineTo(x+7,-32);c.closePath();c.fill();c.fillStyle='#e6b8b4';c.beginPath();c.moveTo(x-3,-34);c.lineTo(x,-43);c.lineTo(x+3,-34);c.closePath();c.fill();}
  oval(-7,-22,8,6,'#fff0ce');oval(7,-22,8,6,'#fff0ce');
  oval(-7,-28,2,3,'#354c63');oval(7,-28,2,3,'#354c63');
  oval(0,-22,3,2,'#354c63');
  c.fillStyle='#ffe291';c.fillRect(-2,-37,4,7);
  }
  c.save(); if (image) c.translate(-8,-13);
  if(pet.equipped.includes('collar')){c.fillStyle='#9b83c1';c.fillRect(-10,-14,20,4);oval(0,-9,3,3,'#ffe291');}
  if(pet.equipped.includes('hat')){c.fillStyle='#bfa478';c.fillRect(-18,-36,36,4);c.fillStyle='#dec294';c.fillRect(-10,-44,20,9);}
  if(pet.equipped.includes('charm')){c.strokeStyle='#f4d271';c.lineWidth=3;c.beginPath();c.moveTo(10,-15);c.lineTo(8,-8);c.lineTo(13,-8);c.lineTo(9,-1);c.stroke();}
  c.restore();c.restore();
}
