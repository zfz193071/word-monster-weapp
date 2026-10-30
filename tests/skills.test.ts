import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSkillSession, skillCards } from '../miniprogram/fortress/skills';
import { createSessionPlan, createSeededRandom } from '../miniprogram/fortress/plans';
import { createCombat, stepCombat, getWeaponParameters } from '../miniprogram/fortress/combat';
import type { SkillId, SkillLevels, SessionPlan } from '../miniprogram/fortress/types';

function combat(plan: SessionPlan, waveIndex: number, skills: SkillLevels) {
  return createCombat({ plan, waveIndex, skills, combatId: `combat-${waveIndex}`, generation: 0, baseHp: 5,
    playerX: plan.waves[waveIndex].spawnPlan[0].position.x, monsterHitbox: { x: -30, y: -30, width: 60, height: 60 } });
}
function clear(plan: SessionPlan, wave: number, skills: SkillLevels) {
  let state = combat(plan, wave, skills);
  while (state.status === 'fighting') state = stepCombat(state).state;
  assert.equal(state.status, 'cleared'); return state;
}
const zero = { doubleShot: 0, fireRate: 0, bulletWidth: 0 };
test('同一波只抽一次，暂停不抽取/消费，重复和旧卡片不可领取', () => {
  const plan = createSessionPlan('skills', createSeededRandom(7));
  let draws = 0;
  const session = createSkillSession(plan, () => { draws++; return 0; });
  const state = clear(plan, 0, zero);
  const offer = session.open(state)!; const count = draws;
  session.setPaused(true);
  assert.equal(session.open(state), null);
  assert.equal(session.select(offer.offer.offerId, offer.offer.candidateIds[0]), null);
  session.setPaused(false);
  assert.equal(session.open(state), offer); assert.equal(draws, count);
  assert.equal(session.select('stale', offer.offer.candidateIds[0]), null);
  const absent = (['doubleShot', 'fireRate', 'bulletWidth'] as const).find(id => !offer.offer.candidateIds.includes(id))!;
  assert.equal(session.select(offer.offer.offerId, absent), null);
  const selected = session.select(offer.offer.offerId, offer.offer.candidateIds[0])!;
  assert.equal(session.select(offer.offer.offerId, offer.offer.candidateIds[1]), null);
  assert.equal(session.open(state), selected);
  const next = session.open(clear(plan, 1, session.levels))!;
  assert.equal(session.select(offer.offer.offerId, offer.offer.candidateIds[0]), null);
  assert.equal(session.offers.length, 2);
  session.dispose(); assert.equal(session.select(next.offer.offerId, next.offer.candidateIds[0]), null);
});
test('仅已清除的本局前四波能领奖，重开零技能，固定种子重现', () => {
  const plan = createSessionPlan('run', createSeededRandom(8));
  const histories: unknown[] = [];
  for (let replay = 0; replay < 2; replay++) {
    const session = createSkillSession(plan, createSeededRandom(5));
    assert.deepEqual(session.levels, zero);
    assert.equal(session.open(combat(plan, 0, zero)), null);
    const dead = { ...combat(plan, 0, zero), status: 'baseDestroyed' as const, base: { hp: 0, maxHp: 5 } };
    assert.equal(session.open(dead), null);
    const foreign = createSessionPlan('other', createSeededRandom(8));
    assert.equal(session.open(clear(foreign, 0, zero)), null);
    for (let wave = 0; wave < 5; wave++) {
      const state = clear(plan, wave, session.levels);
      const offer = session.open(state);
      if (wave === 4) { assert.equal(offer, null); break; }
      assert.ok(offer);
      assert.equal(new Set(offer.offer.candidateIds).size, 2);
      for (const id of offer.offer.candidateIds) assert.ok(session.levels[id] < 3);
      assert.equal(skillCards(offer, session.levels).length, 2);
      session.select(offer.offer.offerId, offer.offer.candidateIds[0]);
    }
    assert.equal(session.offers.length, 4);
    assert.equal(Object.values(session.levels).reduce((a,b) => a+b), 4);
    histories.push(session.offers);
  }
  assert.deepEqual(histories[0], histories[1]);
});
test('三种技能领取后通过真实战斗接口改变弹数、间隔、宽度，封顶后不再入选', () => {
  for (const preferred of ['doubleShot', 'fireRate', 'bulletWidth'] as SkillId[]) {
    // Find a deterministic stream offering the preferred skill three times.
    let checked = false;
    for (let seed = 0; seed < 100 && !checked; seed++) {
      const plan = createSessionPlan(`effect-${seed}`, createSeededRandom(1));
      const session = createSkillSession(plan, createSeededRandom(Math.imul(seed, 2654435761) >>> 0));
      for (let wave = 0; wave < 3; wave++) {
        const offer = session.open(clear(plan, wave, session.levels))!;
        if (!offer.offer.candidateIds.includes(preferred)) break;
        session.select(offer.offer.offerId, preferred);
        const next = combat(plan, wave + 1, session.levels);
        const weapon = getWeaponParameters(session.levels);
        assert.equal(next.projectiles.length, weapon.count);
        assert.ok(next.projectiles.every(bullet => bullet.width === weapon.width));
        let elapsed = next;
        for (let ms = 10; ms < weapon.intervalMs; ms += 10) elapsed = stepCombat(elapsed).state;
        assert.equal(elapsed.nextProjectileSequence, weapon.count);
        elapsed = stepCombat(elapsed).state;
        assert.equal(elapsed.nextProjectileSequence, weapon.count * 2);
        if (wave === 2) {
          assert.equal(session.levels[preferred], 3);
          assert.ok(!session.open(clear(plan, 3, session.levels))!.offer.candidateIds.includes(preferred));
          checked = true;
        }
      }
    }
    assert.ok(checked, preferred);
  }
});
