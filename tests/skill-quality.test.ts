import test from 'node:test';
import assert from 'node:assert/strict';
import { applySkillReward, rollUpgradeCandidates, skillsFromLegacy, SKILL_IDS, SKILL_QUALITIES, upgradeQualityWeights } from '../miniprogram/fortress/skill-quality';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';

test('旧状态区分未拥有与一级，超出旧等级上限收敛至五级', () => {
  assert.deepEqual(skillsFromLegacy({doubleShot:0,fireRate:1,bulletWidth:3,flame:9}), {fireRate:{level:1,quality:'crude'},bulletWidth:{level:3,quality:'crude'},flame:{level:5,quality:'crude'}});
});
test('重复技能成长至五级，品质只升不降，满级仍能升品质', () => {
  let skills: SkillCollection = {};
  skills=applySkillReward(skills,{id:'homing',quality:'elite'});
  for(let i=0;i<10;i++) skills=applySkillReward(skills,{id:'homing',quality:'crude'});
  assert.deepEqual(skills.homing,{level:5,quality:'elite'});
  const before=skills;assert.equal(applySkillReward(skills,{id:'homing',quality:'rare'}),before);
  skills=applySkillReward(skills,{id:'homing',quality:'legendary'});
  assert.deepEqual(skills.homing,{level:5,quality:'legendary'});assert.deepEqual(before.homing,{level:5,quality:'elite'});
});
test('各人物等级区间的独立品质概率边界准确且技能不重复', () => {
  for(const level of [2,5,6,10,11,15,16,20]) {
    const weights=upgradeQualityWeights(level);
    const counts=[0,0,0];
    for(let sample=0;sample<100;sample++) {
      let calls=0;
      const cards=rollUpgradeCandidates({},level,{hp:100,maxHp:100},()=>calls++<7 ? .999 : (sample+.5)/100);
      assert.equal(cards.length,3);assert.equal(new Set(cards.map(c=>c.id)).size,3);
      for(const card of cards) {assert.notEqual(card.id,'repair');if('quality' in card) counts[SKILL_QUALITIES.findIndex(q=>q.id===card.quality)]++;}
    }
    assert.deepEqual(counts,weights.map(n=>n*3));
  }
});
test('无成长项可跳过，满级仅较高品质可抽，修复无品质且严格低于半血', () => {
  const full: SkillCollection=Object.fromEntries(SKILL_IDS.map(id=>[id,{level:5,quality:'legendary'}]));
  assert.deepEqual(rollUpgradeCandidates(full,20,{hp:50,maxHp:100},()=>0),[]);
  assert.deepEqual(rollUpgradeCandidates(full,20,{hp:49,maxHp:100},()=>0),[{id:'repair'}]);
  assert.deepEqual(rollUpgradeCandidates(full,20,{hp:0,maxHp:100},()=>0),[]);
  const one: SkillCollection={...full,flame:{level:5,quality:'fine'}};
  assert.deepEqual(rollUpgradeCandidates(one,2,{hp:100,maxHp:100},()=>0),[{id:'flame',quality:'rare'}]);
  const two: SkillCollection={...one,frost:{level:4,quality:'legendary'}};
  assert.equal(rollUpgradeCandidates(two,20,{hp:100,maxHp:100},()=>.5).length,2);
});
test('不接受非法随机源或非升级等级',()=>{
  assert.throws(()=>rollUpgradeCandidates({},1,{hp:1,maxHp:1},()=>0));
  assert.throws(()=>rollUpgradeCandidates({},2,{hp:1,maxHp:1},()=>1));
});
