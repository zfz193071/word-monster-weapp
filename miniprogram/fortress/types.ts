// V2 contracts only. V1 game/types.ts remains historical and cannot restore these states.
export type SkillId = 'doubleShot' | 'fireRate' | 'bulletWidth';
export type RandomSource = () => number;
export interface Point { readonly x: number; readonly y: number }
export interface Rect extends Point { readonly width: number; readonly height: number }

export interface FortressWord {
  readonly id: string;
  readonly text: string;
  readonly meaningZh: string;
  readonly fruitImagePath: string;
  readonly audioPath: string;
}
export interface VisualAsset {
  readonly path: string;
  readonly wordId: string;
  readonly kind: 'image' | 'audio';
  readonly source: string;
  readonly rights: string;
  readonly reviewStatus: 'pending' | 'approved';
}
export interface MonsterVisual {
  readonly wordId: string;
  readonly portraitPath: string;
  readonly spritePath: string;
  // Dimensions, anchor and hitbox use the unscaled source image's pixel coordinates.
  readonly sourceSize: { readonly width: number; readonly height: number };
  readonly anchor: Point;
  readonly hitbox: Rect;
}
export interface SkillDefinition {
  readonly id: SkillId;
  readonly label: string;
  readonly maxLevel: number;
  // Absolute values at level 0..maxLevel; no ambiguous percentage stacking.
  readonly values: readonly number[];
}
export type SkillLevels = Readonly<Record<SkillId, number>>;
export interface FortressRules {
  readonly mode: 'fortress';
  readonly schemaVersion: 2;
  readonly contentVersion: 2;
  readonly wordIds: readonly string[];
  readonly waveCount: number;
  readonly monstersPerWave: number;
  readonly optionCount: number;
  readonly learning: {
    readonly tutorial: 'firstRunThenOptional';
    readonly hintAfterErrors: number;
    readonly unlimitedReplay: boolean;
    readonly damageOnWrongChoice: number;
  };
  readonly arena: {
    readonly width: number; readonly height: number; readonly baseTop: number;
    readonly playerY: number; readonly playerMinX: number; readonly playerMaxX: number;
  };
  readonly base: { readonly maxHp: number; readonly repairPerWave: number };
  readonly monster: {
    readonly maxHp: number; readonly spawnMinX: number; readonly spawnMaxX: number;
    readonly startY: number; readonly attackY: number; readonly speed: number;
    readonly attackIntervalMs: number; readonly attackDamage: number;
    readonly firstAttack: 'afterFullInterval';
  };
  readonly projectile: {
    readonly damage: number; readonly speed: number; readonly width: number;
    readonly height: number; readonly intervalMs: number; readonly spread: number;
    readonly piercing: boolean; readonly immediateFirstShot: boolean;
  };
  readonly skills: readonly SkillDefinition[];
  readonly skillChoiceCount: number;
  readonly skillWaveCount: number;
  readonly retirement: {
    readonly minShadowMs: number; readonly fadeMs: number;
    readonly audioFailure: 'retryOrContinue';
  };
  readonly resolutionOrder: 'hitsThenSurvivingMonsterAttacks';
  readonly progress: { readonly recentResultLimit: number; readonly saveFailures: boolean };
}
export interface MonsterSpawn {
  readonly monsterId: string;
  readonly wordId: string;
  readonly position: Point;
}
export interface WavePlan {
  readonly waveId: string;
  readonly index: number; // 0-based
  readonly targetWordId: string;
  readonly optionWordIds: readonly string[];
  readonly spawnPlan: readonly MonsterSpawn[];
}
export interface SessionPlan {
  readonly mode: 'fortress'; readonly schemaVersion: 2; readonly contentVersion: 2;
  readonly sessionId: string;
  readonly waves: readonly WavePlan[];
}
export interface WaveContext {
  readonly sessionId: string;
  readonly waveId: string;
  // Only low-frequency lifecycle/phase transitions invalidate asynchronous work.
  readonly generation: number;
}
export interface CombatContext extends WaveContext { readonly combatId: string }
export type MonsterStatus = 'entering' | 'alive' | 'attackingBase' | 'defeated' | 'retiring';
export interface MonsterState {
  readonly id: string; readonly wordId: string; readonly position: Point;
  readonly hp: number; readonly maxHp: number; readonly status: MonsterStatus;
  readonly attackRemainingMs: number;
  readonly attackSequence: number;
}
export interface ProjectileState {
  readonly id: string; readonly position: Point; readonly previousPosition: Point;
  readonly width: number; readonly height: number; readonly damage: number;
}
export interface CombatState {
  readonly context: CombatContext;
  readonly tick: number; // high-frequency simulation step, never a generation/token
  readonly status: 'fighting' | 'cleared' | 'baseDestroyed';
  readonly player: Point;
  readonly base: { readonly hp: number; readonly maxHp: number };
  readonly monsters: readonly MonsterState[];
  readonly projectiles: readonly ProjectileState[];
  readonly skills: SkillLevels;
  readonly shotRemainingMs: number;
  readonly nextProjectileSequence: number;
  readonly defeatedMonsterIds: readonly string[];
  readonly processedBaseAttackIds: readonly string[];
}
export type CombatEvent =
  | { readonly type: 'monsterDefeated'; readonly context: CombatContext; readonly tick: number; readonly monsterId: string; readonly wordId: string }
  | { readonly type: 'baseDamaged'; readonly context: CombatContext; readonly tick: number; readonly attackId: string; readonly monsterId: string; readonly hp: number }
  | { readonly type: 'baseDestroyed'; readonly context: CombatContext; readonly tick: number };
