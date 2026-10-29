import { ContentValidationError, validateRounds } from '../content/validation';
import { MVP_RULES } from './rules';
import type { Attempt, GameEvent, GameStatus, LevelConfig, Round, RoundEventContext, SessionResult } from './types';

export interface GameState {
  readonly sessionId: string;
  readonly levelId: string;
  readonly contentVersion: number;
  readonly rounds: readonly Round[];
  readonly roundIndex: number;
  readonly revision: number;
  readonly status: GameStatus;
  readonly pausedFrom: Exclude<GameStatus, 'paused'> | null;
  readonly attempts: readonly Attempt[];
  readonly feedback: Attempt | null;
  readonly roundErrors: number;
  readonly replayCount: number;
  readonly hintUsed: boolean;
  readonly energy: number;
  readonly weaponStage: number;
  readonly shields: number;
  readonly upgradePending: boolean;
  readonly result: SessionResult | null;
}

// 适配器执行这些命令，将完成回调连同原 context 送回引擎。
// 没有“加奖励”命令：奖励只存在于已提交的 state，重放动画不改变它。
export type GameEffect =
  | { readonly type: 'playPrompt'; readonly context: RoundEventContext; readonly wordId: string }
  | { readonly type: 'showFeedback'; readonly context: RoundEventContext; readonly attempt: Attempt }
  | { readonly type: 'showUpgrade'; readonly context: RoundEventContext; readonly stage: number }
  | { readonly type: 'stopPlaybackAndFeedback'; readonly sessionId: string }
  | { readonly type: 'sessionCompleted'; readonly result: SessionResult };

export interface GameTransition {
  readonly state: GameState;
  readonly effects: readonly GameEffect[];
}

export function currentRound(state: GameState): Round {
  return state.rounds[state.roundIndex];
}

export function eventContext(state: GameState): RoundEventContext {
  return Object.freeze({ sessionId: state.sessionId, roundId: currentRound(state).id, revision: state.revision });
}

export function createSession(sessionId: string, level: LevelConfig, rounds: readonly Round[]): GameState {
  if (!sessionId.trim() || !level.id.trim()) throw new Error('会话和关卡 ID 不能为空');
  if (!Number.isInteger(level.contentVersion) || level.contentVersion < 1) throw new Error('内容版本必须为正整数');
  if (!rounds.length) throw new Error('关卡不能为空');
  const issues = validateRounds(rounds, level);
  if (issues.length) throw new ContentValidationError(issues);
  // 防止外部代码改写传入数组，影响已开始的会话。
  const snapshot = Object.freeze(rounds.map((round) => Object.freeze({
    ...round, optionWordIds: Object.freeze([...round.optionWordIds]),
  })));
  return Object.freeze({
    sessionId, levelId: level.id, contentVersion: level.contentVersion, rounds: snapshot,
    roundIndex: 0, revision: 0, status: 'ready', pausedFrom: null,
    attempts: Object.freeze([]), feedback: null, roundErrors: 0, replayCount: 0, hintUsed: false,
    energy: 0, weaponStage: 1, shields: MVP_RULES.bossShields, upgradePending: false, result: null,
  });
}

function transition(state: GameState, effects: readonly GameEffect[] = []): GameTransition {
  return Object.freeze({ state, effects: Object.freeze(effects.map((effect) => Object.freeze(effect))) });
}

function update(state: GameState, patch: Partial<GameState>): GameState {
  return Object.freeze({ ...state, ...patch, revision: state.revision + 1 });
}

function prompt(state: GameState): GameTransition {
  return transition(state, [{ type: 'playPrompt', context: eventContext(state), wordId: currentRound(state).targetWordId }]);
}

function feedback(state: GameState): GameTransition {
  if (!state.feedback) throw new Error('反馈状态缺少已提交的答题记录');
  return transition(state, [{ type: 'showFeedback', context: eventContext(state), attempt: state.feedback }]);
}

function upgrade(state: GameState): GameTransition {
  return transition(state, [{ type: 'showUpgrade', context: eventContext(state), stage: state.weaponStage }]);
}

