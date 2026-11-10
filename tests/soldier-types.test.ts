import test from 'node:test';
import assert from 'node:assert/strict';
import { soldierStats, soldierTargets, receivedSoldierDamage } from '../miniprogram/fortress/soldier-types';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { reviveCompanion, stepCombat } from '../miniprogram/fortress/combat';
import type { SoldierType } from '../miniprogram/fortress/army';
import type { SupportSoldierState } from '../miniprogram/fortress/types';
const unit=(type:SoldierType, evolved=false):SupportSoldierState=>{
 const skill={level:evolved?5:1,quality:evolved?'elite' as const:'crude' as const}, stats=soldierStats(type,skill,10);
 return {id:type,slot:0,source:'skill',soldierType:type,skill,evolved:stats.evolved,hp:stats.maxHp,maxHp:stats.maxHp,position:{x:180,y:450},attackRemainingMs:0};
};
test('six bases and evolved stats use approved growth without upgrading old inventory rifles',()=>{
 const expected={rifle:[30,10,2000],shield:[60,10,2500],flamethrower:[30,20,2000],rocket:[30,40,3000],jetpack:[25,10,1500],tank:[90,50,4000]};
 for(const type of Object.keys(expected) as SoldierType[]){const s=soldierStats(type,{level:1,quality:'crude'},10);assert.deepEqual([s.maxHp,s.damage,s.interval],expected[type]);}
 assert.equal(soldierStats('tank',{level:5,quality:'elite'},10).maxHp,300);
 assert.equal(soldierStats('jetpack',{level:5,quality:'elite'},10).interval,1000);
 assert.equal(receivedSoldierDamage(unit('shield'),11),8);assert.equal(receivedSoldierDamage(unit('shield',true),11),6);
});
test('rocket blast stays on target layer, flame fan excludes rear/air, rifle evolution fires twice',()=>{
 const base=createOpeningEncounter('troops','apple',1).monsters[0];
 const monsters=[{...base,id:'front',status:'alive' as const,position:{x:180,y:400}},
 {...base,id:'air',status:'alive' as const,enemyType:'flying' as const,position:{x:180,y:400}},
 {...base,id:'rear',status:'alive' as const,position:{x:180,y:480}}];
 assert.deepEqual(soldierTargets(unit('rocket'),monsters,10),[2]);
 assert.deepEqual(soldierTargets(unit('flamethrower'),monsters.slice(0,2),10),[0]);
 assert.deepEqual(soldierTargets(unit('rifle',true),monsters.slice(0,2),10),[0,0]);
 const sameLayer=[monsters[0],monsters[1],{...monsters[0],id:'near',position:{x:185,y:400}}];
 assert.deepEqual(soldierTargets(unit('rocket'),sameLayer,10),[0,2]);
});
test('revival keeps original type, skill, evolution, source and restores full attack interval',()=>{
 const initial=createOpeningEncounter('revive-tank','apple',1),tank=unit('tank',true);
 const result=reviveCompanion({...initial,fallenSoldiers:[{...tank,hp:0}]},'soldier',tank.id)!;
 const restored=result.supportSoldiers![0];assert.equal(restored.soldierType,'tank');assert.equal(restored.source,'skill');assert.equal(restored.evolved,true);
 assert.equal(restored.hp,tank.maxHp);assert.equal(restored.attackRemainingMs,4000);assert.equal(result.fallenSoldiers!.length,0);
});
test('shield takes ordinary enemy aggro before lower-slot rifle and applies reduction once',()=>{
 const initial=createOpeningEncounter('shield','apple',1),shield={...unit('shield'),slot:1,attackRemainingMs:10000};
 const state={...initial,shotRemainingMs:10000,monsters:[{...initial.monsters[0],status:'attackingBase' as const,attackRemainingMs:0,attackDamage:10}],supportSoldiers:[{...unit('rifle'),attackRemainingMs:10000},shield]};
 const result=stepCombat(state).state;assert.equal(result.supportSoldiers![0].hp,30);assert.equal(result.supportSoldiers![1].hp,53);assert.equal(result.base.hp,state.base.hp);
});

test('soldier hit attribution preserves all six identities and caps effective damage at remaining hp', () => {
 for (const type of ['rifle', 'shield', 'flamethrower', 'rocket', 'jetpack', 'tank'] as const) {
  const initial = createOpeningEncounter(`attribution-${type}`, 'apple', 1);
  const result = stepCombat({ ...initial, shotRemainingMs: 10000,
   monsters: [{ ...initial.monsters[0], hp: 1, status: 'alive', position: { x: 180, y: 420 } }],
   supportSoldiers: [unit(type, true)] });
  const hits = result.events.filter(event => event.type === 'monsterDamaged');
  assert.equal(hits.length, 1, 'evolved double shot cannot damage an already defeated enemy');
  assert.equal(hits[0].kind, 'soldier');
  assert.deepEqual(hits[0].soldier, { id: type, type, source: 'skill', effectiveDamage: 1 });
  assert.ok(hits[0].damage > 1);
  assert.equal(result.events.filter(event => event.type === 'monsterDefeated').length, 1);
 }
});

test('armored hits report post-mitigation contribution and preserve legacy soldier identity', () => {
 const initial = createOpeningEncounter('attribution-armor', 'apple', 1);
 for (const source of [undefined, 'inventory', 'boss'] as const) {
  const result = stepCombat({ ...initial, shotRemainingMs: 10000,
   monsters: [{ ...initial.monsters[0], hp: 100, maxHp: 100, enemyType: 'armored', status: 'alive', position: { x: 180, y: 420 } }],
   supportSoldiers: [{ id: 'legacy-rifle', slot: 0, source, hp: 30, maxHp: 30, position: { x: 180, y: 450 }, attackRemainingMs: 0 }] });
  const hit = result.events.find(event => event.type === 'monsterDamaged');
  assert.ok(hit && hit.type === 'monsterDamaged');
  assert.equal(hit.damage, 5);
  assert.deepEqual(hit.soldier, { id: 'legacy-rifle', type: 'rifle', source, effectiveDamage: 5 });
  assert.equal(hit.hp, 95);
 }
});