export interface SkillOffer {
  readonly offerId: string;
  readonly sessionId: string;
  readonly afterWaveId: string;
  readonly candidateIds: readonly [SkillId, SkillId];
}
export interface SkillSelection {
  readonly offerId: string;
  readonly skillId: SkillId;
  readonly levelAfter: number;
}
// Consuming an offer replaces this union once; reducer owns deduplication (#11).
export type SkillOfferState =
  | { readonly status: 'offered'; readonly offer: SkillOffer }
  | { readonly status: 'selected'; readonly offer: SkillOffer; readonly selection: SkillSelection };
export interface AttemptV2 {
  readonly sessionId: string; readonly waveId: string;
  readonly taskKind: 'listeningChoice'; // tutorial is separate, never an assessed attempt
  readonly targetWordId: string; readonly selectedWordId: string;
  readonly correct: boolean; readonly hintUsed: boolean;
  readonly attemptIndex: number; readonly replayCount: number;
}
export interface TutorialVisit {
  readonly wordId: string; readonly audioCompleted: boolean;
}
export interface WaveResult {
  readonly waveId: string; readonly wordId: string;
  readonly choiceCompleted: boolean;
  readonly defeatedMonsterIds: readonly string[];
  readonly outcome: 'cleared' | 'baseDestroyed';
  readonly retirementAudio: 'completed' | 'skippedAfterFailure' | 'notStarted';
}
interface ResultCommon {
  readonly mode: 'fortress'; readonly schemaVersion: 2; readonly contentVersion: 2;
  readonly sessionId: string; readonly endedAt: number;
  readonly attempts: readonly AttemptV2[];
  readonly waves: readonly WaveResult[];
  readonly skillChoices: readonly SkillSelection[];
}
export type SessionResultV2 = ResultCommon & (
  | { readonly outcome: 'victory'; readonly completed: true; readonly baseHp: number }
  | { readonly outcome: 'baseDestroyed'; readonly completed: false; readonly baseHp: 0 }
);
export interface LocalProgressV2 {
  readonly mode: 'fortress'; readonly schemaVersion: 2; readonly contentVersion: 2;
  readonly recentResults: readonly SessionResultV2[];
}
