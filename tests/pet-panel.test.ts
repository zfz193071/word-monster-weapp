import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createPlayerStorage} from '../miniprogram/services/player-storage';
import {createPetStore} from '../miniprogram/services/pet-store';
import {createCoinWallet} from '../miniprogram/services/coin-wallet';
import {createPetUpgrade} from '../miniprogram/services/pet-upgrade';
function fixture() {
 const values=new Map<string,unknown>();
 const storage=createPlayerStorage({getStorageSync:(key:string)=>values.get(key),setStorageSync:(key:string,value:unknown)=>{values.set(key,structuredClone(value));}});
 const pets=createPetStore(storage), coins=createCoinWallet(storage), upgrade=createPetUpgrade(storage);
 pets.rewardBoss('panel','panel:wave:1:zombie:1');pets.rewardCheckin('checkin:2026-11-09');coins.rewardVictory('panel',1);
 let definition:any, sequence=0;const timers=new Map<number,()=>void>();
 runInNewContext(ts.transpileModule(readFileSync(new URL('../miniprogram/pages/home/home.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:{},Page(value:any){definition=value;},setTimeout(callback:()=>void){timers.set(++sequence,callback);return sequence;},clearTimeout(id:number){timers.delete(id);},
  require(name:string){if(name.endsWith('/pet-store'))return {petStore:pets};if(name.endsWith('/pet-upgrade'))return {petUpgrade:upgrade};if(name.endsWith('/coin-wallet'))return {coinWallet:coins};if(name.endsWith('/levels'))return {LEVELS:[]};if(name.endsWith('/collection'))return {collectionWords:()=>[]};return {};},
 });
 const host={...definition,data:{...definition.data,homeVisible:true},setData(patch:object){Object.assign(this.data,patch);}};
 host.openPet();
 return {host,pets,coins,timers,tap(action:string,revision=pets.view().revision){host.petAction({currentTarget:{dataset:{action,revision}}});}};
}
test('宠物仅真实升级庆祝，喂养跨级也触发，旧版本点击不重复扣费',()=>{
 const f=fixture();f.tap('feed');assert.equal(f.host.data.petCelebrating,false);
 f.tap('feed');assert.equal(f.host.data.petCelebrating,true);assert.equal(f.pets.view().level,2);
 f.host.dismissPetCelebration();const revision=f.pets.view().revision;
 f.coins.rewardVictory('more',2);f.tap('upgrade');assert.equal(f.host.data.petCelebrating,true);
 const balance=f.coins.balance();f.tap('upgrade',revision);assert.equal(f.host.data.petCelebrating,false);assert.equal(f.coins.balance(),balance);assert.equal(f.timers.size,0);
});
test('庆祝支持跳过、关闭、后台和卸载清理，重开收起详情',()=>{
 for(const finish of ['dismissPetCelebration','closePet','onHide','onUnload']){
  const f=fixture();f.tap('upgrade');assert.equal(f.host.data.petCelebrating,true);assert.equal(f.timers.size,1);
  f.host[finish]();assert.equal(f.host.data.petCelebrating,false);assert.equal(f.timers.size,0);
 }
 const f=fixture();f.host.togglePetDetails();assert.equal(f.host.data.petDetails,true);f.host.closePet();f.host.openPet();assert.equal(f.host.data.petDetails,false);
 f.tap('upgrade');const callback=[...f.timers.values()][0];callback();assert.equal(f.host.data.petCelebrating,false);
});
