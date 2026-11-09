import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKIN_KEY, createDailyCheckin } from '../miniprogram/services/daily-checkin';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { createPetStore } from '../miniprogram/services/pet-store';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { stepCombat, summonSupportSoldier } from '../miniprogram/fortress/combat';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { weaponForLevel } from '../miniprogram/weapons/catalog';

function stock() {
  const saved = new Map<string, unknown>(); let failing = false;
  const storage = {getStorageSync: (key: string) => structuredClone(saved.get(key)), setStorageSync(key: string, value: unknown) {if(failing)throw Error('disk');saved.set(key,structuredClone(value));}};
  const coins = createCoinWallet(storage); const pets = createPetStore(storage);
  let day = 1;
  const rebuild = () => createDailyCheckin({storage,coins,pets,now:()=>Date.parse(`2026-11-${String(day).padStart(2,'0')}T10:00:00+08:00`),random:()=>.8});
  const store = rebuild();
  for (; day <= 5; day++) {const view=store.open();store.claim(view.date);}
  return {store,rebuild,saved,setFail(value: boolean) {failing=value;}};
}
const initial = () => createOpeningEncounter('summon','apple',1);

test('每次召唤扣1库存，最多3名；旧版本事件、重复ID、满员均不扣款', () => {
  const f=stock(); const runner=new CombatRunner(initial());
  const first=f.store.soldierInventory();
  assert.equal(runner.summonSoldier('summon:1',()=>f.store.consumeSoldier(first.revision)),true);
  assert.equal(runner.summonSoldier('summon:1',()=>{throw Error('不应扣款');}),false);
  assert.equal(runner.summonSoldier('stale',()=>f.store.consumeSoldier(first.revision)),false);
  for(let i=2;i<=3;i++) assert(runner.summonSoldier(`summon:${i}`,()=>f.store.consumeSoldier(f.store.soldierInventory().revision)));
  assert.equal(runner.summonSoldier('four',()=>{throw Error('满员不能扣款');}),false);
  assert.equal(f.rebuild().soldierInventory().count,2);
  assert.equal(runner.snapshot!.supportSoldiers!.length,3);
  assert(runner.snapshot!.supportSoldiers!.every(s=>s.hp===30&&s.maxHp===30&&s.attackRemainingMs===2000));
});

test('保存失败不召唤不消耗；暂停、结算、销毁不扣库存，未用库存跨重建保存', () => {
  const f=stock();const runner=new CombatRunner(initial());const before=runner.snapshot;
  const debit=()=>f.store.consumeSoldier(f.store.soldierInventory().revision);
  f.setFail(true);assert.throws(()=>runner.summonSoldier('failed',debit));assert.equal(runner.snapshot,before);assert.equal(f.store.soldierInventory().count,5);
  f.setFail(false);runner.pause();assert.equal(runner.summonSoldier('paused',debit),false);runner.resume(0,2);
  assert(runner.summonSoldier('success',debit));runner.dispose();assert.equal(runner.summonSoldier('disposed',debit),false);
  for(const status of ['cleared','baseDestroyed'] as const) assert.equal(new CombatRunner({...initial(),status}).summonSoldier(status,debit),false);
  assert.equal(f.rebuild().soldierInventory().count,4);
  assert.equal(new CombatRunner(initial()).snapshot!.supportSoldiers!.length,0,'退出重开不携带已消耗士兵');
});

test('旧签到库存兼容，读取库存不生成签到奖励，其他库存/日期状态不丢失', () => {
  const f=stock();const saved=f.saved.get(CHECKIN_KEY) as any;delete saved.soldierRevision;saved.flags=7;f.saved.set(CHECKIN_KEY,saved);
  const before=structuredClone(saved.entries);assert.deepEqual(f.store.soldierInventory(),{count:5,revision:0});
  assert(f.store.consumeSoldier(0));assert.equal(f.store.consumeSoldier(0),false);
  const after=f.saved.get(CHECKIN_KEY) as any;assert.equal(after.flags,7);assert.deepEqual(after.entries,before);
});

test('召唤不治疗已有援军，空位重排不重叠，受伤与冷却跨轮保留', () => {
  const one=summonSupportSoldier(initial(),'iron-support')!;
  const injured={...one,supportSoldiers:one.supportSoldiers!.map(s=>({...s,slot:2,hp:9,attackRemainingMs:630}))};
  const two=summonSupportSoldier(injured,'checkin-support')!;
  assert.equal(two.supportSoldiers![0].id,'iron-support');assert.equal(two.supportSoldiers![0].hp,9);assert.equal(two.supportSoldiers![0].attackRemainingMs,630);
  assert.notDeepEqual(two.supportSoldiers![0].position,two.supportSoldiers![1].position);
  const next=createOpeningEncounter('summon','banana',2,1,undefined,two.base.hp,['apple'],1,1,two.supportSoldiers);
  assert.deepEqual(next.supportSoldiers,two.supportSoldiers);
  const third=summonSupportSoldier(two,'third')!;assert.equal(summonSupportSoldier(third,'fourth'),null);
});

test('签到士兵每2秒使用当前武器伤害，替堡垒挡普通近战，战死删除且不返还库存', () => {
  const f=stock();const base=createOpeningEncounter('summon','apple',1,0,undefined,undefined,[],1,3);
  const runner=new CombatRunner(base);assert(runner.summonSoldier('signed',()=>f.store.consumeSoldier(f.store.soldierInventory().revision)));
  const state=runner.snapshot!;const target={...state.monsters[0],hp:10000,maxHp:10000,status:'alive' as const,spawnAtMs:0,position:{x:180,y:200}};
  let combat={...state,automatic:false,shotRemainingMs:1e8,monsterSpeed:0,monsters:[target],projectiles:[]};
  for(let i=0;i<199;i++)combat=stepCombat(combat).state;
  assert.equal(combat.monsters[0].hp,10000);
  const attack=stepCombat(combat);assert.equal(attack.state.monsters[0].hp,10000-weaponForLevel(3).damage);assert.equal(attack.state.supportSoldiers![0].attackRemainingMs,2000);
  assert.equal(attack.state.supportSoldiers![0].lastShotTick, attack.state.tick);
  assert.deepEqual(attack.state.supportSoldiers![0].shotTarget, target.position);
  assert.equal(attack.state.supportSoldiers![0].shotCombatId, state.context.combatId);
  assert(Object.isFrozen(attack.state.supportSoldiers![0].shotTarget));
  const hurt=stepCombat({...attack.state,monsters:[{...target,status:'attackingBase',attackRemainingMs:0,attackDamage:20}]});
  assert.equal(hurt.state.supportSoldiers![0].hp,10);assert.equal(hurt.state.base.hp,state.base.hp);
  const dead=stepCombat({...hurt.state,monsters:hurt.state.monsters.map(m=>({...m,attackRemainingMs:0}))});
  assert.equal(dead.state.supportSoldiers!.length,0);assert(dead.events.some(e=>e.type==='supportSoldierDefeated'&&e.soldierId==='signed'));
  assert.equal(f.rebuild().soldierInventory().count,4);
});
