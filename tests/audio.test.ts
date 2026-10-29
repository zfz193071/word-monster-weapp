import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAudioAdapter } from '../miniprogram/services/audio';
import { createSession, eventContext, reduceGame } from '../miniprogram/game/engine';
import { createRounds } from '../miniprogram/game/rounds';
import { WORDS } from '../miniprogram/content/words';
import { FRUIT_LEVEL } from '../miniprogram/content/levels';
import { CONTENT_ASSETS } from '../miniprogram/content/assets';

class FakeAudio {
  src = ''; autoplay = false; loop = false;
  plays = 0; stops = 0; destroys = 0;
  handlers = new Map<string, Function>();
  onEnded = (fn: Function) => { this.handlers.set('ended', fn); };
  onError = (fn: Function) => { this.handlers.set('error', fn); };
  onStop = (fn: Function) => { this.handlers.set('stop', fn); };
  onPause = (fn: Function) => { this.handlers.set('pause', fn); };
  offEnded = () => { this.handlers.delete('ended'); };
  offError = () => { this.handlers.delete('error'); };
  offStop = () => { this.handlers.delete('stop'); };
  offPause = () => { this.handlers.delete('pause'); };
  play() { this.plays++; }
  stop() { this.stops++; this.handlers.get('stop')?.(); }
  destroy() { this.destroys++; }
  fire(name: string) { this.handlers.get(name)?.({ errCode: 10001, errMsg: 'failed' }); }
}
const src = '/assets/audio/apple.mp3';
const context = (revision = 1) => ({ sessionId: 'session', roundId: 'round', revision });
function harness() {
  const channels: FakeAudio[] = [];
  const events: unknown[] = [];
  const failures: unknown[] = [];
  const timers = new Set<() => void>();
  const adapter = createAudioAdapter({
    sessionId: 'session', emit: (event) => events.push(event), onFailure: (error) => failures.push(error),
    createContext: () => { const channel = new FakeAudio(); channels.push(channel); return channel; },
    schedule: (callback) => { timers.add(callback); return () => { timers.delete(callback); }; },
  });
  return { adapter, channels, events, failures, timers };
}

test('only natural completion unlocks prompt; terminal callbacks are once-only and resources released', () => {
  const h = harness();
  h.adapter.playPrompt(src, context());
  const audio = h.channels[0];
  const ended = audio.handlers.get('ended')!;
  assert.equal(audio.plays, 1);
  assert.deepEqual(h.events, []);
  ended(); ended();
  assert.deepEqual(h.events, [{ ...context(), type: 'audioReady' }]);
  assert.equal(audio.destroys, 1);
  assert.equal(audio.handlers.size, 0);
  assert.equal(h.timers.size, 0);
});

test('rapid replay replaces playback, captures context, and rejects duplicates/stale/cross-session requests', () => {
  const h = harness();
  const input = context();
  h.adapter.playPrompt(src, input);
  input.revision = 99;
  const late = h.channels[0].handlers.get('ended')!;
  assert.equal(h.adapter.playPrompt(src, context()), 'ignored');
  h.adapter.playPrompt(src, context(2));
  late();
  assert.deepEqual(h.events, []);
  assert.equal(h.channels[0].destroys, 1);
  assert.equal(h.adapter.playPrompt(src, context()), 'ignored');
  assert.equal(h.adapter.playPrompt(src, { ...context(3), sessionId: 'other' }), 'ignored');
  assert.equal(h.adapter.playPrompt(src, { ...context(2), roundId: 'other' }), 'ignored');
  h.channels[1].fire('ended');
  assert.deepEqual(h.events, [{ ...context(2), type: 'audioReady' }]);
});

test('voice suppresses effects; voice preempts effects; reveal never unlocks a question', () => {
  const h = harness();
  h.adapter.playEffect(src, context());
  h.adapter.playPrompt(src, context());
  assert.equal(h.channels[0].destroys, 1);
  assert.equal(h.adapter.playEffect(src, context(2)), 'suppressed');
  h.channels[1].fire('ended');
  let revealed = false;
  h.adapter.playReveal(src, context(2), (success) => { revealed = success; });
  h.channels[2].fire('ended');
  assert.equal(revealed, true);
  assert.equal(h.events.length, 1);
});

