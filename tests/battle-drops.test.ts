import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { createBattleDrops } from '../miniprogram/services/battle-drops';
import type { CombatEvent } from '../miniprogram/fortress/types';

test('掉落原子保存、同局50上限、Boss不足额度截断、重建去重且通关武器不覆盖凭据', () => {
  let saved: unknown = { version: 1, balance: 200, rewardedSessions: [] };
  const storage = { getStorageSync: () => structuredClone(saved), setStorageSync: (_: string, value: unknown) => { saved = structuredClone(value); } };
  const wallet = createCoinWallet(storage);
  for (let index = 0; index < 47; index++) assert.equal(wallet.rewardDrop('run', 1, `run:wave:1:zombie:${index}`, 1).added, 1);
  assert.deepEqual(wallet.rewardDrop('run', 1, 'run:wave:10:zombie:21', 10), { balance: 250, added: 3, total: 50 });
  assert.equal(wallet.rewardDrop('run', 1, 'run:wave:11:zombie:1', 1).added, 0);
  assert.equal(wallet.upgradeWeapon(1).balance, 50);
  assert.equal(wallet.rewardVictory('run', 1).balance, 150);
  const restored = createCoinWallet(storage);
  assert.equal(restored.rewardDrop('run', 1, 'run:wave:10:zombie:21', 10).added, 0);
  assert.equal(restored.rewardDrop('next', 1, 'next:wave:1:zombie:1', 1).added, 1);
  assert.equal(restored.balance(), 151); assert.equal(restored.equipment().level, 2);
  assert.throws(() => restored.rewardDrop('locked', 3, 'locked:wave:1:zombie:1', 1));
  assert.throws(() => restored.rewardDrop('run', 1, 'other:wave:1:zombie:1', 1));
});

test('保存失败不显示到账或演出，保留原掉落重试；重复、其他会话及销毁后不加币', () => {
  let saved: unknown = ''; let fail = true; let effects = 0; let view = { total: 0, error: false };
  const wallet = createCoinWallet({ getStorageSync: () => saved, setStorageSync: (_k, v) => { if (fail) throw Error('disk'); saved = structuredClone(v); } });
  const controller = createBattleDrops({ sessionId: 'run', levelId: 1, wallet, onChange: value => { view = value; }, onAward: (_p, n) => { effects += n; } });
  const event: CombatEvent = { type: 'coinsDropped', context: { sessionId: 'run', combatId: 'battle', waveId: 'wave', generation: 0 }, tick: 1, monsterId: 'run:wave:1:zombie:1', amount: 1, position: { x: 100, y: 200 } };
  controller.handle([event]); assert.deepEqual(view, { total: 0, error: true }); assert.equal(effects, 0); assert.equal(wallet.balance(), 0);
  controller.handle([event]); fail = false; controller.retry(); controller.retry(); controller.handle([event]);
  assert.deepEqual(view, { total: 1, error: false }); assert.equal(effects, 1); assert.equal(wallet.balance(), 1);
  controller.handle([{ ...event, context: { ...event.context, sessionId: 'other' } }]);
  controller.dispose(); controller.handle([{ ...event, monsterId: 'run:wave:2:zombie:1' }]); controller.retry();
  assert.equal(wallet.balance(), 1); assert.equal(effects, 1);
});

test('损坏掉落记录不能被普通领奖覆盖', () => {
  const bad = { version: 1, balance: 20, rewardedSessions: [], drops: [{ sessionId: 'run', levelId: 1, receipts: [{ monsterId: 'run:wave:1:zombie:1', amount: -1 }] }] };
  let writes = 0; const wallet = createCoinWallet({ getStorageSync: () => bad, setStorageSync: () => { writes++; } });
  assert.throws(() => wallet.rewardVictory('new')); assert.throws(() => wallet.rewardDrop('run', 1, 'run:wave:1:zombie:2', 1)); assert.equal(writes, 0);
});
