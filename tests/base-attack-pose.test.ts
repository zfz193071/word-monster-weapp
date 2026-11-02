import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseAttackPose } from '../miniprogram/fortress/base-attack-pose';
import { createCombat, stepCombat } from '../miniprogram/fortress/combat';
import { createSessionPlan } from '../miniprogram/fortress/plans';

test('普通及动物攻击动作只在真实攻击后出现冲击，预备动作不提前扣血',()=>{
 for(const interval of [2000,1500]) {
  const initial=createCombat({plan:createSessionPlan('pose',()=>.5),waveIndex:0,combatId:'pose',generation:0,baseHp:5,playerX:24,monsterHitbox:{x:-20,y:-20,width:40,height:40},skills:{doubleShot:0,fireRate:0,bulletWidth:0}});
  const monster={...initial.monsters[0],status:'attackingBase' as const,position:{x:300,y:448},attackIntervalMs:interval,attackRemainingMs:10};
  assert.equal(baseAttackPose(monster).impact,0);
  const result=stepCombat({...initial,monsters:[monster]});
  assert(result.events.some(e=>e.type==='baseDamaged'));
  assert.equal(baseAttackPose(result.state.monsters[0]).impact,1);
  assert.equal(baseAttackPose({...monster,hp:0}).lunge,0);
  assert.deepEqual(baseAttackPose({...monster,status:'waiting'}),{lunge:0,impact:0});
 }
});
