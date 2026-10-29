import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTENT_ASSETS } from '../miniprogram/content/assets';
import { FRUIT_LEVEL } from '../miniprogram/content/levels';
import { WORDS } from '../miniprogram/content/words';
import { createRounds } from '../miniprogram/game/rounds';
import { createSession, currentRound, eventContext, reduceGame } from '../miniprogram/game/engine';
import type { GameEffect, GameState } from '../miniprogram/game/engine';
import type { GameEvent } from '../miniprogram/game/types';

const rounds = createRounds(WORDS, FRUIT_LEVEL, CONTENT_ASSETS, () => 0.3);
const fresh = (id = 'session-1') => createSession(id, FRUIT_LEVEL, rounds);
type RoundInput =
  | { type: 'choose'; wordId: string }
  | { type: 'audioReady' | 'audioFailed' | 'replay' | 'retryAudio' }
  | { type: 'feedbackFinished' | 'upgradeFinished'; at: number };
const fire = (state: GameState, input: RoundInput) => reduceGame(state, { ...eventContext(state), ...input });
const start = (state = fresh()) => reduceGame(state, { type: 'start', sessionId: state.sessionId });
const readyToAnswer = (state = start().state) => fire(state, { type: 'audioReady' }).state;
const correct = (state: GameState) => fire(state, { type: 'choose', wordId: currentRound(state).targetWordId });
const wrong = (state: GameState) => fire(state, {
  type: 'choose', wordId: currentRound(state).optionWordIds.find((id) => id !== currentRound(state).targetWordId)!,
});
function next(state: GameState): GameState {
  const result = fire(correct(readyToAnswer(state)).state, { type: 'feedbackFinished', at: 1000 });
  return result.state.status === 'upgrade'
    ? fire(result.state, { type: 'upgradeFinished', at: 1001 }).state : result.state;
}
function atRound(index: number): GameState {
  let state = start().state;
  for (let i = 0; i < index; i++) state = next(state);
  return state;
}
function expectIgnored(state: GameState, event: GameEvent): void {
  const result = reduceGame(state, event);
  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
}

test('必须先开始并成功播放，才接受一次有效点击', () => {
  const initial = fresh();
  const early = { ...eventContext(initial), type: 'choose' as const, wordId: rounds[0].targetWordId };
  expectIgnored(initial, early);
  const presenting = start(initial);
  assert.equal(presenting.state.status, 'presenting');
  assert.equal(presenting.effects[0].type, 'playPrompt');
  expectIgnored(presenting.state, { ...early, ...eventContext(presenting.state) });
  const awaiting = readyToAnswer(presenting.state);
  const chosen = correct(awaiting);
  assert.equal(chosen.state.status, 'feedback');
  assert.equal(chosen.state.attempts.length, 1);
  assert.equal(chosen.effects[0].type, 'showFeedback');
  assert.equal(chosen.state.feedback?.phase, 'intro');
  assert.equal(chosen.state.energy, 0, '教学不获得能量');
});

test('非选项点击、错误会话/题目/序号和错误状态事件均无副作用', () => {
  const state = readyToAnswer();
  const valid = { ...eventContext(state), type: 'choose' as const, wordId: currentRound(state).targetWordId };
  for (const event of [
    { ...valid, wordId: 'pear' }, { ...valid, sessionId: 'session-old' },
    { ...valid, roundId: 'practice-apple' }, { ...valid, revision: state.revision - 1 },
    { ...eventContext(state), type: 'feedbackFinished' as const, at: 1 },
    { type: 'start' as const, sessionId: state.sessionId },
  ]) expectIgnored(state, event);
});

test('快速重复点击及动画结束回调只记录和推进一次', () => {
  const state = readyToAnswer(atRound(5));
  const click: GameEvent = { ...eventContext(state), type: 'choose', wordId: currentRound(state).targetWordId };
  const chosen = reduceGame(state, click);
  assert.equal(chosen.state.energy, 1);
  assert.equal(chosen.state.attempts.length, 6);
  expectIgnored(chosen.state, click);
  expectIgnored(chosen.state, { ...click, ...eventContext(chosen.state) });
  const done: GameEvent = { ...eventContext(chosen.state), type: 'feedbackFinished', at: 1234 };
  const advanced = reduceGame(chosen.state, done);
  assert.equal(advanced.state.roundIndex, 6);
  assert.equal(advanced.state.energy, 1);
  expectIgnored(advanced.state, done);
});

