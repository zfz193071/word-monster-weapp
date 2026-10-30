import { WORDS } from '../content/words';
import { currentRound, eventContext, reduceGame } from '../game/engine';
import type { GameEffect, GameState } from '../game/engine';
import type { GameEvent, RoundEventContext, SessionResult } from '../game/types';
import { MVP_RULES } from '../game/rules';
import { createAudioAdapter } from './audio';
import type { AudioOptions } from './audio';

type Audio = ReturnType<typeof createAudioAdapter>;
export interface BattleOptions {
  readonly render: (view: BattleView, state: GameState) => void;
  readonly createAudio?: (options: AudioOptions) => Audio;
  readonly schedule?: (callback: () => void, delay: number) => () => void;
  readonly now?: () => number;
  readonly onCompleted?: (result: SessionResult) => void;
}
export interface BattleView {
  readonly context: RoundEventContext;
  readonly status: GameState['status'];
  readonly phaseLabel: string;
  readonly phaseInstruction: string;
  readonly phaseProgress: string;
  readonly teachingWord: string;
  readonly shields: readonly { index: number; intact: boolean }[];
  readonly shieldsRemaining: number;
  readonly cards: readonly {
    key: string; wordId: string; imagePath: string; label: string; hint: boolean; attacked: boolean;
  }[];
  readonly canChoose: boolean;
  readonly canReplay: boolean;
  readonly message: string;
  readonly revealedWord: string;
  readonly imageFailed: boolean;
}

