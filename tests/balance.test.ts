import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createOpeningPlan} from '../miniprogram/fortress/opening-plan';
import {createStageInvasion} from '../miniprogram/fortress/stage-invasion';
import {createSeededRandom} from '../miniprogram/fortress/plans';
import {stepCombat} from '../miniprogram/fortress/combat';
import {qualitySkillOffer} from '../miniprogram/fortress/quality-skills';

test('简单第一关前3次升级至少提供一个输出选项，保留品质和三项去重',()=>{
 for(let seed=1;seed<=100;seed++)for(const level of [2,3,4]){
  const offer=qualitySkillOffer('beginner',level,{}, {hp:1000,maxHp:1000},createSeededRandom(seed),{difficulty:'easy',levelId:1});
  assert.equal(offer.cards.length,3);assert.equal(new Set(offer.cards.map(c=>c.id)).size,3);
  assert(offer.cards.some(c=>c.id==='doubleShot'||c.id==='fireRate'));
  assert(offer.cards.every(c=>['crude','fine','rare'].includes(c.quality!)));
 }
 for(const plan of [{difficulty:'normal',levelId:1},{difficulty:'easy',levelId:2}] as const){
  assert.deepEqual(qualitySkillOffer('normal',2,{}, {hp:100,maxHp:100},createSeededRandom(11),plan),qualitySkillOffer('normal',2,{}, {hp:100,maxHp:100},createSeededRandom(11)));
 }
});

test('噩梦18只封顶，击杀只补空位且不追赶补发，跨轮不能绕过上限',()=>{
 const initial=createStageInvasion(createOpeningPlan('cap',createSeededRandom(1),8,7,'nightmare'),1);
 const all=[...initial.monsters,...initial.incomingMonsters!];
 let state={...initial,monsters:all.slice(0,18).map(m=>({...m,status:'alive' as const,spawnAtMs:0})),incomingMonsters:all.slice(18),tick:30000,automatic:false,shotRemainingMs:1e9,monsterSpeed:0};
 const full=stepCombat(state).state;assert.equal(full.monsters.length,18);assert.equal(full.incomingMonsters!.length,all.length-18);
 const dead={...state.monsters[0],hp:0,status:'defeated' as const};
 const released=stepCombat({...full,monsters:[dead,...full.monsters.slice(1)],defeatedMonsterIds:[dead.id]}).state;
 assert.equal(released.monsters.filter(m=>m.hp>0).length,18);assert.equal(released.incomingMonsters!.length,all.length-19);
 assert.equal(stepCombat(released).state.incomingMonsters!.length,released.incomingMonsters!.length);
});

test('保底不重新提供已满级且品质无法再提升的技能',()=>{
 const max={level:5,quality:'legendary'} as const;
 for(let seed=1;seed<=20;seed++){
  const offer=qualitySkillOffer('max',2,{doubleShot:max,fireRate:max},{hp:100,maxHp:100},createSeededRandom(seed),{difficulty:'easy',levelId:1});
  assert.equal(offer.cards.length,3);
  assert(offer.cards.every(c=>c.id!=='doubleShot'&&c.id!=='fireRate'));
 }
});
