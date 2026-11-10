import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANIMAL_LOCOMOTION, footCycle, monsterGait } from '../miniprogram/fortress/monster-gait';
import { getLevel } from '../miniprogram/fortress/levels';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';

test('16动物按现有战斗形态完整分流，鸡鸭双足、鸟蜂飞行、鱼游动', () => {
  assert.deepEqual(Object.keys(ANIMAL_LOCOMOTION).sort(), getLevel(3).words.map(w => w.id).sort());
  assert.equal(Object.values(ANIMAL_LOCOMOTION).filter(v => v === 'quadruped').length, 11);
  assert.equal(ANIMAL_LOCOMOTION.chicken, 'biped'); assert.equal(ANIMAL_LOCOMOTION.duck, 'biped');
  assert.equal(ANIMAL_LOCOMOTION.bird, 'flying'); assert.equal(ANIMAL_LOCOMOTION.bee, 'flying');
  assert.equal(ANIMAL_LOCOMOTION.fish, 'swimming');
});

test('落地支撑脚向后移，回摆抬脚；循环边界连续，双足交替', () => {
  for (const stance of [.42, .62]) {
    assert.equal(footCycle(.1, stance).lift, 0);
    assert.ok(footCycle(.2, stance).travel < footCycle(.1, stance).travel);
    assert.ok(footCycle((stance + 1) / 2, stance).lift > .99);
    assert.ok(Math.abs(footCycle(1 - 1e-8, stance).travel - footCycle(0, stance).travel) < 1e-6);
    assert.ok(Math.abs(footCycle(stance - 1e-8, stance).travel - footCycle(stance, stance).travel) < 1e-6);
  }
  const walk = monsterGait(7, 0).feet;
  assert.notDeepEqual(walk[0], walk[1]);
});

test('真实战斗冻结时保留步态，解冻继续，减速按移动距离改变步频且绘制采样不修改状态', () => {
  const initial = createOpeningEncounter('gait-freeze', 'apple', 1);
  const monster = {...initial.monsters[0], spawnAtMs: 0, status: 'alive' as const, position: {x: 180, y: 100}, frozenUntilTick: 20};
  let state = {...initial, monsters: [monster]};
  const frozenPose = monsterGait(monster.position.y, 0);
  for (let i = 0; i < 20; i++) {
    state = stepCombat(state).state as typeof state;
    assert.deepEqual(monsterGait(state.monsters[0].position.y, 0), frozenPose);
  }
  const thawed = stepCombat(state).state;
  assert.notDeepEqual(monsterGait(thawed.monsters[0].position.y, 0), frozenPose);
  const slow = stepCombat({...state, monsters: [{...state.monsters[0], slowUntilTick: 100, slowRatio: .5}]}).state;
  assert.ok(Math.abs((slow.monsters[0].position.y - 100) * 2 - (thawed.monsters[0].position.y - 100)) < 1e-8);
  const before = structuredClone(thawed);
  monsterGait(thawed.monsters[0].position.y, 0);
  assert.deepEqual(thawed, before);
});

test('四足物种都有独立体型，兔子成对蹬地、奔跑错峰落脚、大象始终有支撑', async () => {
  const { QUADRUPED_SHAPES, quadrupedPose } = await import('../miniprogram/fortress/quadruped-art');
  assert.deepEqual(Object.keys(QUADRUPED_SHAPES).sort(), Object.keys(ANIMAL_LOCOMOTION).filter(id => ANIMAL_LOCOMOTION[id] === 'quadruped').sort());
  for (const id of Object.keys(QUADRUPED_SHAPES)) {
    let aerial = false;
    for (let step = 0; step < 100; step++) {
      const y = step * QUADRUPED_SHAPES[id].stride / 100;
      const pose = quadrupedPose(id, y, 0);
      aerial ||= pose.airborne;
      for (const foot of pose.feet) {
        assert.ok(foot.lift >= 0 && foot.lift <= 1);
        assert.ok(Math.abs(foot.travel) <= 1);
      }
      if (id === 'elephant') assert.equal(pose.airborne, false);
      assert.deepEqual(pose, quadrupedPose(id, y, 0), 'same travel freezes the entire pose');
    }
    if (id !== 'elephant') assert.equal(aerial, true, `${id} has a suspension phase`);
    const a = quadrupedPose(id, 0, 0), b = quadrupedPose(id, QUADRUPED_SHAPES[id].stride, 0);
    a.feet.forEach((foot,i) => {
      assert.ok(Math.abs(foot.travel-b.feet[i].travel)<1e-8);
      assert.ok(Math.abs(foot.lift-b.feet[i].lift)<1e-8);
    });
  }
  assert.notDeepEqual(quadrupedPose('rabbit', 4, 0).feet, quadrupedPose('horse', 4, 0).feet);
});

test('猫的支撑脚在世界坐标固定，回摆抬脚且首尾连续', async () => {
  const {catPaw,CAT_STRIDE}=await import('../miniprogram/fortress/cat-run-art');
  for(const hind of [true,false]) {
    const a=catPaw(1,0,hind), b=catPaw(3,0,hind);
    assert.ok(a.planted && b.planted);
    assert.ok(Math.abs((1+a.forward*.62)-(3+b.forward*.62))<1e-9);
    assert.ok(catPaw(CAT_STRIDE*.6,0,hind).height>0);
    const end=catPaw(CAT_STRIDE-1e-7,0,hind),start=catPaw(0,0,hind);
    assert.ok(Math.abs(end.forward-start.forward)<1e-5);
    assert.ok(Math.abs(end.height-start.height)<1e-5);
  }
});