// Coordinates effects; only the pure engine decides answers and commits rewards.
export function createBattleController(initial: GameState, options: BattleOptions) {
  let state = initial;
  let disposed = false;
  let cancelFeedback: (() => void) | undefined;
  let feedback: { context: RoundEventContext; visualDone: boolean; audioDone: boolean } | undefined;
  const loadedImages = new Set<string>();
  let imageFailed = false;
  let revealFailed = false;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  });
  const word = (id: string) => {
    const found = WORDS.find((item) => item.id === id);
    if (!found) throw new Error(`未知词条：${id}`);
    return found;
  };
  const audio = (options.createAudio ?? createAudioAdapter)({ sessionId: state.sessionId, emit: dispatch });

  function matches(context: RoundEventContext, revision = true): boolean {
    return !disposed && context.sessionId === state.sessionId && context.roundId === currentRound(state).id &&
      (!revision || context.revision === state.revision);
  }
  function render(): void {
    if (disposed) return;
    const round = currentRound(state);
    const completed = state.status === 'completed';
    const phaseRounds = state.rounds.filter((item) => item.phase === round.phase);
    const correct = state.status === 'feedback' && state.feedback?.correct === true;
    const allImagesLoaded = round.optionWordIds.every((id) => loadedImages.has(id));
    const messages: Record<GameState['status'], string> = {
      ready: '准备出发', presenting: '听一听', awaitingAnswer: '点对应的水果图片',
      feedback: correct ? '找对了！' : '再听一次，试试看', nextRound: '准备下一题',
      upgrade: '武器升级了！', completed: '本次闯关完成', paused: '已暂停',
      audioError: '声音没能播放，请再试一次',
    };
    options.render({
      context: eventContext(state), status: state.status,
      phaseLabel: completed ? '水果小岛 · 已完成' : { intro: '初遇水果', practice: '辨词战斗', boss: '守关挑战' }[round.phase],
      phaseInstruction: completed ? '五层护盾已全部解除！' : {
        intro: '看图片，听读音，点一下认识它',
        practice: '听单词，从两张图片中找到它',
        boss: '听单词，选对图片解除一层护盾',
      }[round.phase],
      phaseProgress: completed ? '' : `${phaseRounds.findIndex((item) => item.id === round.id) + 1} / ${phaseRounds.length}`,
      teachingWord: round.phase === 'intro' && !completed ? word(round.targetWordId).text : '',
      shields: round.phase === 'boss' ? Array.from({ length: MVP_RULES.bossShields }, (_, index) => ({
        index, intact: index < state.shields,
      })) : [],
      shieldsRemaining: state.shields,
      cards: completed ? [] : round.optionWordIds.map((id, index) => ({ key: `${round.id}-${id}`, wordId: id, imagePath: word(id).imagePath,
        label: `选项 ${index + 1}`, hint: state.hintUsed && id === round.targetWordId,
        attacked: correct && id === state.feedback?.selectedWordId,
      })),
      canChoose: state.status === 'awaitingAnswer' && allImagesLoaded && !imageFailed,
      canReplay: state.status === 'presenting' || state.status === 'awaitingAnswer',
      message: imageFailed ? '图片加载失败，请返回首页后重试' : revealFailed ? '读音没能播放，继续下一题' :
        state.status === 'awaitingAnswer' && !allImagesLoaded ? '图片加载中' : messages[state.status],
      revealedWord: correct ? word(round.targetWordId).text : '', imageFailed,
    }, state);
  }
  function clearFeedback(): void {
    cancelFeedback?.(); cancelFeedback = undefined; feedback = undefined;
  }
  function completeFeedback(): void {
    if (!feedback || !feedback.visualDone || !feedback.audioDone) return;
    const context = feedback.context;
    if (matches(context)) dispatch({ ...context, type: 'feedbackFinished', at: now() });
  }
  function visualFinished(context: RoundEventContext, wordId: string): void {
    if (!matches(context) || !feedback || !state.feedback?.correct || state.feedback.selectedWordId !== wordId) return;
    feedback.visualDone = true;
    completeFeedback();
  }
  function execute(effect: GameEffect): void {
    switch (effect.type) {
      case 'playPrompt':
        audio.playPrompt(word(effect.wordId).audioPath, effect.context);
        break;
      case 'showFeedback': {
        feedback = { context: effect.context, visualDone: false, audioDone: !effect.attempt.correct };
        cancelFeedback = schedule(() => {
          if (!matches(effect.context) || !feedback) return;
          feedback.visualDone = true;
          completeFeedback();
        }, 900);
        if (effect.attempt.correct) {
          audio.playReveal(word(effect.attempt.targetWordId).audioPath, effect.context, (success) => {
            if (!matches(effect.context) || !feedback) return;
            feedback.audioDone = true;
            revealFailed = !success;
            render(); completeFeedback();
          });
        }
        break;
      }
      case 'showUpgrade':
        // Basic transition only; full upgrade presentation is owned by #11.
        cancelFeedback = schedule(() => {
          if (matches(effect.context)) dispatch({ ...effect.context, type: 'upgradeFinished', at: now() });
        }, 900);
        break;
      case 'stopPlaybackAndFeedback':
        audio.stop(); clearFeedback();
        break;
      case 'sessionCompleted':
        audio.stop();
        options.onCompleted?.(effect.result);
        break;
    }
  }
  function dispatch(event: GameEvent): void {
    if (disposed) return;
    const result = reduceGame(state, event);
    if (result.state === state) return;
    clearFeedback();
    if (currentRound(result.state).id !== currentRound(state).id) {
      loadedImages.clear(); imageFailed = false;
    }
    state = result.state;
    revealFailed = false;
    render();
    for (const effect of result.effects) execute(effect);
  }
  render();
  return {
    start: () => dispatch({ type: 'start', sessionId: state.sessionId }),
    choose: (context: RoundEventContext, wordId: string) => {
      if (imageFailed || !currentRound(state).optionWordIds.every((id) => loadedImages.has(id))) return;
      dispatch({ ...context, type: 'choose', wordId });
    },
    replay: (context: RoundEventContext) => dispatch({ ...context, type: 'replay' }),
    retryAudio: (context: RoundEventContext) => dispatch({ ...context, type: 'retryAudio' }),
    imageResult: (context: RoundEventContext, wordId: string, success: boolean) => {
      if (state.status === 'completed' || !matches(context, false) || !currentRound(state).optionWordIds.includes(wordId)) return;
      if (success) loadedImages.add(wordId); else imageFailed = true;
      render();
    },
    visualFinished,
    pause: () => dispatch({ type: 'pause', sessionId: state.sessionId }),
    resume: () => dispatch({ type: 'resume', sessionId: state.sessionId }),
    dispose: () => { disposed = true; clearFeedback(); audio.dispose(); },
  };
}