test('platform errors, interruptions and watchdog timeouts fail safely; retries use a new context', () => {
  for (const cause of ['error', 'pause', 'stop', 'timeout']) {
    const h = harness();
    h.adapter.playPrompt(src, context());
    if (cause === 'timeout') [...h.timers][0](); else h.channels[0].fire(cause);
    assert.deepEqual(h.events, [{ ...context(), type: 'audioFailed' }]);
    assert.equal(h.failures.length, 1);
    assert.equal(h.channels[0].destroys, 1);
    h.adapter.playPrompt(src, context(2));
    h.channels[1].fire('ended');
    assert.equal(h.events.length, 2);
  }
});

test('stop/dispose cancel timers and ignore callbacks without reporting an error', () => {
  const h = harness();
  h.adapter.playPrompt(src, context());
  const late = h.channels[0].handlers.get('error')!;
  const lateTimer = [...h.timers][0];
  h.adapter.stop(); late({ errCode: -1 }); lateTimer();
  assert.deepEqual(h.events, []);
  h.adapter.playPrompt(src, context(2));
  const ended = h.channels[1].handlers.get('ended')!;
  h.adapter.dispose(); h.adapter.dispose(); ended();
  assert.equal(h.adapter.playPrompt(src, context(3)), 'disposed');
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.events, []);
  assert.ok(h.channels.every((audio) => audio.destroys === 1));
});

test('invalid paths and synchronous factory/play failures report audioFailed', () => {
  const h = harness();
  assert.equal(h.adapter.playPrompt('../apple.mp3', context()), 'failed');
  assert.equal(h.channels.length, 0);
  for (const point of ['create', 'play']) {
    const audio = new FakeAudio();
    const events: unknown[] = [];
    const adapter = createAudioAdapter({
      sessionId: 'session', emit: (event) => events.push(event),
      createContext: () => {
        if (point === 'create') throw new Error('create failure');
        audio.play = () => { throw new Error('play failure'); };
        return audio;
      },
    });
    assert.equal(adapter.playPrompt(src, context()), 'failed');
    assert.deepEqual(events, [{ ...context(), type: 'audioFailed' }]);
    if (point === 'play') assert.equal(audio.destroys, 1);
  }
});

test('failed stop still destroys context, and completion may start a new playback reentrantly', () => {
  const h = harness();
  h.adapter.playReveal(src, context(), () => h.adapter.playPrompt(src, context(2)));
  h.channels[0].stop = () => { throw new Error('stop failed'); };
  h.channels[0].fire('ended');
  assert.equal(h.channels[0].destroys, 1);
  assert.equal(h.channels[1].plays, 1);
  h.channels[1].fire('ended');
  assert.deepEqual(h.events, [{ ...context(2), type: 'audioReady' }]);
});

test('engine integration: failure and retry preserve question and attempts; replay counted only by engine', () => {
  const rounds = createRounds(WORDS, FRUIT_LEVEL, CONTENT_ASSETS, () => 0.3);
  let state = reduceGame(createSession('session', FRUIT_LEVEL, rounds), { type: 'start', sessionId: 'session' }).state;
  const channels: FakeAudio[] = [];
  const adapter = createAudioAdapter({ sessionId: 'session',
    emit: (event) => { state = reduceGame(state, event).state; },
    createContext: () => { const audio = new FakeAudio(); channels.push(audio); return audio; },
  });
  adapter.playPrompt(src, eventContext(state));
  channels[0].fire('error');
  assert.equal(state.status, 'audioError');
  assert.equal(state.roundIndex, 0);
  assert.equal(state.attempts.length, 0);
  state = reduceGame(state, { ...eventContext(state), type: 'retryAudio' }).state;
  adapter.playPrompt(src, eventContext(state)); channels[1].fire('ended');
  assert.equal(state.status, 'awaitingAnswer');
  assert.equal(state.replayCount, 0);
  state = reduceGame(state, { ...eventContext(state), type: 'replay' }).state;
  adapter.playPrompt(src, eventContext(state));
  const late = channels[2].handlers.get('ended')!;
  state = reduceGame(state, { type: 'pause', sessionId: 'session' }).state;
  adapter.stop(); late();
  assert.equal(state.status, 'paused');
  state = reduceGame(state, { type: 'resume', sessionId: 'session' }).state;
  adapter.playPrompt(src, eventContext(state)); channels[3].fire('ended');
  assert.equal(state.status, 'awaitingAnswer');
  assert.equal(state.replayCount, 1);
  assert.equal(state.attempts.length, 0);
  adapter.dispose();
});
