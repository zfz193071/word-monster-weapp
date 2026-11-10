import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';
import { drawEnemyType, armoredDamage } from '../miniprogram/fortress/enemy-types';
import { FORTRESS_RULES as R } from '../miniprogram/fortress/rules';

test('introduction waves and deterministic independent mixing preserve word and arrival identities',()=>{
 for(const [wave,type] of [[4,'runner'],[7,'armored'],[10,'flying'],[13,'exploder'],[16,'giant']] as const){
  assert.equal(drawEnemyType(wave,true,()=>.99),type);
  const a=createOpeningEncounter('types','apple',1,wave-1),b=createOpeningEncounter('types','apple',1,wave-1);
  assert.deepEqual(a,b);assert.equal(a.monsters[0].enemyType,type);
  assert(a.monsters.every(m=>m.wordId==='apple'));
 }
 assert.equal(armoredDamage('armored',5,true),3);assert.equal(armoredDamage('armored',5,false),5);
});
test('exploder warning freezes, explodes only once, gives no kill/drop reward',()=>{
 const initial=createOpeningEncounter('explode','apple',1);
 let state={...initial,shotRemainingMs:100000,projectiles:[],monsters:[{...initial.monsters[0],enemyType:'exploder' as const,status:'attackingBase' as const,
  position:{x:180,y:R.monster.attackY},hp:100,maxHp:100,attackDamage:10,explosionRemainingMs:1000,frozenUntilTick:50,dropCoins:20}]};
 for(let i=0;i<50;i++)state=stepCombat(state).state as typeof state;
 assert.equal(state.monsters[0].explosionRemainingMs,1000);
 for(let i=0;i<99;i++)state=stepCombat(state).state as typeof state;
 assert.equal(state.base.hp,initial.base.hp);
 const result=stepCombat(state);assert.equal(result.state.base.hp,initial.base.hp-10);
 assert.equal(result.events.filter(e=>e.type==='monsterDefeated'||e.type==='coinsDropped').length,0);
 assert.equal(result.state.status,'cleared');assert.deepEqual(stepCombat(result.state).events,[]);
});
test('air enemies bypass ground allies; Boss attacks defense directly',()=>{
 const initial=createOpeningEncounter('targets','apple',1);
 for(const enemy of [{enemyType:'flying' as const},{boss:true}] ){
 const state={...initial,shotRemainingMs:100000,monsters:[{...initial.monsters[0],...enemy,status:'attackingBase' as const,position:{x:180,y:R.monster.attackY},attackRemainingMs:0}],
 supportSoldiers:[{id:'rifle',slot:0,position:{x:150,y:500},hp:30,maxHp:30,attackRemainingMs:10000}]};
 const result=stepCombat(state).state;assert.equal(result.supportSoldiers![0].hp,30);assert(result.base.hp<state.base.hp);
 }
});
