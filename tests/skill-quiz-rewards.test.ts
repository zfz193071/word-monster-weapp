import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createUpgradeChoices} from '../miniprogram/fortress/upgrade-choice';
import {qualitySkillOffer,bossSkillOffer} from '../miniprogram/fortress/quality-skills';
import {createSeededRandom} from '../miniprogram/fortress/plans';
for(const source of ['level','elite','legendary'] as const)for(const correct of [false,true])test(`${source}答题后领取${correct?2:1}个不同技能，原候选品质保留，重复/旧事件无效`,()=>{
 const c=createUpgradeChoices();const offer=source==='level'?qualitySkillOffer('quiz',2,{}, {hp:20,maxHp:100},createSeededRandom(14)):bossSkillOffer('quiz',source,{},createSeededRandom(14));
 c.open(offer,true);assert.equal(c.select(offer.id,offer.cards[0].id),null);assert(!c.answer('stale',true));
 assert(c.answer(offer.id,correct));assert(!c.answer(offer.id,!correct));assert.equal(c.remaining,correct?2:1);
 const first=c.select(offer.id,offer.cards[0].id)!;assert.equal(first.quality,offer.cards[0].quality);
 assert.equal(c.select(offer.id,first.id),null);
 if(correct){const second=c.current!;assert.equal(second.cards.length,offer.cards.length-1);assert(!second.cards.some(card=>card.id===first.id));assert.equal(c.select(second.id,first.id),null);assert(!c.answer(second.id,true));assert(c.select(second.id,second.cards[0].id));}
 assert.equal(c.current,null);assert.equal(c.remaining,0);assert.equal(c.open(offer,true),null);c.dispose();assert(!c.answer(offer.id,true));
});
test('候选只有一个时答对也只能领取一个，未答题销毁不可领取',()=>{
 const base=qualitySkillOffer('one',2,{}, {hp:100,maxHp:100},createSeededRandom(4));const offer={...base,cards:base.cards.slice(0,1)};
 const c=createUpgradeChoices();c.open(offer,true);c.answer(offer.id,true);assert.equal(c.remaining,1);assert(c.select(offer.id,offer.cards[0].id));assert.equal(c.current,null);
 const disposed=createUpgradeChoices();disposed.open(offer,true);disposed.dispose();assert(!disposed.answer(offer.id,true));assert.equal(disposed.select(offer.id,offer.cards[0].id),null);
});
