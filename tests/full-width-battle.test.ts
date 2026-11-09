import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createViewport } from '../miniprogram/fortress/viewport';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { createStageInvasion } from '../miniprogram/fortress/stage-invasion';
import { findAutomaticTarget, resizeCombatArena, stepCombat, summonSupportSoldier } from '../miniprogram/fortress/combat';
import { invasionBatchPositions } from '../miniprogram/fortress/spawn-pressure';
import { battlePetPosition } from '../miniprogram/pets/battle';
import { DamageNumbers } from '../miniprogram/fortress/damage-numbers';
import type { CombatState } from '../miniprogram/fortress/types';

const initial = () => createStageInvasion(createOpeningPlan('wide-battle', createSeededRandom(7), 1), 1);

test('手机、iPad横竖屏战场填满可用区域，横纵使用同一缩放，不裁切防线', () => {
  for (const [width, height] of [[390, 620], [768, 850], [1024, 580], [1366, 750]]) {
    for (const dpr of [1, 2, 3]) {
      const v = createViewport(width, height, dpr, true);
      assert.equal(v.left, 0); assert.equal(v.top, 0);
      assert.ok(Math.abs(v.worldWidth * v.scale - width) < 1e-8);
      assert.ok(Math.abs(560 * v.scale - height) < 1e-8);
      assert.equal(v.scale, height / 560);
    }
  }
});

test('四难度首只与后续批次覆盖全宽，留出完整怪物边距并保持确定性', () => {
  for (const difficulty of ['easy', 'normal', 'hard', 'nightmare'] as const) {
    const xs: number[] = [];
    for (let seed = 0; seed < 60; seed++) {
      const plan = createOpeningPlan(`full-${seed}`, createSeededRandom(seed), 1, 1, difficulty);
      const original = createStageInvasion(plan, 1);
      const state = resizeCombatArena(original, 960);
      xs.push(state.monsters[0].position.x);
      assert.equal(state.monsters[0].position.y, 32);
      assert.deepEqual(state.invasion, original.invasion);
      assert.deepEqual(state.incomingMonsters?.map(m => [m.id, m.spawnAtMs, m.hp]), original.incomingMonsters?.map(m => [m.id, m.spawnAtMs, m.hp]));
      for (const count of [1, 5, 12]) {
        const ids = Array.from({length: count}, (_, i) => `${difficulty}-${seed}-${i}`);
        const points = invasionBatchPositions(ids, -32, 960);
        assert.deepEqual(points, invasionBatchPositions(ids, -32, 960));
        for (const p of points) { xs.push(p.x); assert.ok(p.x >= 48 && p.x <= 912); assert.ok(p.y <= -32); }
      }
    }
    for (let band = 0; band < 5; band++) assert.ok(xs.some(x => x >= band * 192 && x < (band + 1) * 192));
    assert.ok(xs.some(x => x < 96)); assert.ok(xs.some(x => x > 864));
  }
});

test('宽屏右侧超过旧360边界的怪物可自动瞄准、命中，后续出生仍用全宽', () => {
  const source = resizeCombatArena(initial(), 960);
  const enemy = {...source.monsters[0], position: {x: 860, y: 250}, hp: 1000, maxHp: 1000};
  let state: CombatState = {...source, monsters: [enemy], incomingMonsters: [], invasion: undefined, monsterSpeed: 0};
  assert.equal(findAutomaticTarget(state.monsters, 960)?.id, enemy.id);
  let hit = false;
  for (let i = 0; i < 350; i++) {
    const result = stepCombat(state); state = result.state;
    if (result.events.some(event => event.type === 'monsterDamaged' && event.monsterId === enemy.id)) {hit = true; break;}
  }
  assert.ok(hit, '右侧子弹不能在旧360边界被清掉');
  const pending = source.incomingMonsters![0];
  const arrived = stepCombat({...source, tick: 30000, invasion: {...source.invasion!, nextAtMs: 0}}).state;
  assert.ok(arrived.monsters.some(m => m.id === pending.id));
  const expected = invasionBatchPositions(arrived.monsters.slice(1).map(m => m.id), -32, 960);
  assert.deepEqual(arrived.monsters.slice(1).map(m => m.position.x), expected.map(p => p.x));
});

test('旋转重排不推进时钟/重复奖励，碰撞尺寸不变，士兵宠物与飘字跟随新战场', () => {
  let source = initial();
  for (let i = 0; i < 3; i++) source = summonSupportSoldier(source, `ally-${i}`)!;
  for (let i = 0; i < 100; i++) source = stepCombat(source).state;
  const wide = resizeCombatArena(source, 960);
  assert.equal(wide.tick, source.tick); assert.equal(wide.shotRemainingMs, source.shotRemainingMs);
  assert.deepEqual(wide.base, source.base); assert.deepEqual(wide.defeatedMonsterIds, source.defeatedMonsterIds);
  assert.deepEqual(wide.processedBaseAttackIds, source.processedBaseAttackIds);
  assert.deepEqual(wide.monsters.map(m => m.hitbox), source.monsters.map(m => m.hitbox));
  assert.equal(wide.player.x, 480);
  assert.deepEqual(wide.supportSoldiers?.map(s => s.position.x), [430, 480, 530]);
  assert.deepEqual(stepCombat(wide).state.supportSoldiers?.map(s => s.position.x), [430, 480, 530]);
  assert.deepEqual(battlePetPosition(wide.player, wide.arenaWidth), {x: 720, y: 480});
  assert.equal(resizeCombatArena(wide, 960), wide);
  const back = resizeCombatArena(wide, 360);
  assert.deepEqual(back.monsters.map(m => m.position), source.monsters.map(m => m.position));
  const numbers = new DamageNumbers();
  numbers.add([{type:'monsterDamaged', context:source.context, tick:source.tick, monsterId:'edge', hp:1, damage:10, kind:'projectile', position:{x:320,y:250}}], 0);
  numbers.resize(960 / 360);
  assert.ok(numbers.sample(0, 960)[0].position.x > 800);
});
