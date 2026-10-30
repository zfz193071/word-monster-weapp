import { createAudioAdapter } from '../services/audio';
import type { AudioOptions } from '../services/audio';
import { FORTRESS_WORDS } from './content';
import { FORTRESS_RULES } from './rules';
import type { CombatContext, CombatState } from './types';

export interface RetirementIdentity extends CombatContext { readonly monsterId: string; readonly wordId: string }
export interface RetirementView {
  readonly context: RetirementIdentity;
  readonly phase: 'playing' | 'audioError' | 'fading' | 'done';
  readonly word: string; readonly fruitImagePath: string;
}
export interface RetirementResult { readonly context: RetirementIdentity; readonly audio: 'completed' | 'skippedAfterFailure' }
export interface RetirementOptions {
  readonly onChange: (view: RetirementView) => void;
  readonly onComplete: (result: RetirementResult) => void;
  readonly audio?: Pick<AudioOptions, 'createContext' | 'schedule' | 'timeoutMs'>;
}

// One instance per committed defeat. The host owns the single RAF and supplies
// foreground elapsed time. This module never changes HP, attempts or rewards.
export function createRetirement(state: CombatState, options: RetirementOptions) {
  const monster = state.monsters[0];
  const word = FORTRESS_WORDS.find(word => word.id === monster?.wordId);
  if (state.status !== 'cleared' || state.monsters.length !== 1 || !monster || monster.hp !== 0
    || !state.defeatedMonsterIds.includes(monster.id) || !word) throw new Error('退场必须来自已提交的当前波击败事实');
  const context: RetirementIdentity = Object.freeze({ ...state.context, monsterId: monster.id, wordId: monster.wordId });
  const audio = createAudioAdapter({ ...options.audio, sessionId: context.sessionId, emit: () => undefined });
  let phase: RetirementView['phase'] = 'playing';
  let started = false; let disposed = false; let paused = false; let completed = false;
  let revision = 0; let shadowMs = 0; let fadeMs = 0;
  let outcome: RetirementResult['audio'] | undefined;
  const view = (): RetirementView => ({ context, phase, word: word.text, fruitImagePath: word.fruitImagePath });
  const publish = () => options.onChange(view());
  function play(): void {
    const token = ++revision;
    audio.playReveal(word!.audioPath, { sessionId: context.sessionId, roundId: context.monsterId, revision: token }, success => {
      if (disposed || paused || token !== revision || completed) return;
      if (success) outcome = 'completed';
      else { phase = 'audioError'; publish(); }
    });
  }
  function finish(): void {
    if (completed || disposed || !outcome) return;
    completed = true; phase = 'done'; audio.dispose(); publish();
    options.onComplete({ context, audio: outcome });
  }
  return {
    get view() { return view(); },
    get active() { return started && !completed && !disposed; },
    get opacity() { return completed || disposed ? 0 : 0.35 * (1 - fadeMs / FORTRESS_RULES.retirement.fadeMs); },
    start(): void { if (!started && !disposed) { started = true; publish(); if (!paused) play(); } },
    advance(elapsedMs: number): void {
      if (!started || disposed || paused || completed) return;
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('退场步长必须为非负有限数');
      if (phase === 'fading') { fadeMs = Math.min(FORTRESS_RULES.retirement.fadeMs, fadeMs + elapsedMs); if (fadeMs >= FORTRESS_RULES.retirement.fadeMs) finish(); return; }
      shadowMs = Math.min(FORTRESS_RULES.retirement.minShadowMs, shadowMs + elapsedMs);
      if (outcome && shadowMs >= FORTRESS_RULES.retirement.minShadowMs) { phase = 'fading'; publish(); }
    },
    retry(): void { if (!disposed && !paused && phase === 'audioError') { phase = 'playing'; outcome = undefined; publish(); play(); } },
    continueAfterFailure(): void { if (!disposed && !paused && phase === 'audioError') { outcome = 'skippedAfterFailure'; phase = 'playing'; publish(); } },
    setPaused(value: boolean): void {
      if (disposed || paused === value) return;
      paused = value;
      if (value) { revision++; audio.stop(); }
      else if (started && !completed && phase === 'playing' && !outcome) play();
    },
    dispose(): void { if (!disposed) { disposed = true; revision++; audio.dispose(); } },
  };
}
