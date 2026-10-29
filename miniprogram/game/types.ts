export type Phase = 'intro' | 'practice' | 'boss';

export interface Word {
  readonly id: string;
  readonly text: string;
  readonly meaningZh: string;
  readonly imagePath: string;
  readonly audioPath: string;
}

export interface Round {
  readonly id: string;
  readonly phase: Phase;
  readonly targetWordId: string;
  readonly optionWordIds: readonly string[];
}

export interface PhaseConfig {
  readonly phase: Phase;
  readonly optionCount: number;
  readonly shuffleWords: boolean;
}

export interface LevelConfig {
  readonly id: string;
  readonly contentVersion: number;
  readonly wordIds: readonly string[];
  readonly phases: readonly PhaseConfig[];
}

export interface Attempt {
  readonly roundId: string;
  // 保存阶段，避免升级内容版本后再依赖旧配置推断教学记录。
  readonly phase: Phase;
  readonly targetWordId: string;
  readonly selectedWordId: string;
  readonly correct: boolean;
  readonly hintUsed: boolean;
  // 首次播放/答对揭示发音不计；主动和错误反馈的题目重播计入。
  readonly replayCount: number;
  readonly attemptIndex: number;
}

export interface SessionResult {
  readonly sessionId: string;
  readonly levelId: string;
  readonly contentVersion: number;
  readonly completed: boolean;
  readonly attempts: readonly Attempt[];
  readonly completedAt?: number;
}

export interface LocalProgress {
  readonly schemaVersion: number;
  readonly recentResults: readonly SessionResult[];
}

export type GameStatus =
  | 'ready' | 'presenting' | 'awaitingAnswer' | 'feedback'
  | 'nextRound' | 'upgrade' | 'completed' | 'paused' | 'audioError';

export interface RoundEventContext {
  readonly sessionId: string;
  readonly roundId: string;
  // 同题重试也会产生新一轮异步操作；丢弃旧音频/动画回调。
  readonly revision: number;
}

export type GameEvent =
  | { readonly type: 'start'; readonly sessionId: string }
  | ({ readonly type: 'choose'; readonly wordId: string } & RoundEventContext)
  | ({ readonly type: 'audioReady' | 'audioFailed' | 'replay' | 'retryAudio' } & RoundEventContext)
  | ({ readonly type: 'feedbackFinished' | 'upgradeFinished'; readonly at: number } & RoundEventContext)
  | { readonly type: 'pause'; readonly sessionId: string }
  | { readonly type: 'resume'; readonly sessionId: string };

export type AssetKind = 'image' | 'audio';
export type ReviewStatus = 'pending' | 'approved';

export interface ContentAsset {
  readonly path: string;
  readonly kind: AssetKind;
  readonly wordId: string;
  readonly source: string;
  readonly rights: string;
  readonly reviewStatus: ReviewStatus;
}
