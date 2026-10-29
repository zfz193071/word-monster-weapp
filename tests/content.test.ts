import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTENT_ASSETS } from '../miniprogram/content/assets';
import { FRUIT_LEVEL } from '../miniprogram/content/levels';
import { WORDS } from '../miniprogram/content/words';
import { assertValidContent, ContentValidationError, validateContent, validateRounds } from '../miniprogram/content/validation';
import { createRounds } from '../miniprogram/game/rounds';
import type { Round } from '../miniprogram/game/types';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const generate = (seed = 7) => createRounds(WORDS, FRUIT_LEVEL, CONTENT_ASSETS, seededRandom(seed));

test('确认词表与资源清单结构有效，五词各对应图片和音频引用', () => {
  assert.deepEqual(validateContent(WORDS, FRUIT_LEVEL, CONTENT_ASSETS), []);
  assert.equal(CONTENT_ASSETS.length, 10);
});

test('100 个确定性种子下三阶段题数、词覆盖和选项均满足规则', () => {
  const positions = { practice: new Set<number>(), boss: new Set<number>() };
  const orders = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const rounds = generate(seed);
    assert.equal(rounds.length, 15);
    assert.deepEqual(rounds.slice(0, 5).map((round) => round.targetWordId), FRUIT_LEVEL.wordIds);
    assert.deepEqual(validateRounds(rounds, FRUIT_LEVEL), []);
    for (const phase of ['practice', 'boss'] as const) {
      const block = rounds.filter((round) => round.phase === phase);
      assert.equal(block.length, 5);
      assert.deepEqual([...block.map((round) => round.targetWordId)].sort(), [...FRUIT_LEVEL.wordIds].sort());
      for (const round of block) {
        assert.equal(round.optionWordIds.length, phase === 'practice' ? 2 : 3);
        assert.equal(new Set(round.optionWordIds).size, round.optionWordIds.length);
        assert.equal(round.optionWordIds.filter((id) => id === round.targetWordId).length, 1);
        positions[phase].add(round.optionWordIds.indexOf(round.targetWordId));
      }
    }
    orders.add(rounds.slice(5, 10).map((round) => round.targetWordId).join(','));
  }
  assert.deepEqual([...positions.practice].sort(), [0, 1]);
  assert.deepEqual([...positions.boss].sort(), [0, 1, 2]);
  assert.ok(orders.size > 1, '辨词词序不能固定');
});

test('相同种子可复现且生成过程不修改共享配置；轮次与选项冻结', () => {
  const before = JSON.stringify({ WORDS, FRUIT_LEVEL, CONTENT_ASSETS });
  const a = generate(41);
  assert.deepEqual(a, generate(41));
  assert.equal(JSON.stringify({ WORDS, FRUIT_LEVEL, CONTENT_ASSETS }), before);
  assert.ok(Object.isFrozen(a));
  assert.ok(a.every((round) => Object.isFrozen(round) && Object.isFrozen(round.optionWordIds)));
});

test('随机源无效时拒绝生成，不产出损坏的选项', () => {
  for (const value of [-0.01, 1, NaN, Infinity]) {
    assert.throws(() => createRounds(WORDS, FRUIT_LEVEL, CONTENT_ASSETS, () => value), RangeError);
  }
});

test('未知词、重复词和错误版本提供可定位的错误', () => {
  const unknown = { ...FRUIT_LEVEL, wordIds: [...FRUIT_LEVEL.wordIds.slice(0, 4), 'pear'] };
  assert.ok(validateContent(WORDS, unknown, CONTENT_ASSETS).some((issue) => issue.path === 'level.wordIds[4]'));
  assert.throws(() => createRounds(WORDS, unknown, CONTENT_ASSETS), ContentValidationError);
  assert.ok(validateContent([WORDS[0], WORDS[0], ...WORDS.slice(2)], FRUIT_LEVEL, CONTENT_ASSETS)
    .some((issue) => issue.path === 'words[1].id'));
  assert.ok(validateContent(WORDS, { ...FRUIT_LEVEL, contentVersion: 99 }, CONTENT_ASSETS)
    .some((issue) => issue.path === 'level.contentVersion'));
});

