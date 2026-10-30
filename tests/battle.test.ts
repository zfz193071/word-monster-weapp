import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattleController } from '../miniprogram/services/battle';
import type { BattleView } from '../miniprogram/services/battle';
import { createAudioAdapter } from '../miniprogram/services/audio';
import { createSession, currentRound, eventContext, reduceGame } from '../miniprogram/game/engine';
import type { GameState } from '../miniprogram/game/engine';
import { createRounds } from '../miniprogram/game/rounds';
import { WORDS } from '../miniprogram/content/words';
import { FRUIT_LEVEL } from '../miniprogram/content/levels';
import { CONTENT_ASSETS } from '../miniprogram/content/assets';
import type { SessionResult } from '../miniprogram/game/types';

class Audio {
  src = ''; autoplay = false; loop = false; destroyed = false;
  handlers = new Map<string, Function>();
  onEnded = (fn: Function) => { this.handlers.set('ended', fn); };
  onError = (fn: Function) => { this.handlers.set('error', fn); };
  onStop = (fn: Function) => { this.handlers.set('stop', fn); };
  onPause = (fn: Function) => { this.handlers.set('pause', fn); };
  offEnded = () => { this.handlers.delete('ended'); };
  offError = () => { this.handlers.delete('error'); };
  offStop = () => { this.handlers.delete('stop'); };
  offPause = () => { this.handlers.delete('pause'); };
  play() {}
  stop() {}
  destroy() { this.destroyed = true; }
  end() { this.handlers.get('ended')?.(); }
  fail() { this.handlers.get('error')?.({ errCode: 10002, errMsg: 'missing' }); }
}
function initial(index = 0) {
  let state = createSession('battle-test', FRUIT_LEVEL, createRounds(WORDS, FRUIT_LEVEL, CONTENT_ASSETS, () => 0.3));
  if (index === 0) return state;
  state = reduceGame(state, { type: 'start', sessionId: state.sessionId }).state;
  while (state.roundIndex < index) {
    state = reduceGame(state, { ...eventContext(state), type: 'audioReady' }).state;
    state = reduceGame(state, { ...eventContext(state), type: 'choose', wordId: currentRound(state).targetWordId }).state;
    state = reduceGame(state, { ...eventContext(state), type: 'feedbackFinished', at: 1 }).state;
    if (state.status === 'upgrade') state = reduceGame(state, { ...eventContext(state), type: 'upgradeFinished', at: 2 }).state;
  }
  // Ready to accept an answer from an existing engine session (no prompt effect to execute here).
  return reduceGame(state, { ...eventContext(state), type: 'audioReady' }).state;
}
function harness(index = 0) {
  let state: GameState;
  let view: BattleView;
  let renders = 0;
  const audios: Audio[] = [];
  const completed: SessionResult[] = [];
  const timers = new Map<() => void, number>();
  const schedule = (fn: () => void, delay: number) => { timers.set(fn, delay); return () => { timers.delete(fn); }; };
  const controller = createBattleController(initial(index), {
    render: (next, value) => { view = next; state = value; renders++; },
    schedule, now: () => 1000,
    onCompleted: (result) => completed.push(result),
    createAudio: (options) => createAudioAdapter({ ...options, schedule,
      createContext: () => { const audio = new Audio(); audios.push(audio); return audio; },
    }),
  });
  return { controller, audios, timers, completed, get state() { return state!; }, get view() { return view!; },
    get renders() { return renders; },
    loadImages() { for (const card of view!.cards) controller.imageResult(view!.context, card.wordId, true); },
    finishVisual() { for (const [fn, delay] of [...timers]) if (delay === 900) { timers.delete(fn); fn(); } },
  };
}

test('single round waits for audio and every image; correct double tap records once and attacks only chosen target', () => {
  const h = harness();
  h.controller.start();
  const target = currentRound(h.state).targetWordId;
  h.controller.choose(h.view.context, target);
  assert.equal(h.state.attempts.length, 0);
  h.audios[0].end();
  assert.equal(h.view.canChoose, false);
  h.loadImages();
  const context = h.view.context;
  h.controller.choose(context, target); h.controller.choose(context, target);
  assert.equal(h.state.attempts.length, 1);
  assert.equal(h.state.energy, 0);
  assert.equal(h.view.revealedWord, target);
  assert.deepEqual(h.view.cards.filter((card) => card.attacked).map((card) => card.wordId), [target]);
  h.finishVisual();
  assert.equal(h.state.roundIndex, 0); // Reveal still playing.
  h.audios[1].end();
  assert.equal(h.state.roundIndex, 1);
  assert.equal(h.view.revealedWord, '');
  assert.equal(h.state.replayCount, 0);
  assert.equal(h.view.canChoose, false);
  h.controller.dispose();
});

