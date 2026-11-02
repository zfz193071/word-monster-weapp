import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { createUpgradeHold } from '../miniprogram/weapons/upgrade-hold';
import { weaponForLevel } from '../miniprogram/weapons/catalog';

test('面板仅首指拥有长按，暂停/隐藏/关闭/移除均取消扣费且不自动续按',()=>{
 let definition:any, saved:unknown={version:1,balance:7000,rewardedSessions:[]}, time=0,id=0;
 const tasks=new Map<number,()=>void>();const events:string[]=[];
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_k,v)=>{saved=structuredClone(v);}});
 const source=readFileSync(new URL('../miniprogram/components/weapon-panel/weapon-panel.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:{},Component(value:any){definition=value;},
  require:(path:string)=>path.endsWith('coin-wallet')?{coinWallet:wallet}:path.endsWith('catalog')?{weaponForLevel}:{createUpgradeHold:(options:any)=>createUpgradeHold({...options,now:()=>time,schedule:(fn:()=>void)=>{tasks.set(++id,fn);return id;},cancel:(token:number)=>tasks.delete(token)})},
 });
 const host:any={properties:{paused:false},data:{},setData(patch:any){Object.assign(this.data,patch);},triggerEvent(name:string){events.push(name);}};
 for(const [key,method] of Object.entries(definition.methods))host[key]=(method as Function).bind(host);
 definition.lifetimes.attached.call(host);
 const start=(finger=1)=>host.startHold({touches:[{identifier:finger}]});
 const end=(finger=1)=>host.endHold({changedTouches:[{identifier:finger}]});
 const advance=()=>{time+=1000;const current=[...tasks.values()];tasks.clear();current.forEach(fn=>fn());};
 start();start(2);end(2);advance();assert.equal(wallet.equipment().level,2);end();advance();assert.equal(wallet.equipment().level,2);
 start();host.properties.paused=true;definition.properties.paused.observer.call(host);advance();assert.equal(wallet.equipment().level,2);
 host.properties.paused=false;definition.properties.paused.observer.call(host);advance();assert.equal(wallet.equipment().level,2);
 start();definition.pageLifetimes.hide.call(host);advance();definition.pageLifetimes.show.call(host);advance();assert.equal(wallet.equipment().level,2);
 start();host.close();advance();assert.equal(wallet.equipment().level,2);assert(events.includes('close'));
 start();const stale=[...tasks.values()][0];definition.lifetimes.detached.call(host);advance();stale();assert.equal(wallet.equipment().level,2);
});