test('错误后保持同题同选项，第二次错后提示，提示后完成只奖励一次', () => {
  let state = readyToAnswer(atRound(5));
  const originalRound = currentRound(state);
  const firstWrong = wrong(state);
  assert.equal(firstWrong.state.energy, 0);
  assert.equal(firstWrong.state.hintUsed, false);
  assert.equal(firstWrong.state.feedback?.attemptIndex, 1);
  state = fire(firstWrong.state, { type: 'feedbackFinished', at: 100 }).state;
  assert.equal(state.status, 'presenting');
  assert.equal(state.replayCount, 1);
  assert.equal(currentRound(state), originalRound);
  state = wrong(readyToAnswer(state)).state;
  assert.equal(state.roundErrors, 2);
  assert.equal(state.hintUsed, true);
  assert.equal(state.feedback?.hintUsed, false, '第二次错误发生时提示尚未使用');
  state = readyToAnswer(fire(state, { type: 'feedbackFinished', at: 101 }).state);
  const chosen = correct(state);
  assert.equal(chosen.state.feedback?.attemptIndex, 3);
  assert.equal(chosen.state.feedback?.hintUsed, true);
  assert.equal(chosen.state.feedback?.replayCount, 2);
  assert.equal(chosen.state.energy, 1);
  assert.equal(currentRound(chosen.state), originalRound);
  state = fire(chosen.state, { type: 'feedbackFinished', at: 102 }).state;
  assert.equal(state.roundIndex, 6);
  assert.equal(state.roundErrors, 0);
  assert.equal(state.hintUsed, false);
  assert.equal(state.replayCount, 0);
});

test('一次错误后选对与首次独立选择可区分，不虚增教学统计', () => {
  let state = wrong(readyToAnswer(atRound(5))).state;
  state = readyToAnswer(fire(state, { type: 'feedbackFinished', at: 100 }).state);
  state = correct(state).state;
  assert.equal(state.feedback?.phase, 'practice');
  assert.equal(state.feedback?.hintUsed, false);
  assert.equal(state.feedback?.attemptIndex, 2);
  assert.equal(state.attempts.filter((attempt) => attempt.phase === 'intro').length, 5);
  assert.equal(state.energy, 1);
});

test('连续重播替换音频代次，旧音频回调不能解锁作答或报错', () => {
  const initial = readyToAnswer(atRound(5));
  const first = fire(initial, { type: 'replay' });
  const oldAudio = eventContext(first.state);
  const second = fire(first.state, { type: 'replay' });
  assert.equal(second.state.replayCount, 2);
  assert.equal(second.state.hintUsed, false);
  expectIgnored(second.state, { ...oldAudio, type: 'audioReady' });
  expectIgnored(second.state, { ...oldAudio, type: 'audioFailed' });
  const chosen = correct(readyToAnswer(second.state));
  assert.equal(chosen.state.feedback?.attemptIndex, 1);
  assert.equal(chosen.state.feedback?.replayCount, 2);
  assert.equal(chosen.state.feedback?.hintUsed, false);
});

test('音频失败及多次重试不计错误、不跳题、不结算', () => {
  let state = atRound(5);
  const oldContext = eventContext(state);
  const before = state.attempts;
  state = fire(state, { type: 'audioFailed' }).state;
  assert.equal(state.status, 'audioError');
  expectIgnored(state, { ...eventContext(state), type: 'choose', wordId: currentRound(state).targetWordId });
  expectIgnored(state, { ...oldContext, type: 'audioReady' });
  for (let i = 0; i < 3; i++) {
    state = fire(state, { type: 'retryAudio' }).state;
    state = fire(state, { type: 'audioFailed' }).state;
  }
  assert.equal(state.attempts, before);
  assert.equal(state.roundErrors, 0);
  assert.equal(state.energy, 0);
  assert.equal(state.replayCount, 0);
  assert.equal(state.roundIndex, 5);
  state = readyToAnswer(fire(state, { type: 'retryAudio' }).state);
  assert.equal(state.status, 'awaitingAnswer');
});

test('旧一轮错误反馈结束事件不能关闭同题新一轮反馈', () => {
  const failed = wrong(readyToAnswer(atRound(5))).state;
  const oldDone: GameEvent = { ...eventContext(failed), type: 'feedbackFinished', at: 100 };
  const retrying = reduceGame(failed, oldDone).state;
  const chosen = correct(readyToAnswer(retrying)).state;
  expectIgnored(chosen, oldDone);
  assert.equal(chosen.status, 'feedback');
  assert.equal(chosen.energy, 1);
});

