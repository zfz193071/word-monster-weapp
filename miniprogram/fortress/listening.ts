import { createAudioAdapter } from '../services/audio';
import type { AudioOptions } from '../services/audio';
import { FORTRESS_MONSTERS, FORTRESS_WORDS } from './content';
import { FORTRESS_RULES } from './rules';
import { assertNoFortressIssues, validateSessionPlan } from './validation';
import type { AttemptV2, SessionPlan, WaveContext } from './types';

export interface ListeningView {
  readonly token: string;
  readonly imageToken: string;
  readonly phase: 'idle' | 'playing' | 'ready' | 'audioError' | 'started';
  readonly paused: boolean;
  readonly canChoose: boolean;
  readonly message: string;
  readonly imageFailed: boolean;
  readonly cards: readonly { id: string; key: string; portraitPath: string; label: string; hinted: boolean }[];
}
export interface ListeningResult { readonly context: WaveContext; readonly attempts: readonly AttemptV2[] }
export interface ListeningOptions {
  readonly plan: SessionPlan;
  readonly waveIndex: number;
  readonly generation: number;
  readonly onChange: (view: ListeningView) => void;
  readonly onStartCombat: (result: ListeningResult) => void;
  readonly audio?: Pick<AudioOptions, 'createContext' | 'schedule' | 'timeoutMs'>;
}

// One instance per listening phase. Host disposes it on phase/wave/run changes.
export function createListening(options: ListeningOptions) {
  assertNoFortressIssues(validateSessionPlan(options.plan));
  const wave = options.plan.waves[options.waveIndex];
  if (!wave || !Number.isInteger(options.waveIndex) || !Number.isSafeInteger(options.generation) || options.generation < 0) throw new Error('听词波次或代次无效');
  const context: WaveContext = Object.freeze({ sessionId: options.plan.sessionId, waveId: wave.waveId, generation: options.generation });
  const word = FORTRESS_WORDS.find(word => word.id === wave.targetWordId)!;
  const portraits = wave.optionWordIds.map(id => {
    const visual = FORTRESS_MONSTERS.find(item => item.wordId === id);
    if (!visual) throw new Error('怪物头像缺失');
    return visual.portraitPath;
  });
  let phase: ListeningView['phase'] = 'idle';
  let revision = 0; let imageRevision = 0; let paused = false; let disposed = false;
  let errors = 0; let replays = 0;
  let attempts: readonly AttemptV2[] = Object.freeze([]);
  let images = wave.optionWordIds.map(() => 'loading');
  const prefix = JSON.stringify([context.sessionId, context.waveId, context.generation]);
  const token = () => `${prefix}:${revision}`;
  const imageToken = () => `${prefix}:image:${imageRevision}`;
  const available = () => !disposed && !paused && phase === 'ready' && images.every(status => status === 'loaded');
  function view(): ListeningView {
    return { token: token(), imageToken: imageToken(), phase, paused, canChoose: available(), imageFailed: images.includes('failed'),
      message: paused ? '已暂停' : phase === 'audioError' ? '声音暂时无法播放，请重试' : images.includes('failed') ? '头像加载失败，请重试'
        : phase === 'started' ? '选对了，守护基地吧！' : errors >= 2 ? '试试亮起来的怪物' : errors ? '再听听，试试另一个怪物' : '听单词，选择右侧的怪物',
      cards: wave.optionWordIds.map((id, index) => ({ id, key: `${imageToken()}:${index}`, portraitPath: portraits[index], label: `选项 ${index + 1}`, hinted: errors >= FORTRESS_RULES.learning.hintAfterErrors && id === wave.targetWordId })) };
  }
  const publish = () => { if (!disposed) options.onChange(view()); };
  const audio = createAudioAdapter({ ...options.audio, sessionId: context.sessionId, emit: event => {
    if (disposed || paused || phase !== 'playing' || event.roundId !== context.waveId || event.revision !== revision) return;
    phase = event.type === 'audioReady' ? 'ready' : 'audioError'; publish();
  } });
  function play(): void {
    revision++; phase = 'playing'; publish();
    audio.playPrompt(word.audioPath, { sessionId: context.sessionId, roundId: context.waveId, revision });
  }
  return {
    get view() { return view(); },
    get attempts() { return attempts; },
    start() { if (!disposed && !paused && phase === 'idle') play(); },
    choose(eventToken: string, id: string) {
      if (eventToken !== token() || !available() || !wave.optionWordIds.includes(id)) return;
      const correct = id === wave.targetWordId;
      const attempt: AttemptV2 = Object.freeze({ sessionId: context.sessionId, waveId: context.waveId, taskKind: 'listeningChoice',
        targetWordId: wave.targetWordId, selectedWordId: id, correct, hintUsed: errors >= FORTRESS_RULES.learning.hintAfterErrors,
        attemptIndex: attempts.length + 1, replayCount: replays });
      attempts = Object.freeze([...attempts, attempt]);
      if (correct) {
        phase = 'started'; revision++; audio.dispose(); publish();
        options.onStartCombat({ context, attempts });
      } else { errors++; replays++; play(); }
    },
    replay(eventToken: string) { if (!disposed && !paused && eventToken === token() && (phase === 'ready' || phase === 'playing')) { replays++; play(); } },
    retryAudio(eventToken: string) { if (!disposed && !paused && eventToken === token() && phase === 'audioError') play(); },
    imageResult(eventToken: string, id: string, success: boolean) {
      if (disposed || eventToken !== imageToken() || phase === 'started') return;
      const index = wave.optionWordIds.indexOf(id);
      if (index < 0 || images[index] !== 'loading') return;
      images[index] = success ? 'loaded' : 'failed'; publish();
    },
    retryImages(eventToken: string) {
      if (disposed || paused || phase === 'started' || eventToken !== imageToken() || !images.includes('failed')) return;
      imageRevision++; images = wave.optionWordIds.map(() => 'loading'); publish();
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
