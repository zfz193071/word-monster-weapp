import test from 'node:test';
import assert from 'node:assert/strict';
import { enemyType, soldierType, enemyLayer, soldierLayer, soldierCapability, targetable, validateSoldierIdentity } from '../miniprogram/fortress/army';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';

test('legacy identities default without changing word IDs; invalid species and Boss combinations fail', () => {
  assert.equal(enemyType(), 'normal'); assert.equal(soldierType(), 'rifle');
  assert.throws(() => enemyType('unknown' as never));
  assert.throws(() => enemyLayer({enemyType:'flying',boss:true}));
  assert.throws(() => validateSoldierIdentity({soldierType:'tank',source:'inventory'} as never));
  const monster = createOpeningEncounter('contract','apple',1).monsters[0];
  for (const status of ['waiting','defeated','retiring'] as const) assert.equal(targetable({...monster,status,hp:10}),false);
  assert.equal(targetable({...monster,status:'alive',enemyType:'flying'},'ground'),false);
  assert.equal(targetable({...monster,status:'alive',enemyType:'flying'}),true);
  assert.equal(monster.wordId,'apple');
});
test('six soldier target capabilities follow approved ground/air matrix', () => {
  for(const type of ['rifle','shield','flamethrower','rocket','jetpack','tank'] as const) {
    assert.equal(soldierLayer({soldierType:type}),type==='jetpack'?'air':'ground');
    assert.equal(soldierCapability({soldierType:type}),['shield','flamethrower','tank'].includes(type)?'ground':'both');
  }
});
test('projectile layer contract survives overlapping air and ground targets', () => {
  const initial=createOpeningEncounter('layers','apple',1);
  const monster={...initial.monsters[0],status:'alive' as const,position:{x:180,y:200},hp:100,maxHp:100};
  const state={...initial,shotRemainingMs:10000,monsters:[{...monster,id:'air',enemyType:'flying' as const},{...monster,id:'ground'}],projectiles:[{
    id:'test',position:{x:180,y:200},previousPosition:{x:180,y:200},width:8,height:8,damage:7,capability:'ground' as const,
  }]};
  const result=stepCombat(state);
  assert.equal(result.state.monsters[0].hp,100);assert.equal(result.state.monsters[1].hp,93);
});