test('奖励在接受答案时结算，3/7 点各升级一次且升级不替孩子答题', () => {
  for (const index of [7, 11]) {
    const before = readyToAnswer(atRound(index));
    const chosen = correct(before);
    assert.equal(chosen.state.energy, index === 7 ? 3 : 7);
    assert.equal(chosen.state.weaponStage, index === 7 ? 2 : 3);
    assert.equal(chosen.state.status, 'feedback');
    const done: GameEvent = { ...eventContext(chosen.state), type: 'feedbackFinished', at: 100 };
    const upgrading = reduceGame(chosen.state, done);
    assert.equal(upgrading.state.status, 'upgrade');
    assert.equal(upgrading.effects[0].type, 'showUpgrade');
    assert.equal(upgrading.state.roundIndex, index);
    assert.equal(upgrading.state.attempts, chosen.state.attempts);
    expectIgnored(upgrading.state, done);
    const upgradeDone: GameEvent = { ...eventContext(upgrading.state), type: 'upgradeFinished', at: 101 };
    const advanced = reduceGame(upgrading.state, upgradeDone);
    assert.equal(advanced.state.roundIndex, index + 1);
    assert.equal(advanced.state.energy, chosen.state.energy);
    expectIgnored(advanced.state, upgradeDone);
  }
});

test('守关错题不拆盾，每题完成只拆一层，最后完成结果只输出一次', () => {
  let state = readyToAnswer(atRound(10));
  assert.equal(state.shields, 5);
  state = wrong(state).state;
  assert.equal(state.shields, 5);
  state = readyToAnswer(fire(state, { type: 'feedbackFinished', at: 100 }).state);
  const chosen = correct(state);
  assert.equal(chosen.state.shields, 4);
  state = fire(chosen.state, { type: 'feedbackFinished', at: 101 }).state;
  while (state.roundIndex < 14) state = next(state);
  state = correct(readyToAnswer(state)).state;
  assert.equal(state.shields, 0);
  assert.equal(state.energy, 10);
  const done: GameEvent = { ...eventContext(state), type: 'feedbackFinished', at: 123456 };
  const completed = reduceGame(state, done);
  assert.equal(completed.state.status, 'completed');
  assert.equal(completed.effects.length, 1);
  assert.equal(completed.effects[0].type, 'sessionCompleted');
  assert.equal(completed.state.result?.completedAt, 123456);
  assert.equal(completed.state.result?.completed, true);
  assert.equal(completed.state.result?.attempts.length, 16);
  assert.equal(completed.state.result?.attempts, state.attempts);
  expectIgnored(completed.state, done);
  expectIgnored(completed.state, { type: 'pause', sessionId: state.sessionId });
  expectIgnored(completed.state, { type: 'start', sessionId: state.sessionId });
});

test('暂停播放使旧回调失效，恢复重新发出提示但不增加主动重播次数', () => {
  const playing = atRound(5);
  const oldContext = eventContext(playing);
  const paused = reduceGame(playing, { type: 'pause', sessionId: playing.sessionId });
  assert.equal(paused.state.status, 'paused');
  assert.equal(paused.effects[0].type, 'stopPlaybackAndFeedback');
  expectIgnored(paused.state, { ...oldContext, type: 'audioReady' });
  expectIgnored(paused.state, { type: 'pause', sessionId: playing.sessionId });
  const resumed = reduceGame(paused.state, { type: 'resume', sessionId: playing.sessionId });
  assert.equal(resumed.effects[0].type, 'playPrompt');
  assert.equal(resumed.state.replayCount, playing.replayCount);
  expectIgnored(resumed.state, { ...oldContext, type: 'audioFailed' });
  assert.equal(readyToAnswer(resumed.state).status, 'awaitingAnswer');
});

