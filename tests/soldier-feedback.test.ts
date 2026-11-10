import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat, reviveCompanion } from '../miniprogram/fortress/combat';
import { drawSoldier, drawFallenSoldier } from '../miniprogram/fortress/soldier-art';
import { SOLDIER_TYPES } from '../miniprogram/fortress/army';
import { FORTRESS_RULES as R } from '../miniprogram/fortress/rules';
import type { SupportSoldierState } from '../miniprogram/fortress/types';

const unit: SupportSoldierState = {id:'feedback',slot:0,hp:30,maxHp:30,position:{x:180,y:R.arena.baseTop},attackRemainingMs:10000};
test('ordinary ground/air attacks stamp six soldier types only when actually damaged; revive clears feedback', () => {
  for (const soldierType of SOLDIER_TYPES) for (const hp of [30, 1]) {
    const initial = createOpeningEncounter(`feedback-${soldierType}-${hp}`, 'apple', 1);
    const result = stepCombat({...initial,shotRemainingMs:10000,supportSoldiers:[{...unit,soldierType,hp}],
      monsters:[{...initial.monsters[0],hp:1000,maxHp:1000,enemyType:soldierType==='jetpack'?'flying':'normal',status:'attackingBase',attackRemainingMs:0,attackDamage:10}]});
    const soldier = (hp === 1 ? result.state.fallenSoldiers : result.state.supportSoldiers)![0];
    assert.equal(soldier.lastHitTick, result.state.tick);
    assert.equal(soldier.hitCombatId, initial.context.combatId);
    assert.equal(result.events.filter(e=>e.type==='supportSoldierDamaged').length,1);
    const next = stepCombat(result.state).state;
    assert.equal((hp===1?next.fallenSoldiers:next.supportSoldiers)![0].lastHitTick,result.state.tick,'no new attack must not restart feedback');
    if (hp === 1) {
      const revived = reviveCompanion(result.state,'soldier',unit.id)!.supportSoldiers![0];
      assert.equal(revived.lastHitTick,undefined); assert.equal(revived.hitCombatId,undefined);
      assert.equal(revived.hp,30);
    }
  }
});
test('explosion stamps ground damage/death once and leaves airborne feedback untouched', () => {
  const initial=createOpeningEncounter('explosion-feedback','apple',1);
  const result=stepCombat({...initial,base:{...initial.base,hp:1000,maxHp:1000},shotRemainingMs:10000,supportSoldiers:[{...unit,source:'skill',hp:1},{...unit,source:'skill',id:'survivor',slot:1},{...unit,source:'skill',id:'air',slot:2,soldierType:'jetpack'}],
    monsters:[{...initial.monsters[0],hp:1000,maxHp:1000,enemyType:'exploder',position:{...unit.position},status:'attackingBase',explosionRemainingMs:0,attackDamage:10}]});
  assert.equal(result.state.fallenSoldiers![0].lastHitTick,result.state.tick);
  assert.equal(result.state.supportSoldiers!.find(s=>s.id==='survivor')!.lastHitTick,result.state.tick);
  assert.equal(result.state.supportSoldiers!.find(s=>s.id==='air')!.lastHitTick,undefined);
  assert.equal(result.events.filter(e=>e.type==='supportSoldierDefeated').length,1);
});
test('six rendered feedback types freeze on pause, expire and never replay in another combat', () => {
  const commands: unknown[][]=[];
  const context=new Proxy({}, {get:(_,name)=>(...args:unknown[])=>commands.push([name,...args]),set:(_,name,value)=>{commands.push(['set',name,value]);return true;}}) as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
  const image={} as WechatMiniprogram.Image;
  for(const soldierType of SOLDIER_TYPES) {
    const soldier={...unit,soldierType,hp:20,lastHitTick:100,hitCombatId:'battle',lastShotTick:100,shotCombatId:'battle',shotTarget:{x:180,y:100}};
    const draw=(tick:number,combatId='battle',fallen=false)=>{commands.length=0;(fallen?drawFallenSoldier:drawSoldier)(context,{...soldier,hp:fallen?0:20},tick,combatId,image);return commands.map(c=>[...c]);};
    const hit=draw(100);assert.ok(hit.some(c=>c[0]==='set'&&c[2]==='#f2ad72'));
    assert.deepEqual(draw(100),hit);
    for(const [tick,id] of [[99,'battle'],[118,'battle'],[100,'other']] as const)assert.ok(!draw(tick,id).some(c=>c[0]==='set'&&c[2]==='#f2ad72'));
    const fallen=draw(118,'battle',true);
    assert.ok(fallen.some(c=>c[0]==='drawImage'));
    assert.ok(fallen.some(c=>c[0]==='set'&&c[1]==='globalAlpha'&&c[2]===.5));
    assert.ok(!fallen.some(c=>c[0]==='set'&&c[2]==='#fff0a8'),'a killed firing unit must not flash');
    assert.deepEqual(draw(118,'battle',true),fallen);
    assert.deepEqual(draw(136,'battle',true),[]);
    assert.deepEqual(draw(99,'battle',true),[]);
    assert.deepEqual(draw(118,'other',true),[]);
  }
});