function advance(state: GameState, at: number): GameTransition {
  if (state.roundIndex === state.rounds.length - 1) {
    const result: SessionResult = Object.freeze({
      sessionId: state.sessionId, levelId: state.levelId, contentVersion: state.contentVersion,
      completed: true, attempts: state.attempts, completedAt: at,
    });
    return transition(update(state, { status: 'completed', result }), [{ type: 'sessionCompleted', result }]);
  }
  // nextRound 是本次转换内部步骤，不等待额外 UI 回调才进入下一题。
  return prompt(update(state, {
    status: 'presenting', roundIndex: state.roundIndex + 1,
    roundErrors: 0, replayCount: 0, hintUsed: false, feedback: null, upgradePending: false,
  }));
}

function choose(state: GameState, wordId: string): GameTransition {
  const round = currentRound(state);
  if (!round.optionWordIds.includes(wordId)) return transition(state);
  const correct = wordId === round.targetWordId;
  const attempt: Attempt = Object.freeze({
    roundId: round.id, phase: round.phase, targetWordId: round.targetWordId, selectedWordId: wordId,
    correct, hintUsed: state.hintUsed, replayCount: state.replayCount, attemptIndex: state.roundErrors + 1,
  });
  const roundErrors = state.roundErrors + (correct ? 0 : 1);
  const energy = state.energy + (correct && round.phase !== 'intro' ? MVP_RULES.energyPerCompletedQuestion : 0);
  const weaponStage = 1 + MVP_RULES.upgradeThresholds.filter((threshold) => energy >= threshold).length;
  return feedback(update(state, {
    status: 'feedback', feedback: attempt,
    attempts: Object.freeze([...state.attempts, attempt]), roundErrors,
    hintUsed: state.hintUsed || roundErrors >= MVP_RULES.hintAfterErrors,
    energy, weaponStage,
    shields: state.shields - (correct && round.phase === 'boss' ? 1 : 0),
    upgradePending: weaponStage > state.weaponStage,
  }));
}

function resume(state: GameState): GameTransition {
  if (state.status !== 'paused' || !state.pausedFrom) return transition(state);
  const restored = update(state, { status: state.pausedFrom, pausedFrom: null });
  if (restored.status === 'presenting') return prompt(restored);
  if (restored.status === 'feedback') return feedback(restored);
  if (restored.status === 'upgrade') return upgrade(restored);
  return transition(restored);
}

/** 纯状态转换：无微信 API、计时器、随机数或隐式时钟。无效/过期事件原样返回 state。 */
export function reduceGame(state: GameState, event: GameEvent): GameTransition {
  if (event.sessionId !== state.sessionId || state.status === 'completed') return transition(state);
  if (event.type === 'pause') {
    if (state.status === 'paused') return transition(state);
    return transition(update(state, { status: 'paused', pausedFrom: state.status }), [
      { type: 'stopPlaybackAndFeedback', sessionId: state.sessionId },
    ]);
  }
  if (event.type === 'resume') return resume(state);
  if (event.type === 'start') {
    return state.status === 'ready' ? prompt(update(state, { status: 'presenting' })) : transition(state);
  }
  if (state.status === 'paused' || event.roundId !== currentRound(state).id || event.revision !== state.revision) {
    return transition(state);
  }
  switch (event.type) {
    case 'audioReady':
      return state.status === 'presenting' ? transition(update(state, { status: 'awaitingAnswer' })) : transition(state);
    case 'audioFailed':
      return state.status === 'presenting' ? transition(update(state, { status: 'audioError' })) : transition(state);
    case 'retryAudio':
      return state.status === 'audioError' ? prompt(update(state, { status: 'presenting' })) : transition(state);
    case 'replay':
      return state.status === 'awaitingAnswer' || state.status === 'presenting'
        ? prompt(update(state, { status: 'presenting', replayCount: state.replayCount + 1 })) : transition(state);
    case 'choose':
      return state.status === 'awaitingAnswer' ? choose(state, event.wordId) : transition(state);
    case 'feedbackFinished':
      if (state.status !== 'feedback' || !state.feedback || !Number.isFinite(event.at) || event.at < 0) return transition(state);
      if (!state.feedback.correct) {
        return prompt(update(state, { status: 'presenting', replayCount: state.replayCount + 1 }));
      }
      if (state.upgradePending) return upgrade(update(state, { status: 'upgrade', upgradePending: false }));
      return advance(state, event.at);
    case 'upgradeFinished':
      return state.status === 'upgrade' && Number.isFinite(event.at) && event.at >= 0 ? advance(state, event.at) : transition(state);
  }
}
