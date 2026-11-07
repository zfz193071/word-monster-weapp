import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { createStageInvasion } from '../miniprogram/fortress/stage-invasion';
import type { CombatEvent, CombatState } from '../miniprogram/fortress/types';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';

const skills: SkillCollection = {
  doubleShot: { level: 3, quality: 'rare' }, fireRate: { level: 3, quality: 'rare' },
  bulletWidth: { level: 3, quality: 'rare' }, homing: { level: 3, quality: 'legendary' },
  flame: { level: 3, quality: 'rare' }, frost: { level: 3, quality: 'rare' },
  lightning: { level: 3, quality: 'rare' }, firepower: { level: 3, quality: 'rare' },
};

// Fixed 20ms display frames, compared every three simulation seconds. All four
// speeds reach these boundaries exactly, without rounding or dropped frames.
function replay(initial: CombatState, speed: number) {
  const runner = new CombatRunner(initial);
  runner.setSpeed(speed);
  let wallTime = 0;
  runner.frame(wallTime);
  const states: CombatState[] = [];
  const events: CombatEvent[] = [];
  for (let checkpoint = 1; checkpoint <= 20; checkpoint++) {
    for (let frame = 0; frame < 150 / speed; frame++) {
      wallTime += 20;
      const result = runner.frame(wallTime);
      assert.equal(result.droppedMs, 0);
      events.push(...result.events);
    }
    assert.equal(runner.snapshot!.tick, checkpoint * 300);
    states.push(runner.snapshot!);
    if (checkpoint === 10) {
      const frozen = runner.snapshot;
      runner.pause();
      wallTime += 60000;
      assert.equal(runner.frame(wallTime).steps, 0);
      assert.equal(runner.snapshot, frozen);
      runner.resume(wallTime, 2);
    }
  }
  runner.dispose();
  assert.equal(runner.frame(wallTime + 10000).state, null);
  return { states, events };
}

for (const difficulty of ['easy', 'normal', 'hard', 'nightmare'] as const) {
  test(`${difficulty}：四倍率60秒连续进攻状态和逐条事件一致，暂停不补帧`, () => {
    const plan = createOpeningPlan('speed-equivalence', createSeededRandom(41), 3, 1, difficulty);
    const initial = createStageInvasion(plan, 1, skills);
    // Test-only base endurance keeps the clock observable for all 60 seconds;
    // spawn schedules, monster stats, damage and rewards remain unchanged.
    const fixture = { ...initial, base: { ...initial.base, hp: 1000000, maxHp: 1000000 } };
    const baseline = replay(fixture, 1);
    assert(baseline.events.some(event => event.type === 'waveStarted'));
    assert(baseline.events.some(event => event.type === 'monsterDefeated'));
    for (const speed of [1.5, 2, 2.5]) assert.deepEqual(replay(fixture, speed), baseline);
  });

  test(`${difficulty}：Boss、元素与射击的同时间状态/伤害事件不随倍率变化`, () => {
    const plan = createOpeningPlan('speed-boss', createSeededRandom(41), 3, 1, difficulty);
    const initial = createStageInvasion(plan, 1, skills);
    const grand = initial.incomingMonsters!.find(monster => monster.bossKind === 'grand')!;
    assert(grand);
    // Deliberate high-health fixture exercises multiple boss/element cycles;
    // this is clock equivalence, not a natural victory or difficulty test.
    const fixture: CombatState = { ...initial, incomingMonsters: [],
      base: { ...initial.base, hp: 1000000, maxHp: 1000000 },
      monsters: [{ ...grand, hp: 1000000, maxHp: 1000000, spawnAtMs: 0,
        status: 'alive', position: { x: 180, y: 250 } },
      { ...initial.monsters[0], hp: 1000000, maxHp: 1000000, spawnAtMs: 0,
        status: 'alive', position: { x: 200, y: 250 } }],
    };
    const baseline = replay(fixture, 1);
    assert(baseline.events.some(event => event.type === 'baseDamaged' && event.attackId.includes(':shockwave:')));
    for (const kind of ['projectile', 'flame', 'lightning']) {
      assert(baseline.events.some(event => event.type === 'monsterDamaged' && event.kind === kind), kind);
    }
    assert(baseline.states.some(state => state.monsters.some(monster => monster.slowRatio)));
    for (const speed of [1.5, 2, 2.5]) assert.deepEqual(replay(fixture, speed), baseline);
  });
}
