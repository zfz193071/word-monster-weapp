import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SUPPORT_SOLDIERS } from '../miniprogram/fortress/army';
import { summonSupportSoldier } from '../miniprogram/fortress/combat';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { CHECKIN_KEY, createDailyCheckin, MAX_SOLDIER_INVENTORY } from '../miniprogram/services/daily-checkin';

test('小兵库存封顶100，战场最多召唤30名', () => {
  const values = new Map<string, unknown>([[CHECKIN_KEY, {version: 1, entries: [], soldiers: 99, flags: 0}]]);
  const storage = {getStorageSync: (key: string) => structuredClone(values.get(key)), setStorageSync: (key: string, value: unknown) => values.set(key, structuredClone(value))};
  const supplies = createDailyCheckin({storage, coins: {rewardCheckin() {}}, pets: {rewardCheckin() {}}});
  supplies.rewardClear('clear:cap', 5, 0);
  assert.equal(supplies.soldierInventory().count, MAX_SOLDIER_INVENTORY);

  let state = createOpeningEncounter('soldier-cap', 'apple', 1);
  for (let index = 0; index < MAX_SUPPORT_SOLDIERS; index++) state = summonSupportSoldier(state, `soldier-${index}`)!;
  assert.equal(state.supportSoldiers!.length, MAX_SUPPORT_SOLDIERS);
  assert.equal(summonSupportSoldier(state, 'soldier-over-cap'), null);
});
