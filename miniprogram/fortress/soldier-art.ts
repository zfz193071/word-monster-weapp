import type { SupportSoldierState } from './types';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

// Vector equipment stays sharp at the actual screen DPR. Shot effects refer to
// committed combat hits, never a second cosmetic damage calculation.
export function drawSoldier(c: Context, soldier: SupportSoldierState, tick: number, combatId: string): void {
  const target = soldier.shotTarget;
  const firing = soldier.shotCombatId === combatId && target && soldier.lastShotTick !== undefined && tick >= soldier.lastShotTick && tick - soldier.lastShotTick < 16;
  const angle = target ? Math.atan2(target.x - soldier.position.x, -(target.y - soldier.position.y)) : 0;
  c.save(); c.translate(soldier.position.x, soldier.position.y);
  c.fillStyle = 'rgba(31,50,42,.25)'; c.beginPath(); c.ellipse(0, 9, 12, 4, 0, 0, Math.PI * 2); c.fill();
  c.save(); c.rotate(angle);
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
  if (firing) {
    c.fillStyle = '#fff0a8'; c.beginPath(); c.moveTo(7, -39); c.lineTo(12, -29); c.lineTo(2, -29); c.closePath(); c.fill();
  }
  c.restore();
  if (firing) {
    c.strokeStyle = 'rgba(255,219,120,.75)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(Math.sin(angle) * 30 + Math.cos(angle) * 7, -Math.cos(angle) * 30 + Math.sin(angle) * 7);
    c.lineTo(target.x - soldier.position.x, target.y - soldier.position.y); c.stroke();
  }
  if (soldier.hp < soldier.maxHp) {
    c.fillStyle = '#33423a'; c.fillRect(-10, 15, 20, 3);
    c.fillStyle = '#84e3a5'; c.fillRect(-10, 15, 20 * soldier.hp / soldier.maxHp, 3);
  }
  c.restore();
}
