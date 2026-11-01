import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExperience } from '../miniprogram/fortress/experience';
import { createUpgradeChoices } from '../miniprogram/fortress/upgrade-choice';
import type { CombatEvent } from '../miniprogram/fortress/types';
import type { UpgradeOffer } from '../miniprogram/fortress/upgrade-choice';

const kill = (id: string, sessionId = 'run'): CombatEvent => ({ type: 'monsterDefeated', monsterId: id, wordId: 'apple', tick: 10,
  context: { sessionId, waveId: 'wave', combatId: 'combat', generation: 0 } });
// Test-only numbers exercise the mechanism; these are not production balance defaults.
test('经验只接受本局真实击杀事件，重复回调与恢复代次不会重复计分', () => {
  const xp = createExperience('run', { experiencePerKill: 7, levelThresholds: [14, 35] });
  const first = kill('one');
  assert.deepEqual(xp.record([kill('foreign', 'other'), first, first]), { total: 7, level: 1, upgrades: [] });
  assert.deepEqual(xp.record([{ ...first, context: { ...first.context, generation: 2 } }, kill('two')]), { total: 14, level: 2, upgrades: [2] });
  assert.deepEqual(xp.record([kill('three'), kill('four'), kill('five')]), { total: 35, level: 3, upgrades: [3] });
  xp.dispose(); assert.equal(xp.record([kill('six')]).total, 35);
});
test('经验规则显式提供、快照不被配置修改影响，多级事件按顺序且每级仅一次', () => {
  const rules = { experiencePerKill: 11, levelThresholds: [3, 8, 15] };
  const xp = createExperience('run', rules); rules.experiencePerKill = 100; rules.levelThresholds[0] = 100;
  assert.deepEqual(xp.record([kill('one')]), { total: 11, level: 3, upgrades: [2, 3] });
  assert.deepEqual(xp.record([kill('one')]), { total: 11, level: 3, upgrades: [] });
  assert.throws(() => createExperience('run', { experiencePerKill: 0, levelThresholds: [1] }));
  assert.throws(() => createExperience('run', { experiencePerKill: 1, levelThresholds: [3, 3] }));
});
const offer: UpgradeOffer = { id: 'level-2', level: 2, cards: [
  { id: 'a', label: 'A', description: 'A effect', icon: 'doubleShot' },
  { id: 'b', label: 'B', description: 'B effect', icon: 'fireRate' },
  { id: 'c', label: 'C', description: 'C effect', icon: 'bulletWidth' },
] };
test('三选一候选保持不变，每级只领取一次，旧卡片不能消费新升级', () => {
  const choices = createUpgradeChoices(); const first = choices.open(offer);
  assert.ok(first); assert.equal(choices.open(offer), first);
  assert.equal(choices.open({ ...offer, id: 'next', level: 3 }), null);
  assert.equal(choices.select('stale', 'a'), null); assert.equal(choices.select(offer.id, 'unknown'), null);
  assert.equal(choices.select(offer.id, 'b')?.id, 'b'); assert.equal(choices.select(offer.id, 'a'), null);
  assert.equal(choices.open({ ...offer, id: 'same-level' }), null);
  assert.ok(choices.open({ ...offer, id: 'next', level: 3 }));
  assert.equal(choices.select(offer.id, 'a'), null);
  choices.dispose(); assert.equal(choices.select('next', 'a'), null);
});
test('候选少于三项或重复技能均拒绝，不暗自补齐技能池', () => {
  const choices = createUpgradeChoices();
  assert.throws(() => choices.open({ ...offer, cards: offer.cards.slice(0, 2) }));
  assert.throws(() => choices.open({ ...offer, cards: [offer.cards[0], offer.cards[0], offer.cards[1]] }));
  assert.equal(choices.current, null); assert.ok(choices.open(offer));
});