test('practice hides answers; wrong twice preserves options and highlights target until eventual correct', () => {
  const h = harness(5);
  h.loadImages();
  const original = h.view.cards.map((card) => card.wordId);
  const target = currentRound(h.state).targetWordId;
  const wrong = original.find((id) => id !== target)!;
  assert.equal(h.view.revealedWord, '');
  assert.ok(h.view.cards.every((card, index) => card.label === `选项 ${index + 1}`));
  for (let attempt = 0; attempt < 2; attempt++) {
    h.controller.choose(h.view.context, wrong);
    assert.equal(h.view.revealedWord, '');
    assert.ok(h.view.cards.every((card) => !card.attacked));
    h.finishVisual(); h.audios.at(-1)!.end();
    assert.deepEqual(h.view.cards.map((card) => card.wordId), original);
  }
  assert.deepEqual(h.view.cards.filter((card) => card.hint).map((card) => card.wordId), [target]);
  assert.equal(h.state.replayCount, 2);
  h.controller.choose(h.view.context, target);
  assert.equal(h.state.energy, 1);
  assert.equal(h.state.attempts.at(-1)!.hintUsed, true);
  assert.equal(h.state.attempts.at(-1)!.attemptIndex, 3);
  const context = h.view.context;
  h.controller.visualFinished(context, wrong);
  h.audios.at(-1)!.end();
  assert.equal(h.state.roundIndex, 5);
  h.controller.visualFinished(context, target);
  assert.equal(h.state.roundIndex, 6);
  h.controller.visualFinished(context, target);
  assert.equal(h.state.roundIndex, 6);
  h.controller.dispose();
});

test('missing images never become text answers and prevent attempts even after audio succeeds', () => {
  const h = harness();
  h.controller.start(); h.audios[0].end();
  const target = currentRound(h.state).targetWordId;
  h.controller.imageResult(h.view.context, target, false);
  assert.equal(h.view.imageFailed, true);
  assert.equal(h.view.canChoose, false);
  assert.equal(h.view.revealedWord, '');
  h.controller.choose(h.view.context, target);
  assert.equal(h.state.attempts.length, 0);
  h.controller.dispose();
});

test('audio failure and retry stay on question without attempts; replay and old callbacks are isolated', () => {
  const h = harness(); h.controller.start(); h.loadImages();
  h.audios[0].fail();
  assert.equal(h.view.status, 'audioError');
  h.controller.retryAudio(h.view.context);
  h.audios[1].end();
  assert.equal(h.view.canChoose, true);
  assert.equal(h.state.replayCount, 0);
  const old = h.view.context;
  h.controller.replay(old);
  h.controller.choose(old, currentRound(h.state).targetWordId);
  assert.equal(h.state.attempts.length, 0);
  h.audios[2].end();
  assert.equal(h.state.replayCount, 1);
  h.controller.dispose();
});

test('pause and dispose cancel feedback/audio, stale completions cannot advance or render', () => {
  const h = harness(5); h.loadImages();
  const target = currentRound(h.state).targetWordId;
  h.controller.choose(h.view.context, target);
  const late = h.audios[0].handlers.get('ended')!;
  const lateTimer = [...h.timers.keys()][0];
  h.controller.pause(); late(); lateTimer();
  assert.equal(h.state.status, 'paused');
  assert.equal(h.timers.size, 0);
  h.controller.resume();
  assert.equal(h.state.status, 'feedback');
  assert.equal(h.state.energy, 1);
  assert.equal(h.state.attempts.length, 6);
  const lateResume = h.audios.at(-1)!.handlers.get('ended')!;
  h.controller.dispose(); const renders = h.renders;
  lateResume(); h.controller.replay(h.view.context);
  assert.equal(h.renders, renders);
  assert.equal(h.timers.size, 0);
  assert.ok(h.audios.every((audio) => audio.destroyed));
});

test('failed reveal completes feedback without erasing accepted answer or blocking forever', () => {
  const h = harness(); h.controller.start(); h.loadImages(); h.audios[0].end();
  h.controller.choose(h.view.context, currentRound(h.state).targetWordId);
  h.audios[1].fail();
  assert.match(h.view.message, /读音没能播放/);
  h.finishVisual();
  assert.equal(h.state.roundIndex, 1);
  assert.equal(h.state.attempts.length, 1);
  h.controller.dispose();
});

