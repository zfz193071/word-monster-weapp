import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bossPose } from '../miniprogram/fortress/boss-pose';
import { bossWaveIndex, bossChargePhase } from '../miniprogram/fortress/battle-progression';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';

test('王冠身体释放与真实冲击波同一模拟步，死亡或等待不播放蓄力', () => {
  let state = createOpeningEncounter('boss-art-review-2026-11-11', 'apple', 1, 18,
    {doubleShot: 2, fireRate: 2, bulletWidth: 1}, undefined, [], 1, 5, [], 'normal', undefined, 5);
  let checked = false;
  for (let i = 0; i < 10000 && state.status === 'fighting'; i++) {
    const previous = state, result = stepCombat(state); state = result.state;
    const event = result.events.find(event => event.type === 'baseDamaged' && event.attackId.includes('shockwave'));
    if (!event || event.type !== 'baseDamaged') continue;
    const boss = state.monsters.find(monster => monster.id === event.monsterId)!;
    const before = previous.monsters.find(monster => monster.id === boss.id)!;
    assert.ok(bossPose(before, previous.tick).torsoScaleY < 1, '伤害前仍在蓄力');
    const snapshot = JSON.stringify(boss);
    // Spawn times need not be multiples of the 10 ms simulation step.
    const release = bossPose(boss, state.tick).torsoY;
    assert.ok(release > 11.7 && release <= 12, '真实释放的首个模拟步已进入前探，误差小于一个10ms步长');
    assert.deepEqual(bossPose({...boss, hp: 0}, state.tick), {torsoY: 0, torsoScaleY: 1});
    assert.deepEqual(bossPose({...boss, status: 'waiting'}, state.tick), {torsoY: 0, torsoScaleY: 1});
    assert.equal(JSON.stringify(boss), snapshot, '不改变攻击或碰撞状态');
    checked = true; break;
  }
  assert.ok(checked, '正式波次必须产生冲击波事件');
});

test('铁桶前倾随真实冲锋阶段，接敌恢复原攻击动作且脚部步态独立', () => {
  const sessionId = 'boss-art-review-2026-11-11';
  let state = createOpeningEncounter(sessionId, 'apple', 1, bossWaveIndex(sessionId),
    {doubleShot: 2, fireRate: 2, bulletWidth: 1}, undefined, [], 1, 3, [], 'normal', undefined, 5);
  const observed = new Set<string>();
  for (let i = 0; i < 10000 && state.status === 'fighting'; i++) {
    state = stepCombat(state).state;
    const boss = state.monsters.find(monster => monster.boss && monster.hp > 0 && monster.status !== 'waiting');
    if (!boss) continue;
    const pose = bossPose(boss, state.tick);
    if (boss.status === 'attackingBase') {
      observed.add('contact'); assert.deepEqual(pose, {torsoY: 0, torsoScaleY: 1});
    } else {
      const phase = bossChargePhase(state.tick * 10 - (boss.spawnAtMs ?? 0));
      if (phase === 'charging') { observed.add(phase); assert.equal(pose.torsoY, 6); }
      if (phase === 'warning' && pose.torsoY > 0) { observed.add(phase); assert.ok(pose.torsoScaleY < 1); }
    }
  }
  assert.deepEqual([...observed].sort(), ['charging', 'contact', 'warning']);
});
