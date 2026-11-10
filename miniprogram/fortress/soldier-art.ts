import { soldierType } from './army';
import type { SupportSoldierState } from './types';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

// Vector equipment stays sharp at the actual screen DPR. Shot effects refer to
// committed combat hits, never a second cosmetic damage calculation.
export function drawSoldier(c: Context, soldier: SupportSoldierState, tick: number, combatId: string): void {
  const type = soldierType(soldier.soldierType);
  const target = soldier.shotTarget;
  const firing = soldier.shotCombatId === combatId && target && soldier.lastShotTick !== undefined && tick >= soldier.lastShotTick && tick - soldier.lastShotTick < 16;
  const angle = target ? Math.atan2(target.x - soldier.position.x, -(target.y - soldier.position.y)) : 0;
  c.save(); c.translate(soldier.position.x, soldier.position.y);
  c.fillStyle = 'rgba(31,50,42,.25)'; c.beginPath(); c.ellipse(0, 9, 12, 4, 0, 0, Math.PI * 2); c.fill();
  c.save(); c.rotate(angle);
  if (type === 'tank') {
    c.fillStyle='#243c38'; c.fillRect(-21,-12,9,32); c.fillRect(12,-12,9,32);
    c.strokeStyle='#6e8277';c.lineWidth=2;for(let y=-9;y<20;y+=6){c.beginPath();c.moveTo(-20,y);c.lineTo(-13,y);c.moveTo(13,y);c.lineTo(20,y);c.stroke();}
    c.fillStyle='#728d54';c.fillRect(-14,-17,28,34);c.fillStyle='#a6b77d';c.fillRect(-10,-14,5,27);
    c.fillStyle='#557545';c.beginPath();c.ellipse(0,-2,12,14,0,0,Math.PI*2);c.fill();
    c.fillStyle='#bbcca1';c.fillRect(-4,-34,8,30);c.fillStyle='#344b3e';c.fillRect(-5,-36,10,6);
  } else {
  c.fillStyle = '#243a35'; c.fillRect(-8, 4, 6, 8); c.fillRect(2, 4, 6, 8);
  c.fillStyle = '#315a50'; c.fillRect(-10, -8, 20, 15);
  c.fillStyle = '#83ae77'; c.fillRect(-7, -7, 14, 10);
  c.fillStyle = '#d5dfb7'; c.fillRect(-6, -17, 12, 9);
  c.fillStyle = '#547b89'; c.fillRect(-9, -20, 18, 8);
  c.fillStyle = '#c8edf1'; c.fillRect(-7, -20, 14, 3);
  // Shoulder stock, receiver, magazine, long barrel and a bright muzzle rim.
  const recoil = firing ? 2 : 0;
  c.fillStyle = '#704b35'; c.fillRect(4, -5 + recoil, 5, 11);
  c.fillStyle = '#243949'; c.fillRect(3, -20 + recoil, 8, 18); c.fillRect(1, -10 + recoil, 5, 6);
  c.fillStyle = '#91b8c9'; c.fillRect(5, -29 + recoil, 4, 12);
  c.fillStyle = '#f7d57c'; c.fillRect(4, -30 + recoil, 6, 3);
  c.fillStyle = '#d5dfb7'; c.fillRect(1, -5, 5, 4); c.fillRect(9, -15, 4, 5);
  if (type === 'shield') {
    c.fillStyle='#658b91';c.strokeStyle=soldier.evolved?'#f1d584':'#dbe4be';c.lineWidth=3;
    c.beginPath();c.moveTo(-17,-18);c.lineTo(14,-18);c.lineTo(13,0);c.quadraticCurveTo(0,15,-15,0);c.closePath();c.fill();c.stroke();
    c.strokeStyle='#bad2cd';c.lineWidth=2;c.beginPath();c.moveTo(-1,-14);c.lineTo(-1,5);c.stroke();
  } else if (type === 'rocket') {
    c.fillStyle='#465c49';c.fillRect(0,-29,13,30);c.fillStyle='#b8c59a';c.beginPath();c.moveTo(0,-29);c.lineTo(6,-41);c.lineTo(13,-29);c.closePath();c.fill();
    c.fillStyle='#d4ac66';c.fillRect(0,-15,13,4);
  } else if (type === 'jetpack' || type === 'flamethrower') {
    c.fillStyle=type==='jetpack'?'#729fa9':'#b58a4c';
    for(const x of [-17,10]) {c.fillRect(x,-12,7,22);c.beginPath();c.arc(x+3.5,-12,3.5,Math.PI,Math.PI*2);c.fill();}
    if(type==='jetpack'){c.fillStyle='#eac27c';for(const x of [-14,13]){c.beginPath();c.moveTo(x-3,10);c.lineTo(x,18+3*Math.sin(tick*.13));c.lineTo(x+3,10);c.closePath();c.fill();}}
  }
  }
  if (soldier.evolved) {c.fillStyle='#f1d584';c.beginPath();c.moveTo(0,-24);c.lineTo(4,-20);c.lineTo(0,-16);c.lineTo(-4,-20);c.closePath();c.fill();}
  if (firing) {
    c.fillStyle = '#fff0a8'; c.beginPath(); c.moveTo(7, -39); c.lineTo(12, -29); c.lineTo(2, -29); c.closePath(); c.fill();
  }
  c.restore();
  if (firing) {
    c.strokeStyle = type === 'flamethrower' ? 'rgba(235,153,74,.65)' : 'rgba(255,219,120,.75)'; c.lineWidth = type === 'flamethrower' ? 8 : type === 'tank' || type === 'rocket' ? 3 : 1.5;
    c.beginPath(); c.moveTo(Math.sin(angle) * 30 + Math.cos(angle) * 7, -Math.cos(angle) * 30 + Math.sin(angle) * 7);
    c.lineTo(target.x - soldier.position.x, target.y - soldier.position.y); c.stroke();
  }
  if (soldier.hp < soldier.maxHp) {
    c.fillStyle = '#33423a'; c.fillRect(-10, 15, 20, 3);
    c.fillStyle = '#84e3a5'; c.fillRect(-10, 15, 20 * soldier.hp / soldier.maxHp, 3);
  }
  c.restore();
}
