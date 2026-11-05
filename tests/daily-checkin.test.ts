import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKIN_KEY, beijingDate, createDailyCheckin } from '../miniprogram/services/daily-checkin';
import { COIN_WALLET_KEY, createCoinWallet } from '../miniprogram/services/coin-wallet';
import { PET_STORE_KEY, createPetStore } from '../miniprogram/services/pet-store';

function setup(roll = 0) {
  const data = new Map<string, unknown>();
  let time = Date.parse('2026-11-05T10:00:00+08:00');
  let writes = 0; let failAt = Infinity; let randomCalls = 0;
  const storage = {
    getStorageSync(key: string) { return structuredClone(data.get(key)); },
    setStorageSync(key: string, value: unknown) { if (++writes === failAt) throw Error('disk'); data.set(key, structuredClone(value)); },
  };
  const coins = createCoinWallet(storage); const pets = createPetStore(storage);
  const rebuild = () => createDailyCheckin({storage, coins, pets, now: () => time, random: () => {randomCalls++; return roll;}});
  return {data, storage, coins, pets, rebuild, store: rebuild(),
    at(value: string) { time = Date.parse(value); },
    failAfter(count: number) { failAt = writes + count; },
    get randomCalls() {return randomCalls;}, get writes() {return writes;},
  };
}

test('按北京时间0点切日，未来奖励不生成；打开和重建不会重抽', () => {
  assert.equal(beijingDate(Date.parse('2026-11-05T15:59:59Z')), '2026-11-05');
  assert.equal(beijingDate(Date.parse('2026-11-05T16:00:00Z')), '2026-11-06');
  const f = setup(.41); const view = f.store.open();
  assert.equal(view.cards[0].kind, 'food');
  assert(view.cards.slice(1).every(c => c.status === 'future' && c.kind === '' && c.symbol === '?'));
  assert.deepEqual(f.rebuild().open(), view); assert.equal(f.randomCalls, 1);
  assert.equal(f.pets.view().food, 0, '仅打开不发奖');
});

test('四种奖励概率边界、数量正确，重复点击和重建不重复发放', () => {
  for (const [roll, kind] of [[0,'coins'],[.3999,'coins'],[.4,'food'],[.6999,'food'],[.7,'soldier'],[.8999,'soldier'],[.9,'flag'],[.9999,'flag']] as const) {
    const f = setup(roll); const offered = f.store.open();
    assert.equal(offered.cards[0].kind, kind);
    assert.equal(f.store.claim(offered.date).claimed, true);
    assert.equal(f.rebuild().claim(offered.date).claimed, false);
    assert.equal(f.coins.balance(), kind === 'coins' ? 100 : 0);
    assert.equal(f.pets.view().food, kind === 'food' ? 3 : 0);
    assert.equal(f.pets.view().owned, false, '粮食不自动赠送宠物');
    const view = f.rebuild().open();
    assert.equal(view.soldiers, kind === 'soldier' ? 1 : 0);
    assert.equal(view.flags, kind === 'flag' ? 1 : 0);
  }
});

test('漏签不重置不补签，累计7次后下一日重新开始；已领第7天当天保持原周期', () => {
  const f = setup();
  for (let i = 0; i < 7; i++) {
    f.at(`2026-11-${String(5+i*2).padStart(2,'0')}T10:00:00+08:00`);
    const view = f.store.open(); assert.equal(view.day, i+1);
    const claimed = f.store.claim(view.date).view;
    assert.equal(claimed.day, i+1); assert.equal(claimed.cards.filter(c => c.status === 'claimed').length, i+1);
  }
  assert.equal(f.rebuild().open().day, 7);
  f.at('2026-11-20T10:00:00+08:00'); assert.equal(f.store.open().day, 1);
  assert.equal(f.coins.balance(), 700);
});