test('缺失、重复、错配及非本地资源引用均被拒绝', () => {
  assert.throws(() => assertValidContent(WORDS, FRUIT_LEVEL, CONTENT_ASSETS.slice(1)), /words\[0\].imagePath/);
  assert.throws(() => assertValidContent(WORDS, FRUIT_LEVEL, [...CONTENT_ASSETS, CONTENT_ASSETS[0]]), /资源路径重复/);
  const wrongOwner = CONTENT_ASSETS.map((asset, index) => index ? asset : { ...asset, wordId: 'banana' });
  assert.throws(() => assertValidContent(WORDS, FRUIT_LEVEL, wrongOwner), /资源类型或所属词条不匹配/);
  const remote = WORDS.map((word, index) => index ? word : { ...word, imagePath: 'https://example.com/apple.png' });
  assert.throws(() => assertValidContent(remote, FRUIT_LEVEL, CONTENT_ASSETS), /本地资源/);
  const wrongType = CONTENT_ASSETS.map((asset, index) => index ? asset : { ...asset, kind: 'audio' as const });
  assert.throws(() => assertValidContent(WORDS, FRUIT_LEVEL, wrongType), /资源类型/);
});

test('阶段顺序、选项数及洗牌策略不符时拒绝配置', () => {
  const phases = [...FRUIT_LEVEL.phases].reverse();
  assert.throws(() => assertValidContent(WORDS, { ...FRUIT_LEVEL, phases }, CONTENT_ASSETS), /阶段顺序/);
  const badOptions = FRUIT_LEVEL.phases.map((phase) => ({ ...phase, optionCount: 5 }));
  assert.throws(() => assertValidContent(WORDS, { ...FRUIT_LEVEL, phases: badOptions }, CONTENT_ASSETS), /选项数/);
  const badShuffle = FRUIT_LEVEL.phases.map((phase) => ({ ...phase, shuffleWords: true }));
  assert.throws(() => assertValidContent(WORDS, { ...FRUIT_LEVEL, phases: badShuffle }, CONTENT_ASSETS), /初遇固定/);
});

test('重复选项、缺少正确目标、多个正确目标和未知选项可定位到轮次', () => {
  const rounds = generate();
  const target = rounds[5].targetWordId;
  const others = FRUIT_LEVEL.wordIds.filter((id) => id !== target);
  const replace = (options: readonly string[]) => rounds.map((round, index) => index === 5
    ? { ...round, optionWordIds: options } : round);
  for (const options of [[target, target], [others[0], others[1]], [target, 'pear']]) {
    const issues = validateRounds(replace(options), FRUIT_LEVEL);
    assert.ok(issues.some((issue) => issue.path.startsWith('rounds[5].optionWordIds')));
  }
  assert.ok(validateRounds(replace([target, target]), FRUIT_LEVEL).some((issue) => issue.message === '选项不得重复'));
  assert.ok(validateRounds(replace([others[0], others[1]]), FRUIT_LEVEL).some((issue) => issue.message.includes('正确目标')));
});

test('缺题、重复题、阶段混排、目标不存在和初遇词序变化均被拒绝', () => {
  const rounds = generate();
  const variants: readonly (readonly Round[])[] = [
    rounds.slice(1),
    rounds.map((round, index) => index === 6 ? rounds[5] : round),
    rounds.map((round, index) => index === 5 ? { ...round, phase: 'boss' } : round),
    rounds.map((round, index) => index === 5 ? { ...round, targetWordId: 'pear' } : round),
    [rounds[1], rounds[0], ...rounds.slice(2)],
  ];
  for (const variant of variants) assert.ok(validateRounds(variant, FRUIT_LEVEL).length > 0);
});
