import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningEncounter, openingSkillOffer, ZERO_SKILLS } from '../miniprogram/fortress/opening-encounter';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { createUpgradeChoices } from '../miniprogram/fortress/upgrade-choice';

test('修复仅低于50%进入随机池，三选一且不保证出现，重复打开不重抽',()=>{
 let yes=0,no=0;
 for(let seed=0;seed<100;seed++){
  const session=`repair-${seed}`;
  for(const hp of [0,25,30,50]) assert(!openingSkillOffer(session,2,ZERO_SKILLS,{hp,maxHp:50}).cards.some(c=>c.id==='repair'));
  const offer=openingSkillOffer(session,2,ZERO_SKILLS,{hp:20,maxHp:50});
  assert.equal(offer.cards.length,3);assert.equal(new Set(offer.cards.map(c=>c.id)).size,3);
  if(offer.cards.some(c=>c.id==='repair'))yes++;else no++;
  assert.deepEqual(offer,openingSkillOffer(session,2,ZERO_SKILLS,{hp:20,maxHp:50}));
 }
 assert(yes>0 && no>0);
});
test('清波选择修复恢复满血且不增加武器等级，重复消费被拒绝，不复活失败基地',()=>{
 const initial=createOpeningEncounter('repair','apple',0,0,ZERO_SKILLS,20);
 const runner=new CombatRunner({...initial,status:'cleared'});
 const choices=createUpgradeChoices();choices.open({id:'repair-offer',level:2,cards:[{id:'repair',icon:'repair',label:'修复',description:'恢复满血'}]});
 assert(choices.select('repair-offer','repair'));runner.restoreBase();assert.equal(runner.snapshot!.base.hp,50);assert.deepEqual(runner.snapshot!.skills,ZERO_SKILLS);
 assert.equal(choices.select('repair-offer','repair'),null);runner.restoreBase();assert.equal(runner.snapshot!.base.hp,50);
 const failed=new CombatRunner({...initial,status:'baseDestroyed',base:{...initial.base,hp:0}});failed.restoreBase();assert.equal(failed.snapshot!.base.hp,0);
 const fighting=new CombatRunner(initial);fighting.restoreBase();assert.equal(fighting.snapshot!.base.hp,20);
 runner.dispose();runner.restoreBase();assert.equal(runner.snapshot,null);
});
