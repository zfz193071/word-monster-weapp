import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPetStore, petBossReward } from '../miniprogram/services/pet-store';
import { createPetDrops } from '../miniprogram/services/pet-drops';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
function harness() {
  let saved: unknown; let fail = false;
  const store = createPetStore({ getStorageSync: () => saved, setStorageSync: (_k, value) => { if (fail) throw Error('disk'); saved = structuredClone(value); } });
  return { store, get saved() { return saved; }, set saved(value) { saved = value; }, set fail(value: boolean) { fail = value; } };
}
function idFor(kind: ReturnType<typeof petBossReward>, prefix: string) {
  for(let i=0;i<10000;i++){const id=`${prefix}:wave:1:zombie:${i}`;if(petBossReward(id)===kind)return id;}
  throw Error('missing reward');
}
test('首次Boss必得小雷狐，固定额外奖励互斥、重复装备转粮、同怪幂等和存储失败可重试', () => {
  const h=harness(),s=h.store;
  assert.equal(s.view().owned,false);const first='run:wave:1:zombie:1';
  h.fail=true;assert.throws(()=>s.rewardBoss('run',first));assert.equal(s.view().owned,false);
  h.fail=false;assert.equal(s.rewardBoss('run',first),'小雷狐加入小屋！');assert.equal(s.view().food,0);
  assert.equal(s.rewardBoss('run',first),'');
  for(const kind of ['food','egg','collar','hat','charm'] as const){const id=idFor(kind,kind);assert.equal(petBossReward(id),kind);s.rewardBoss(kind,id);}
  assert.equal(s.view().food,3);assert.equal(s.view().eggs,1);assert.equal(s.view().equipment.length,3);
  s.rewardBoss('again',idFor('collar','again'));assert.equal(s.view().food,6);
  const before=structuredClone(h.saved);h.fail=true;assert.throws(()=>s.rewardBoss('retry',idFor('food','retry')));assert.deepEqual(h.saved,before);
  h.fail=false;s.rewardBoss('retry',idFor('food','retry'));assert.equal(s.view().food,9);s.rewardBoss('retry',idFor('food','retry'));assert.equal(s.view().food,9);
  const restored=createPetStore({getStorageSync:()=>h.saved,setStorageSync:()=>{}});assert.deepEqual(restored.view(),s.view(),'退出重建后库存与凭据保留');
});
test('喂粮成长、三级形态、10级停喂不扣粮，孵化转换和穿脱均保存后生效',()=>{
  const h=harness(),s=h.store;s.rewardBoss('first','first:wave:1:zombie:1');
  for(let i=0;i<40;i++)s.rewardBoss(`food-${i}`,idFor('food',`food-${i}`));
  let revision=s.view().revision;assert.equal(s.feed(revision),true);assert.equal(s.feed(revision),false,'旧按钮事件不重复扣粮');
  assert.equal(s.view().experience,10);s.feed(s.view().revision);assert.equal(s.view().level,2);
  while(s.view().level<4)s.feed(s.view().revision);assert.equal(s.view().stage,'少年');
  while(s.view().level<7)s.feed(s.view().revision);assert.equal(s.view().stage,'成年');
  while(s.view().level<10)s.feed(s.view().revision);assert.equal(s.view().food,30);assert.equal(s.view().experience,0);
  assert.equal(s.feed(s.view().revision),false);assert.equal(s.view().food,30);
  s.rewardBoss('egg',idFor('egg','egg'));revision=s.view().revision;assert.match(s.hatch(revision),/×10/);assert.equal(s.hatch(revision),'');assert.equal(s.view().food,40);assert.equal(s.view().eggs,0);
  assert.equal(s.toggleEquipment('hat',s.view().revision),false);
  s.rewardBoss('hat',idFor('hat','hat'));revision=s.view().revision;h.fail=true;assert.throws(()=>s.toggleEquipment('hat',revision));assert.deepEqual(s.view().equipped,[]);
  h.fail=false;s.toggleEquipment('hat',revision);assert.deepEqual(s.view().equipped,['hat']);assert.equal(s.toggleEquipment('hat',revision),false);
  s.toggleEquipment('hat',s.view().revision);assert.deepEqual(s.view().equipped,[]);
});
test('损坏宠物存档拒绝覆盖；奖励控制器只接收本局已计划Boss，失败后可重试、退出后停止',()=>{
  const h=harness();h.saved={version:1};assert.throws(()=>h.store.rewardBoss('a','a:wave:1:zombie:1'));assert.deepEqual(h.saved,{version:1});h.saved=undefined;
  const initial=createOpeningEncounter('run','apple',0);const boss=initial.monsters[0].id;
  const updates:unknown[]=[];const drops=createPetDrops({sessionId:'run',bossIds:[boss],store:h.store,onChange:(message,error)=>updates.push({message,error})});
  const event={type:'monsterDefeated' as const,context:initial.context,tick:1,monsterId:boss,wordId:'apple'};
  drops.handle([{...event,monsterId:initial.monsters[1].id},{...event,context:{...event.context,sessionId:'other'}}]);assert.equal(h.store.view().owned,false);
  h.fail=true;drops.handle([event,event]);assert.equal(h.store.view().owned,false);assert.deepEqual(updates.at(-1),{message:'宠物奖励未保存，点击重试',error:true});
  h.fail=false;drops.retry();assert.equal(h.store.view().owned,true);assert.equal(h.store.view().receipts.length,1);drops.handle([event]);assert.equal(updates.length,2);
  drops.dispose();drops.handle([event]);drops.retry();assert.equal(updates.length,2);
});