test('暂停后恢复反馈或升级只重新呈现已提交状态，不重复奖励', () => {
  const committed = correct(readyToAnswer(atRound(7))).state;
  const upgrading = fire(committed, { type: 'feedbackFinished', at: 100 }).state;
  for (const original of [committed, upgrading]) {
    const paused = reduceGame(original, { type: 'pause', sessionId: original.sessionId }).state;
    const resumed = reduceGame(paused, { type: 'resume', sessionId: original.sessionId });
    assert.equal(resumed.state.status, original.status);
    assert.equal(resumed.state.energy, 3);
    assert.equal(resumed.state.weaponStage, 2);
    assert.equal(resumed.state.attempts, original.attempts);
    assert.equal(resumed.effects[0].type, original.status === 'feedback' ? 'showFeedback' : 'showUpgrade');
    const type = original.status === 'feedback' ? 'feedbackFinished' : 'upgradeFinished';
    expectIgnored(resumed.state, { ...eventContext(original), type, at: 101 });
  }
});

test('待答、音频错误及 ready 状态的暂停恢复不自动答题或重试', () => {
  const audioError = fire(start().state, { type: 'audioFailed' }).state;
  for (const original of [fresh(), readyToAnswer(), audioError]) {
    const paused = reduceGame(original, { type: 'pause', sessionId: original.sessionId }).state;
    const resumed = reduceGame(paused, { type: 'resume', sessionId: original.sessionId });
    assert.equal(resumed.state.status, original.status);
    assert.equal(resumed.state.attempts, original.attempts);
    assert.deepEqual(resumed.effects, []);
  }
});

test('完成回调的无效时间被拒绝，结果时间由调用者注入', () => {
  const state = correct(readyToAnswer(atRound(14))).state;
  for (const at of [NaN, Infinity, -1]) {
    expectIgnored(state, { ...eventContext(state), type: 'feedbackFinished', at });
  }
  assert.equal(fire(state, { type: 'feedbackFinished', at: 0 }).state.result?.completedAt, 0);
});

test('跨局旧点击即使题目/序号相同也不能污染新局，新局重置奖励', () => {
  const old = readyToAnswer(start(fresh('old')).state);
  const state = readyToAnswer(start(fresh('new')).state);
  expectIgnored(state, { ...eventContext(old), type: 'choose', wordId: currentRound(old).targetWordId });
  assert.equal(state.energy, 0);
  assert.equal(state.weaponStage, 1);
  assert.equal(state.shields, 5);
  assert.equal(state.attempts.length, 0);
});

test('会话构造拒绝坏配置，防御性拷贝并冻结状态，不修改旧快照', () => {
  assert.throws(() => createSession('', FRUIT_LEVEL, rounds), /不能为空/);
  assert.throws(() => createSession('s', FRUIT_LEVEL, []), /关卡不能为空/);
  assert.throws(() => createSession('s', FRUIT_LEVEL, rounds.slice(1)), /题目总数/);
  const mutable = rounds.map((round) => ({ ...round, optionWordIds: [...round.optionWordIds] }));
  const state = createSession('s', FRUIT_LEVEL, mutable);
  mutable[0].optionWordIds[0] = 'pear';
  assert.equal(currentRound(state).optionWordIds[0], 'apple');
  const before = JSON.stringify(state);
  start(state);
  assert.equal(JSON.stringify(state), before);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.rounds));
  assert.ok(Object.isFrozen(currentRound(state).optionWordIds));
});

test('完整流程中每个已接受事件立即重复一次，仍只完成 15 题并结算 10 点', () => {
  let state = fresh();
  const effects: GameEffect[] = [];
  const apply = (event: GameEvent) => {
    const result = reduceGame(state, event);
    effects.push(...result.effects);
    state = result.state;
    expectIgnored(state, event);
  };
  apply({ type: 'start', sessionId: state.sessionId });
  for (let steps = 0; state.status !== 'completed' && steps < 100; steps++) {
    if (state.status === 'presenting') apply({ ...eventContext(state), type: 'audioReady' });
    else if (state.status === 'awaitingAnswer') apply({ ...eventContext(state), type: 'choose', wordId: currentRound(state).targetWordId });
    else if (state.status === 'feedback') apply({ ...eventContext(state), type: 'feedbackFinished', at: steps });
    else if (state.status === 'upgrade') apply({ ...eventContext(state), type: 'upgradeFinished', at: steps });
    else assert.fail(`意外状态 ${state.status}`);
  }
  assert.equal(state.status, 'completed');
  assert.equal(state.energy, 10);
  assert.equal(state.attempts.length, 15);
  assert.equal(state.shields, 0);
  assert.equal(effects.filter((effect) => effect.type === 'showUpgrade').length, 2);
  assert.equal(effects.filter((effect) => effect.type === 'sessionCompleted').length, 1);
});
