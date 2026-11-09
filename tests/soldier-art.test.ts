import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawSoldier } from '../miniprogram/fortress/soldier-art';
import type { SupportSoldierState } from '../miniprogram/fortress/types';

test('士兵武器常驻，真实射击才画弹道；暂停冻结、过期及跨轮不重播', () => {
  const commands: unknown[][] = [];
  const context = new Proxy({}, {get: (_, name) => (...args: unknown[]) => commands.push([name, ...args]), set: () => true});
  const soldier: SupportSoldierState = {id:'soldier', slot:0, hp:30, maxHp:30, position:{x:150,y:530}, attackRemainingMs:2000};
  const draw = (state: SupportSoldierState, tick: number, combatId = 'battle') => {
    commands.length = 0;
    drawSoldier(context as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D, state, tick, combatId);
    return commands.map(command => [...command]);
  };
  const idle = draw(soldier, 0);
  assert.ok(idle.some(c => c[0] === 'fillRect' && c[1] === 5 && c[2] === -29), '未开火也装备枪管');
  assert.ok(!idle.some(c => c[0] === 'lineTo'));
  const fired = {...soldier, lastShotTick:200, shotCombatId:'battle', shotTarget:{x:180,y:200}};
  const shooting = draw(fired, 200);
  assert.ok(shooting.some(c => c[0] === 'lineTo' && c[1] === 30 && c[2] === -330));
  assert.deepEqual(draw(fired, 200), shooting, '暂停后使用同一tick，画面保持');
  assert.ok(!draw(fired, 216).some(c => c[0] === 'lineTo'));
  assert.ok(!draw(fired, 200, 'next-wave').some(c => c[0] === 'lineTo'));
});
