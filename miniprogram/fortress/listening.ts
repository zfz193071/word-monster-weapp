import { BATTLE_WORDS } from './fruit-catalog';
import { validateOpeningPlan } from './opening-plan';
import { createAudioAdapter } from '../services/audio';
import type { AudioOptions } from '../services/audio';
import { FORTRESS_MONSTERS, FORTRESS_WORDS } from './content';
import { createFruitOptions } from './fruit-options';
import { FORTRESS_RULES } from './rules';
import { assertNoFortressIssues, validateSessionPlan } from './validation';
import type { AttemptV2, RandomSource, SessionPlan, WaveContext } from './types';

export interface ListeningView {
  readonly playbackRate: number;
  readonly token: string;
  readonly imageToken: string;
  readonly phase: 'idle' | 'playing' | 'ready' | 'audioError' | 'started';
  readonly paused: boolean;
  readonly canChoose: boolean;
  readonly message: string;
  readonly imageFailed: boolean;
  readonly cards: readonly { id: string; key: string; portraitPath: string; meaningZh: string; label: string; hinted: boolean }[];
}
export interface ListeningResult { readonly context: WaveContext; readonly attempts: readonly AttemptV2[] }
export interface ListeningOptions {
  readonly variant?: 'fruit';
  readonly random?: RandomSource;
  readonly plan: SessionPlan;
  readonly waveIndex: number;
  readonly generation: number;
  readonly onChange: (view: ListeningView) => void;
  readonly onStartCombat: (result: ListeningResult) => void;
  readonly audio?: Pick<AudioOptions, 'createContext' | 'schedule' | 'timeoutMs'>;
}

// One instance per listening phase. Host disposes it on phase/wave/run changes.
export function createListening(options: ListeningOptions) {
  if (options.plan.kind === 'fruit-defense' && options.variant === 'fruit') validateOpeningPlan(options.plan);
  else assertNoFortressIssues(validateSessionPlan(options.plan));
  const words = options.plan.kind === 'fruit-defense' ? BATTLE_WORDS : FORTRESS_WORDS;
  const wave = options.plan.waves[options.waveIndex];
  if (!wave || !Number.isInteger(options.waveIndex) || !Number.isSafeInteger(options.generation) || options.generation < 0) throw new Error('听词波次或代次无效');
  const context: WaveContext = Object.freeze({ sessionId: options.plan.sessionId, waveId: wave.waveId, generation: options.generation });
  const word = words.find(word => word.id === wave.targetWordId)!;
  const random = options.random ?? Math.random;
  let optionIds = options.variant === 'fruit' ? createFruitOptions(wave.targetWordId, [], random, words.map(word => word.id)) : wave.optionWordIds;
  function portrait(id: string): string {
    const path = options.variant === 'fruit' ? words.find(item => item.id === id)?.fruitImagePath
      : FORTRESS_MONSTERS.find(item => item.wordId === id)?.portraitPath;
    if (!path) throw new Error('选项图片缺失');
    return path;
  }
  let playbackRate = .8;
  let phase: ListeningView['phase'] = 'idle';
  let revision = 0; let imageRevision = 0; let paused = false; let disposed = false;
  let errors = 0; let replays = 0;
  let attempts: readonly AttemptV2[] = Object.freeze([]);
  let images = optionIds.map(() => 'loading');
  const prefix = JSON.stringify([context.sessionId, context.waveId, context.generation]);
  const token = () => `${prefix}:${revision}`;
  const imageToken = () => `${prefix}:image:${imageRevision}`;
  const available = () => !disposed && !paused && phase === 'ready' && images.every(status => status === 'loaded');
  function view(): ListeningView {
    return { playbackRate, token: token(), imageToken: imageToken(), phase, paused, canChoose: available(), imageFailed: images.includes('failed'),
      message: paused ? '已暂停' : phase === 'audioError' ? '声音暂时无法播放，请重试' : images.includes('failed') ? '图片加载失败，请重试'
        : phase === 'started' ? '选对了，守护基地吧！' : errors >= 2 ? '试试亮起来的水果' : errors ? '再听一次，选出水果' : '听一听，选水果',
      cards: optionIds.map((id, index) => ({ id, key: `${imageToken()}:${index}`, portraitPath: portrait(id), meaningZh: words.find(word => word.id === id)!.meaningZh, label: `选项 ${index + 1}`, hinted: errors >= FORTRESS_RULES.learning.hintAfterErrors && id === wave.targetWordId })) };
  }
  const publish = () => { if (!disposed) options.onChange(view()); };
  const audio = createAudioAdapter({ ...options.audio, sessionId: context.sessionId, emit: event => {
    if (disposed || paused || phase !== 'playing' || event.roundId !== context.waveId || event.revision !== revision) return;
    phase = event.type === 'audioReady' ? 'ready' : 'audioError'; publish();
  } });
  function play(): void {
    revision++; phase = 'playing'; publish();
    audio.setPlaybackRate(playbackRate);
    audio.playPrompt(word.audioPath, { sessionId: context.sessionId, roundId: context.waveId, revision });
  }
  return {
    get view() { return view(); },
    get attempts() { return attempts; },
    cyclePlaybackRate() {
      if (disposed || paused || phase === 'started') return;
      playbackRate = playbackRate === .8 ? 1 : playbackRate === 1 ? 1.2 : .8;
      replays++; play();
    },
    start() { if (!disposed && !paused && phase === 'idle') play(); },
    choose(eventToken: string, id: string) {
      if (eventToken !== token() || !available() || !optionIds.includes(id)) return;
      const correct = id === wave.targetWordId;
      const attempt: AttemptV2 = Object.freeze({ sessionId: context.sessionId, waveId: context.waveId, taskKind: 'listeningChoice',
        targetWordId: wave.targetWordId, selectedWordId: id, correct, hintUsed: errors >= FORTRESS_RULES.learning.hintAfterErrors,
        attemptIndex: attempts.length + 1, replayCount: replays });
      attempts = Object.freeze([...attempts, attempt]);
      if (correct) {
        phase = 'started'; revision++; audio.dispose(); publish();
        options.onStartCombat({ context, attempts });
      } else {
        errors++; replays++;
        if (options.variant === 'fruit') {
          optionIds = createFruitOptions(wave.targetWordId, optionIds, random, words.map(word => word.id));
          imageRevision++; images = optionIds.map(() => 'loading');
        }
        play();
      }
    },
    replay(eventToken: string) { if (!disposed && !paused && eventToken === token() && (phase === 'ready' || phase === 'playing')) { replays++; play(); } },
    retryAudio(eventToken: string) { if (!disposed && !paused && eventToken === token() && phase === 'audioError') play(); },
    imageResult(eventToken: string, id: string, success: boolean) {
      if (disposed || eventToken !== imageToken() || phase === 'started') return;
      const index = optionIds.indexOf(id);
      if (index < 0 || images[index] !== 'loading') return;
      images[index] = success ? 'loaded' : 'failed'; publish();
    },
    retryImages(eventToken: string) {
      if (disposed || paused || phase === 'started' || eventToken !== imageToken() || !images.includes('failed')) return;
      imageRevision++; images = optionIds.map(() => 'loading'); publish();
    },
    setPaused(value: boolean) {
      if (disposed || phase === 'started' || paused === value) return;
      paused = value; revision++;
      if (value) { audio.stop(); publish(); }
      else if (phase === 'playing' || phase === 'idle') play();
      else publish();
    },
    dispose() { if (!disposed) { disposed = true; revision++; audio.dispose(); } },
  };
}
