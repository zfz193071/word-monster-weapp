import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as opening from '../miniprogram/fortress/opening-encounter';
import * as experience from '../miniprogram/fortress/experience';
import * as upgrades from '../miniprogram/fortress/upgrade-choice';
import * as fruits from '../miniprogram/fortress/fruit-catalog';
import * as content from '../miniprogram/fortress/content';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import type { CombatState, CombatEvent, SkillLevels } from '../miniprogram/fortress/types';

test('组件19波：先等全部退场读词，再技能/下一题，每级三选一，20级选完结算', async () => {
  const plan=createOpeningPlan('component-run',createSeededRandom(12));let definition:any;let host:any;
  let audioOptions:any;let busy=false;let current:FakeScene;
  class FakeScene {
    snapshot:CombatState; options:any; disposed=false;
    constructor(_node:unknown,options:any){this.options=options;this.snapshot=options.initial;current=this;}
    async load(){this.options.onHud({hp:this.snapshot.base.hp,maxHp:5,status:this.snapshot.status});return true;}
    dispose(){this.disposed=true;}setPaused(){}setRetiringIds(){}captureFrame(){return 'frame';}
    applySkills(levels:SkillLevels){this.snapshot={...this.snapshot,skills:levels};}
    clear(){const events:CombatEvent[]=this.snapshot.monsters.map(m=>({type:'monsterDefeated',context:this.snapshot.context,tick:1,monsterId:m.id,wordId:m.wordId}));this.snapshot={...this.snapshot,status:'cleared'};this.options.onHud({hp:this.snapshot.base.hp,maxHp:5,status:'cleared'});this.options.onEvents(events);}
  }
  const source=readFileSync(new URL('../miniprogram/components/fortress-scene/fortress-scene.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports:{},Component(value:any){definition=value;},wx:{getWindowInfo(){return{pixelRatio:1};}},
    require(name:string){
      if(name.endsWith('/opening-encounter'))return opening;
      if(name.endsWith('/experience'))return experience;
      if(name.endsWith('/upgrade-choice'))return upgrades;
      if(name.endsWith('/fruit-catalog'))return fruits;
      if(name.endsWith('/content'))return content;
      if(name.endsWith('/canvas-scene'))return{CanvasScene:FakeScene};
      if(name.endsWith('/battle-audio'))return{createBattleAudio(options:any){audioOptions=options;return{get busy(){return busy;},get view(){return{retiringIds:[]};},setActive(){},setVolume(){},dispose(){},handle(events:CombatEvent[]){busy=events.some(e=>e.type==='monsterDefeated');},retry(){}};}};
      return{};
    },
  });
  host={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,musicVolume:22,previewRequest:{plan,generation:1}},
    setData(patch:any,done?:()=>void){Object.assign(this.data,patch);done?.();},triggerEvent(){},
    createSelectorQuery(){return{select(){return{fields(_fields:any,callback:Function){return{exec(){callback({node:{},width:360,height:560,left:0});}};}};}};},
  };
  for(const [name,method]of Object.entries(definition.methods))host[name]=(method as Function).bind(host);
  definition.lifetimes.attached.call(host);definition.lifetimes.ready.call(host);await Promise.resolve();
  let picked=0;
  for(let wave=0;wave<19;wave++){
    assert.equal(host.data.waveNumber,wave+1);assert.equal(current!.snapshot.monsters.length,3+wave*2);
    const art=current!.options.art;assert.ok(current!.snapshot.monsters.every(m=>art.fruitHats[m.wordId]));
    current!.clear();assert.equal(host.data.level,wave+2);assert.equal(host.data.upgradeOffer,null);assert.equal(host.data.waveRequest,null);
    assert.equal(host.data.completed,false);host.advanceWave();assert.equal(host.data.completed,false);
    busy=false;audioOptions.onDrained();
    {const offer=host.data.upgradeOffer;assert.ok(offer);assert.equal(offer.cards.length,3);assert.equal(host.data.waveRequest,null);picked++;host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});}
    if(wave<18){const request=host.data.waveRequest;assert.equal(request.waveIndex,wave+1);assert.ok(current!.disposed);
      const target=plan.waves[wave+1];host.nextWave({detail:{context:{sessionId:plan.sessionId,waveId:target.waveId,generation:request.generation},attempts:[{correct:true}]}});await Promise.resolve();
    }else{assert.equal(host.data.completed,true);assert.equal(host.data.frozenFrame,'frame');assert.equal(host.data.victoryFruits.length,11);assert.equal(host.data.waveRequest,null);}
  }
  assert.equal(picked,19);assert.equal(host.data.level,20);assert.equal(host.data.experience,3990);definition.lifetimes.detached.call(host);
});