test('已展示未领取的奖励次日过期，旧卡不能领取新日奖励', () => {
  const f = setup(); const old = f.store.open();
  f.at('2026-11-06T00:00:00+08:00');
  const stale = f.store.claim(old.date);
  assert.equal(stale.claimed, false); assert.equal(stale.view.date, '2026-11-06'); assert.equal(stale.view.day, 1);
  assert.equal(f.coins.balance(), 0);
  f.store.claim(stale.view.date); assert.equal(f.coins.balance(), 100);
});

test('生成保存失败不展示未保存奖励，同进程重试不重抽', () => {
  const f = setup(.9); f.failAfter(1); assert.throws(() => f.store.open());
  assert.equal(f.data.has(CHECKIN_KEY), false);
  assert.equal(f.store.open().cards[0].kind, 'flag'); assert.equal(f.randomCalls, 1);
});

test('领取各写入阶段故障均可重建重试；奖励与凭据不会重复，未到账不显示已领取', () => {
  for (const roll of [0,.5,.8,.95]) {
    const steps = roll < .7 ? 3 : 2;
    for (let step = 1; step <= steps; step++) {
      const f = setup(roll); const view = f.store.open(); f.failAfter(step);
      assert.throws(() => f.store.claim(view.date));
      const stored = f.data.get(CHECKIN_KEY) as {entries: {status: string}[]};
      assert.notEqual(stored.entries[0].status, 'claimed');
      const retry = f.rebuild(); retry.open(); retry.claim(view.date);
      assert.equal(retry.open().claimed, true);
      assert.equal(f.coins.balance(), roll === 0 ? 100 : 0);
      assert.equal(f.pets.view().food, roll === .5 ? 3 : 0);
      assert.equal(retry.open().soldiers, roll === .8 ? 1 : 0);
      assert.equal(retry.open().flags, roll === .95 ? 1 : 0);
    }
  }
});

test('奖励已到账但签到记录写失败，跨日重开自动完成昨日事务，不冒领今日', () => {
  const f = setup(); const view = f.store.open(); f.failAfter(3);
  assert.throws(() => f.store.claim(view.date)); assert.equal(f.coins.balance(), 100);
  f.at('2026-11-06T10:00:00+08:00'); const restored = f.rebuild().open();
  assert.equal(restored.day, 2); assert.equal(restored.claimed, false); assert.equal(f.coins.balance(), 100);
});

test('金币签到凭据跨通关、武器升级保留；粮食跨宠物掉落与喂养保留', () => {
  const f = setup(); const receipt = 'checkin:2026-11-05';
  f.coins.rewardCheckin(receipt); f.coins.rewardVictory('stage-one', 1); f.coins.upgradeWeapon(1);
  const balance = f.coins.balance(); f.coins.rewardCheckin(receipt); assert.equal(f.coins.balance(), balance);
  f.pets.rewardCheckin(receipt); f.pets.rewardBoss('s', 's:wave:1:boss'); f.pets.feed(f.pets.view().revision);
  f.pets.rewardCheckin(receipt); assert.equal(f.pets.view().food, 2);
  assert.equal(f.pets.view().owned, true);
});

test('损坏存档不覆盖，旧金币/宠物存档兼容，倒拨日期不重复发奖', () => {
  const f = setup();
  f.data.set(COIN_WALLET_KEY, {version:1,balance:20,rewardedSessions:[]});
  f.pets.rewardBoss('s','s:wave:1:boss'); const legacyPet = structuredClone(f.data.get(PET_STORE_KEY));
  const v = f.store.open(); f.store.claim(v.date); assert.equal(f.coins.balance(), 120);
  assert.deepEqual(f.data.get(PET_STORE_KEY), legacyPet);
  f.at('2026-11-04T10:00:00+08:00'); assert.throws(() => f.store.open()); assert.equal(f.coins.balance(), 120);
  const corrupt = {version:1,entries:[{date:'2026-11-05',kind:'unknown',status:'offered'}],soldiers:0,flags:0};
  f.data.set(CHECKIN_KEY, corrupt); assert.throws(() => f.store.open()); assert.deepEqual(f.data.get(CHECKIN_KEY), corrupt);
});
