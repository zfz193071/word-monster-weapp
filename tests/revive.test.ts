import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDailyCheckin,CHECKIN_KEY} from '../miniprogram/services/daily-checkin';
import {createBattlePet} from '../miniprogram/pets/battle';
import {createOpeningEncounter} from '../miniprogram/fortress/opening-encounter';
import {stepCombat,summonSupportSoldier,reviveCompanion} from '../miniprogram/fortress/combat';
import {CombatRunner} from '../miniprogram/fortress/combat-runner';
const initial=()=>createOpeningEncounter('revive','apple',1);
function defeated(){
 const state=summonSupportSoldier(initial(),'guard')!;
 return stepCombat({...state,automatic:false,shotRemainingMs:100000,pet:createBattlePet({level:4,equipped:['hat']},400),monsters:[0,1].map(i=>({...state.monsters[0],id:`enemy-${i}`,hp:10000,maxHp:10000,status:'attackingBase',attackRemainingMs:0,attackDamage:999}))}).state;
}
test('士兵与宠物死亡可分别满血复活、冷却重计、原身份和装备保留，重放不重复复活',()=>{
 const dead=defeated();assert.equal(dead.fallenSoldiers?.length,1);assert.equal(dead.pet?.hp,0);
 const pet=reviveCompanion(dead,'pet','thunder-fox')!;assert.equal(pet.pet?.hp,160);assert.equal(pet.pet?.attackRemainingMs,2000);assert.equal(pet.pet?.defeatedPosition,undefined);assert.deepEqual(pet.pet?.equipped,['hat']);assert.equal(reviveCompanion(pet,'pet','thunder-fox'),null);
 const restored=reviveCompanion(pet,'soldier','guard')!;assert.equal(restored.supportSoldiers?.[0].hp,30);assert.equal(restored.supportSoldiers?.[0].attackRemainingMs,2000);assert.equal(restored.fallenSoldiers?.length,0);assert.equal(reviveCompanion(restored,'soldier','guard'),null);
 const deadAgain=stepCombat({...restored,monsters:restored.monsters.map(m=>({...m,attackRemainingMs:0}))}).state;assert.equal(deadAgain.pet?.hp,0);assert.equal(deadAgain.fallenSoldiers?.length,1,'没有无敌保护，可再次战死');
 let full=dead;for(let i=0;i<3;i++)full=summonSupportSoldier(full,`other-${i}`)!;assert.equal(reviveCompanion(full,'soldier','guard'),null);assert(reviveCompanion(full,'pet','thunder-fox'));
 const failed=stepCombat({...dead,base:{...dead.base,hp:1},monsters:dead.monsters.map(m=>({...m,attackRemainingMs:0}))}).state;assert.equal(failed.status,'baseDestroyed');assert.equal(failed.fallenSoldiers?.length,0);assert.equal(reviveCompanion(failed,'pet','thunder-fox'),null);
});
test('旗帜旧库存兼容、版本去重，保存失败无复活，暂停选择时才能消费，退出与结算拒绝',()=>{
 let value:any={version:1,entries:[],soldiers:4,flags:3},fail=false;
 const store=createDailyCheckin({storage:{getStorageSync:()=>structuredClone(value),setStorageSync:(_k,v)=>{if(fail)throw Error('disk');value=structuredClone(v);}},coins:{rewardCheckin(){}},pets:{rewardCheckin(){}}});
 assert.deepEqual(store.flagInventory(),{count:3,revision:0});const runner=new CombatRunner(defeated());const debit=()=>store.consumeFlag(0);
 assert.equal(runner.revive('pet','thunder-fox',debit),false);runner.pause();const before=runner.snapshot;
 fail=true;assert.throws(()=>runner.revive('pet','thunder-fox',debit));assert.equal(runner.snapshot,before);assert.equal(store.flagInventory().count,3);
 fail=false;assert(runner.revive('pet','thunder-fox',debit));assert.equal(store.flagInventory().count,2);assert.equal(runner.revive('soldier','guard',debit),false,'旧库存版本不能复用');
 assert(runner.revive('soldier','guard',()=>store.consumeFlag(1)));assert.equal(value.soldiers,4);assert.deepEqual(value.entries,[]);assert.equal(value.flags,1);
 runner.dispose();assert.equal(runner.revive('pet','thunder-fox',()=>{throw Error('不扣旗');}),false);
 for(const status of ['cleared','baseDestroyed'] as const){const ended=new CombatRunner({...defeated(),status});ended.pause();assert.equal(ended.revive('pet','thunder-fox',()=>{throw Error('不扣旗');}),false);}
 assert.equal(CHECKIN_KEY,'word-monster:daily-checkin:v1');
});
