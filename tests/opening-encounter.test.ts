import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningEncounter, openingSkillOffer, openingArt, OPENING_EXPERIENCE, ZERO_SKILLS } from '../miniprogram/fortress/opening-encounter';
import { createExperience } from '../miniprogram/fortress/experience';
import { createUpgradeChoices } from '../miniprogram/fortress/upgrade-choice';
import { applyCombatSkills, findAutomaticTarget, getWeaponParameters, stepCombat } from '../miniprogram/fortress/combat';
import { logicalHitbox } from '../miniprogram/fortress/viewport';
import type { SkillId } from '../miniprogram/fortress/types';

test('首批四只不同实体使用同一目标水果，战场素材碰撞区域与模拟一致', () => {
  for (const word of ['apple', 'banana', 'grape', 'orange', 'watermelon']) {
    const state = createOpeningEncounter(`run-${word}`, word, 1); const art = openingArt(word);
    assert.equal(state.monsters.length, 4); assert.equal(new Set(state.monsters.map(m => m.id)).size, 4);
    assert.ok(state.monsters.every(m => m.wordId === word));
    assert.equal(art.fruitHat?.path, `/assets/images/${word}.png`);
    assert.deepEqual(state.monsters[0].hitbox, logicalHitbox(art.monsterVisual, art.monsterWidth));
  }
});
test('首批真实命中击杀四只→32经验升级一次→三选一强化真实武器参数', () => {
  for (const preferred of ['doubleShot', 'fireRate', 'bulletWidth'] as SkillId[]) {
    let state = createOpeningEncounter(`run-${preferred}`, 'apple', 0);
    const xp = createExperience(state.context.sessionId, OPENING_EXPERIENCE); const choices = createUpgradeChoices();
    const upgrades: number[] = [];
    for (let i = 0; i < 4000 && state.status === 'fighting'; i++) {
      const next = stepCombat(state); state = next.state;
      const progress = xp.record(next.events); upgrades.push(...progress.upgrades);
      assert.equal(xp.record(next.events).upgrades.length, 0);
    }
    assert.equal(state.status, 'cleared'); assert.ok(state.base.hp > 0);
    assert.deepEqual(upgrades, [2]); assert.equal(xp.view.total, 32);
    const offer = choices.open(openingSkillOffer(state.context.sessionId))!;
    assert.equal(offer.cards.length, 3);
    const chosen = offer.cards.find(card => card.id === preferred) ?? offer.cards[0];
    const selected = choices.select(offer.id, chosen.id)!;
    state = applyCombatSkills(state, { ...state.skills, [selected.id]: 1 });
    const weapon = getWeaponParameters(state.skills);
    assert.equal(weapon.count, selected.id === 'doubleShot' ? 2 : 1);
    assert.equal(weapon.intervalMs, selected.id === 'fireRate' ? 400 : 500);
    assert.equal(weapon.width, selected.id === 'bulletWidth' ? 12 : 8);
    assert.equal(choices.select(offer.id, preferred), null);
  }
});


test('自动瞄准：视野外不射击、固定位置、优先前排且同排按出场顺序', () => {
  let state = createOpeningEncounter('aim', 'apple', 0);
  assert.equal(state.projectiles.length, 0);
  assert.equal(findAutomaticTarget(state.monsters), undefined);
  for (let i = 0; i < 70; i++) state = stepCombat(state, { playerX: 24 }).state;
  assert.equal(state.projectiles.length, 0); assert.equal(state.player.x, 180);
  for (let i = 0; i < 100; i++) state = stepCombat(state).state;
  assert.ok(state.projectiles.length > 0);
  assert.ok(Number.isFinite(state.projectiles[0].direction!.x));
  assert.ok(state.projectiles[0].direction!.y < 0);
  assert.equal(findAutomaticTarget(state.monsters)?.id, state.monsters[0].id);
  const front = { ...state.monsters[2], status: 'alive' as const, position: { x: 270, y: 200 } };
  assert.equal(findAutomaticTarget([state.monsters[0], front])?.id, front.id);
  assert.equal(findAutomaticTarget([state.monsters[0], { ...front, hp: 0 }])?.id, state.monsters[0].id);
  const oldDirection = state.projectiles[0].direction;
  const moved = stepCombat(state).state;
  assert.deepEqual(moved.projectiles[0].direction, oldDirection, '已射出的子弹不追踪拐弯');
});

test('新版僵尸缩小且移动速度减半', () => {
  const state = createOpeningEncounter('pace', 'apple', 0);
  assert.equal(openingArt('apple').monsterWidth, 40);
  assert.ok(Math.abs(stepCombat(state).state.monsters[0].position.y - state.monsters[0].position.y - 0.2) < 1e-9);
});

test('三波4→7→10：继承技能与基地血量，每波升级，最终168经验', () => {
  for (const preferred of ['doubleShot', 'fireRate', 'firepower'] as SkillId[]) {
    const xp = createExperience(`three-${preferred}`, OPENING_EXPERIENCE);
    let levels = { ...ZERO_SKILLS }; let hp = 50;
    const ids = new Set<string>();
    for (let wave = 0; wave < 3; wave++) {
      let state = createOpeningEncounter(`three-${preferred}`, ['apple', 'orange', 'grape'][wave], wave, wave, levels, hp);
      assert.equal(state.monsters.length, [4, 7, 10][wave]);
      for (const monster of state.monsters) { assert.ok(!ids.has(monster.id)); ids.add(monster.id); }
      const upgrades: number[] = [];
      for (let tick = 0; tick < 10000 && state.status === 'fighting'; tick++) {
        const next = stepCombat(state); state = next.state; upgrades.push(...xp.record(next.events).upgrades);
      }
      assert.equal(state.status, 'cleared', `${preferred} wave ${wave + 1}`);
      assert.deepEqual(upgrades, [wave + 2]); hp = state.base.hp;
      const offer = openingSkillOffer(state.context.sessionId, wave + 2, levels);
      assert.equal(offer.cards.length, 3);
      const skill = preferred === 'firepower' && wave > 0 ? 'fireRate' : preferred;
      levels = { ...levels, [skill]: levels[skill] + 1 };
    }
    assert.equal(xp.view.total, 168); assert.equal(xp.view.level, 4);
  }
});


test('随机分批计划可重放，每批1至3只、间隔800至1500毫秒、队内不重叠且待出场不移动', () => {
  const sizes = new Set<number>(); const positions = new Set<number>();
  for (let run = 0; run < 100; run++) {
    const initial = createOpeningEncounter(`spawn-${run}`, 'apple', 0, 2);
    assert.deepEqual(initial, createOpeningEncounter(`spawn-${run}`, 'apple', 0, 2));
    const batches = new Map<number, number[]>();
    for (const m of initial.monsters) { const time=m.spawnAtMs!; batches.set(time,[...(batches.get(time) ?? []),m.position.x]);positions.add(m.position.x); }
    let previous = 0;
    for (const [time, xs] of batches) {
      assert.ok(xs.length >= 1 && xs.length <= 3); sizes.add(xs.length);
      if(time) assert.ok(time-previous>=800 && time-previous<=1500);previous=time;
      for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++)assert.ok(Math.abs(xs[i]-xs[j])>=48);
    }
    const next=stepCombat(initial).state;
    for (let i=0;i<initial.monsters.length;i++)if(initial.monsters[i].spawnAtMs!>10)assert.deepEqual(next.monsters[i],initial.monsters[i]);
  }
  assert.deepEqual([...sizes].sort(),[1,2,3]);assert.ok(positions.size>100);
});