test('full 15-round controller flow preserves stages, learning evidence, shields and one completion', () => {
  const h = harness();
  const seen: Record<string, string[]> = { intro: [], practice: [], boss: [] };
  const upgrades: number[] = [];
  h.controller.start();
  for (let index = 0; index < 15; index++) {
    assert.equal(h.state.roundIndex, index);
    assert.equal(h.state.status, 'presenting');
    const round = currentRound(h.state);
    seen[round.phase].push(round.targetWordId);
    assert.equal(h.view.phaseProgress, `${index % 5 + 1} / 5`);
    assert.equal(h.view.cards.length, index < 5 ? 1 : index < 10 ? 2 : 3);
    assert.equal(h.view.teachingWord, index < 5 ? round.targetWordId : '');
    assert.equal(h.view.revealedWord, '');
    assert.equal(h.view.shields.length, index < 10 ? 0 : 5);
    if (index >= 10) assert.equal(h.view.shieldsRemaining, 15 - index);
    h.loadImages(); h.audios.at(-1)!.end();
    const attemptsBefore = h.state.attempts.length;
    h.finishVisual(); // No animation is allowed to answer for the child.
    h.controller.visualFinished(h.view.context, round.targetWordId);
    assert.equal(h.state.attempts.length, attemptsBefore);
    assert.equal(h.state.roundIndex, index);

    const wrongCount = index === 5 ? 1 : index === 10 ? 2 : 0;
    for (let retry = 0; retry < wrongCount; retry++) {
      const wrong = round.optionWordIds.find((id) => id !== round.targetWordId)!;
      const shields = h.state.shields;
      const energy = h.state.energy;
      h.controller.choose(h.view.context, wrong);
      assert.equal(h.state.shields, shields);
      assert.equal(h.state.energy, energy);
      h.finishVisual(); h.audios.at(-1)!.end();
      assert.equal(h.state.roundIndex, index);
      assert.deepEqual(h.view.cards.map((card) => card.wordId), round.optionWordIds);
    }
    const chooseContext = h.view.context;
    h.controller.choose(chooseContext, round.targetWordId);
    h.controller.choose(chooseContext, round.targetWordId);
    assert.equal(h.state.attempts.length, attemptsBefore + wrongCount + 1);
    assert.equal(h.state.energy, index < 5 ? 0 : index - 4);
    if (index >= 10) {
      assert.equal(h.view.shieldsRemaining, 14 - index);
      assert.equal(h.view.shields.filter((shield) => shield.intact).length, 14 - index);
    }
    const feedbackContext = h.view.context;
    const lateAudio = h.audios.at(-1)!.handlers.get('ended')!;
    h.controller.visualFinished(feedbackContext, round.targetWordId);
    h.audios.at(-1)!.end();
    h.controller.visualFinished(feedbackContext, round.targetWordId); lateAudio();
    if (h.state.status === 'upgrade') {
      upgrades.push(h.state.energy);
      const attempts = h.state.attempts.length;
      h.controller.choose(h.view.context, round.targetWordId);
      assert.equal(h.state.attempts.length, attempts);
      h.finishVisual();
    }
  }
  assert.deepEqual(seen.intro, WORDS.map((word) => word.id));
  for (const phase of ['practice', 'boss']) assert.deepEqual([...seen[phase]].sort(), WORDS.map((word) => word.id).sort());
  assert.deepEqual(upgrades, [3, 7]);
  assert.equal(h.state.status, 'completed');
  assert.equal(h.state.energy, 10);
  assert.equal(h.state.shields, 0);
  assert.equal(h.view.cards.length, 0);
  assert.equal(h.view.teachingWord, '');
  assert.equal(h.view.canChoose, false);
  assert.equal(h.view.canReplay, false);
  assert.equal(h.completed.length, 1);
  assert.equal(h.completed[0], h.state.result);
  const attempts = h.completed[0].attempts;
  assert.equal(attempts.filter((item) => item.phase === 'intro').length, 5);
  const tasks = attempts.filter((item) => item.phase !== 'intro' && item.correct);
  assert.equal(tasks.length, 10);
  assert.equal(tasks.filter((item) => item.attemptIndex === 1 && !item.hintUsed).length, 8);
  assert.equal(tasks.filter((item) => item.attemptIndex > 1 && !item.hintUsed).length, 1);
  assert.equal(tasks.filter((item) => item.hintUsed).length, 1);
  const renders = h.renders;
  h.controller.start(); h.controller.replay(h.view.context); h.controller.resume();
  h.controller.imageResult(h.view.context, currentRound(h.state).targetWordId, false);
  assert.equal(h.renders, renders);
  assert.equal(h.completed.length, 1);
  assert.equal(h.timers.size, 0);
  h.controller.dispose();
});
