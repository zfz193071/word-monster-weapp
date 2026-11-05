import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpeningEncounter, OPENING_EXPERIENCE } from '../miniprogram/fortress/opening-encounter';
import { getLevel } from '../miniprogram/fortress/levels';
import { SKILL_IDS } from '../miniprogram/fortress/skill-quality';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';
import { qualityEffects, skillLevels } from '../miniprogram/fortress/quality-skills';
import { attachCombatPet, stepCombat } from '../miniprogram/fortress/combat';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { createExperience } from '../miniprogram/fortress/experience';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { createBattleDrops } from '../miniprogram/services/battle-drops';
import type { CombatState } from '../miniprogram/fortress/types';

test('90秒逻辑长局：123怪、全传说满级、宠物援军并发，实体有界且最终经验金币只结算一次',t=>{
 const skills=Object.freeze(Object.fromEntries(SKILL_IDS.map(id=>[id,Object.freeze({level:5,quality:'legendary'})]))) as SkillCollection;
 const initial=createOpeningEncounter('soak',getLevel(8).words[0].id,1,18,skillLevels(skills),undefined,[],8,7,[],'nightmare',skills);
 let state:CombatState=attachCombatPet({...initial,monsterSpeed:0,monsters:initial.monsters.map((m,i)=>({...m,spawnAtMs:0,status:'alive',position:{x:145+(i%7)*10,y:180+Math.floor(i/7)*3},hp:10000000,maxHp:10000000,dropCoins:m.boss?0:3})),supportSoldiers:[0,1,2].map(slot=>({id:`soldier-${slot}`,slot,hp:30,maxHp:30,position:{x:140+slot*40,y:510},attackRemainingMs:2000}))},{level:10,equipped:[],attackRemainingMs:2000});
 assert.equal(state.monsters.length,123);assert.equal(qualityEffects(skills).count,8);assert.equal(qualityEffects(skills).intervalMs,160);
 let saved:unknown={version:1,balance:0,rewardedSessions:[],completedLevels:[1,2,3,4,5,6,7]};
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_k,v)=>{saved=structuredClone(v);}});const grand=state.monsters.find(m=>m.bossKind==='grand')!;
 let awards=0;const drops=createBattleDrops({sessionId:'soak',levelId:8,difficulty:'nightmare',grandBosses:{[grand.id]:grand.position},wallet,onChange(){},onAward(_p,n){awards+=n;}});
 const xp=createExperience('soak',OPENING_EXPERIENCE);const kinds=new Set<string>();let projectiles=0,impacts=0,burning=0;
 const deaths=new Set<string>();
 function advance(){const result=stepCombat(state);state=result.state;xp.record(result.events);xp.record(result.events);drops.handle(result.events);drops.handle(result.events);
  for(const event of result.events){if(event.type==='monsterDamaged')kinds.add(event.kind);if(event.type==='monsterDefeated'){assert(!deaths.has(event.monsterId));deaths.add(event.monsterId);}}
  projectiles=Math.max(projectiles,state.projectiles.length);impacts=Math.max(impacts,state.elementImpacts?.length??0);burning=Math.max(burning,state.monsters.filter(m=>m.burn).length);
  assert(state.projectiles.length<=208);assert((state.elementImpacts?.length??0)<=16);assert.equal(state.monsters.length,123);
  assert(state.projectiles.every(p=>(p.expiresAtTick??0)>state.tick&&(p.hitMonsterIds?.length??0)<=2));
 }
 for(let tick=0;tick<9000;tick++)advance();
 assert.equal(state.status,'fighting');assert.equal(xp.view.total,0);assert.equal(wallet.balance(),0);assert(burning>0);for(const kind of ['projectile','flame','lightning','soldier','pet'])assert(kinds.has(kind));
 const runner=new CombatRunner(state);runner.frame(0);runner.pause();runner.frame(60000);assert.equal(runner.snapshot,state);runner.resume(60000,2);runner.frame(60010);assert.equal(runner.snapshot!.tick,9001);runner.dispose();assert.equal(runner.frame(70000).events.length,0);
 state={...state,monsters:state.monsters.map(m=>({...m,hp:1}))};for(let tick=0;tick<3000&&state.status==='fighting';tick++)advance();
 assert.equal(state.status,'cleared');assert.equal(deaths.size,123);assert.equal(xp.view.total,984);assert.equal(wallet.balance(),210);assert.equal(awards,210);
 assert.equal(stepCombat(state).events.length,0);assert.equal(wallet.rewardGrandBoss('soak',8,'nightmare').added,0);drops.dispose();xp.dispose();
 t.diagnostic(`逻辑90秒：弹体峰值${projectiles}/208，瞬时特效峰值${impacts}/16，灼烧实体峰值${burning}/123；非设备FPS测试`);
});
