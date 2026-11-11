import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DamageNumbers } from '../miniprogram/fortress/damage-numbers';
import type { CombatEvent } from '../miniprogram/fortress/types';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
const context = createOpeningEncounter('number-layout', 'apple', 0).context;
const measure = (text: string) => text.length * 10;
function hit(id: number, x = 180, y = 240): CombatEvent {
  return {type: 'monsterDamaged', context, tick: id, monsterId: `enemy-${id % 4}`,
    hp: 100, damage: id + 10, kind: id % 2 ? 'flame' : 'projectile', position: {x,y}};
}
function check(numbers: ReturnType<DamageNumbers['sample']>, width: number) {
  for (const [index, number] of numbers.entries()) {
    const half = (measure(number.text) + 3) * 1.18 / 2;
    assert.ok(number.position.x - half >= 0 && number.position.x + half <= width);
    assert.ok(number.position.y - 13 >= 0 && number.position.y + 13 <= 480);
    for (const other of numbers.slice(index + 1)) {
      const otherHalf = (measure(other.text) + 3) * 1.18 / 2;
      assert.ok(Math.abs(number.position.x - other.position.x) >= half + otherHalf
        || Math.abs(number.position.y - other.position.y) >= 26,
      `Overlapping ${number.text} and ${other.text}`);
    }
  }
}

test('相邻多个敌人的逐次伤害保持数值、数量、颜色，整个上浮过程不重叠', () => {
  for (const width of [360, 980]) for (const x of [4, width / 2, width - 4]) {
    const numbers = new DamageNumbers();
    const events = Array.from({length: 12}, (_, index) => hit(index, x + index % 3, 100));
    const original = JSON.stringify(events);
    numbers.add(events, 0, width, measure);
    for (const time of [0, 200, 799]) {
      const sampled = numbers.sample(time, width);
      assert.equal(sampled.length, events.length);
      assert.deepEqual(sampled.map(number => number.text), events.map((_, index) => `-${index + 10}`));
      check(sampled, width);
    }
    assert.equal(JSON.stringify(events), original);
    assert.equal(numbers.sample(800).length, 0);
  }
});

test('后续命中和其他数字到期不使已出现数字跳动，暂停重复采样稳定，缩放后重新避让', () => {
  const numbers = new DamageNumbers();
  numbers.add([hit(1),hit(2),hit(3)], 0, 980, measure);
  const before = numbers.sample(200, 980);
  numbers.add([hit(4),hit(5)], 200, 980, measure);
  assert.deepEqual(numbers.sample(200, 980).slice(0,3), before);
  const lateBefore = numbers.sample(799, 980).slice(3);
  const lateAfter = numbers.sample(800, 980);
  assert.equal(lateAfter.length, 2);
  for (let i=0;i<2;i++) {
    assert.equal(lateAfter[i].position.x, lateBefore[i].position.x);
    assert.ok(Math.abs(lateAfter[i].position.y - lateBefore[i].position.y + 30/800) < 1e-8);
  }
  assert.deepEqual(numbers.sample(800,980),lateAfter);
  numbers.resize(360/980); check(numbers.sample(800,360),360);
  assert.equal(numbers.sample(1000,360).length,0);
});

test('极密集时搜索有界但不合并或丢弃真实命中', () => {
  const numbers = new DamageNumbers();
  numbers.add(Array.from({length:100},(_,i)=>hit(i,180,100)),0,360,measure);
  assert.equal(numbers.sample(0).length,100);
  numbers.clear();assert.equal(numbers.active,false);
});
