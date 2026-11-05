import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createDailyCheckin, beijingDate } from '../miniprogram/services/daily-checkin';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { createPetStore } from '../miniprogram/services/pet-store';

function fixture() {
  const saved = new Map<string, unknown>(); let fail = false; let time = Date.parse('2026-11-05T15:59:59Z');
  const storage = {getStorageSync: (key: string) => structuredClone(saved.get(key)), setStorageSync(key: string, value: unknown) {if(fail)throw Error('disk');saved.set(key,structuredClone(value));}};
  const coins = createCoinWallet(storage); const pets = createPetStore(storage);
  const daily = createDailyCheckin({storage, coins, pets, now: () => time, random: () => 0});
  const timers = new Map<number, () => void>(); let seq = 0; let definition: any;
  const source = readFileSync(new URL('../miniprogram/pages/home/home.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {
    exports: {}, Page(v: any) {definition = v;},
    setTimeout(callback: () => void) {timers.set(++seq, callback);return seq;}, clearTimeout(id: number) {timers.delete(id);},
    require(name: string) {
      if (name.endsWith('/daily-checkin')) return {dailyCheckin: daily, beijingDate};
      if (name.endsWith('/coin-wallet')) return {coinWallet: coins};
      if (name.endsWith('/pet-store')) return {petStore: pets};
      if (name.endsWith('/levels')) return {LEVELS: []};
      if (name.endsWith('/collection')) return {collectionWords: () => []};
      return {};
    },
  });
  const host = {...definition, data: {...definition.data, homeVisible: true}, setData(patch: object) {Object.assign(this.data,patch);}};
  return {host, coins, timers, setFail(v: boolean) {fail=v;}, nextDay() {time=Date.parse('2026-11-05T16:00:00Z');}, tap() {host.claimCheckin({currentTarget:{dataset:{date:host.data.checkinView.date}}});}};
}

test('首页打开签到、真实领取刷新余额；重复点击无重复到账，其他入口不能穿透', async () => {
  const f = fixture(); f.host.openCheckin();
  assert.equal(f.host.data.showCheckin,true); assert.equal(f.host.data.checkinView.claimed,false);
  for (const action of ['openDifficulty','openPet','openWeapon','toggleLevels','toggleCredits']) f.host[action]();
  await f.host.beginLevel(1);
  assert.equal(f.host.data.showDifficulty,false); assert.equal(f.host.data.showLevels,false); assert.equal(f.host.data.request,null);
  f.tap(); f.tap(); assert.equal(f.host.data.checkinView.claimed,true); assert.equal(f.host.data.coinBalance,100); assert.equal(f.coins.balance(),100);
  assert.equal(f.timers.size,1); f.host.closeCheckin(); assert.equal(f.timers.size,0); assert.equal(f.host.data.showCheckin,false);
});

test('签到保存失败显示重试，后台不能领取，回来刷新跨日资格，卸载清理定时器', () => {
  const f = fixture(); f.host.openCheckin(); f.setFail(true); f.tap();
  assert(f.host.data.checkinError); assert.equal(f.coins.balance(),0); assert.equal(f.host.data.checkinView.claimed,false);
  f.setFail(false); f.host.refreshCheckin(); assert.equal(f.host.data.checkinError,'');
  f.host.onHide(); assert.equal(f.timers.size,0); f.tap(); assert.equal(f.coins.balance(),0);
  f.nextDay(); f.host.data.homeVisible=true; f.host.refreshCheckin(); assert.equal(f.host.data.checkinView.date,'2026-11-06');
  f.tap(); assert.equal(f.coins.balance(),100);
  f.host.onUnload(); assert.equal(f.timers.size,0); assert.equal(f.host.disposed,true);
});

test('从已覆盖画布的素材弹框切入签到，保留就绪状态，不永久隐藏签到面板', () => {
  const f = fixture(); f.host.data.showCredits=true; f.host.data.sceneCoverReady=true;
  f.host.openCheckin(); assert.equal(f.host.data.showCredits,false); assert.equal(f.host.data.sceneCoverReady,true);
  f.host.closeCheckin();
});
