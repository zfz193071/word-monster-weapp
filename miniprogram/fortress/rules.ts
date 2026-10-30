import type { FortressRules, SkillDefinition } from './types';

export const FORTRESS_MODE = 'fortress';
export const FORTRESS_SCHEMA_VERSION = 2;
export const FORTRESS_CONTENT_VERSION = 2;
// Dedicated namespace: V1 is neither migrated into battles nor included in V2 statistics.
export const FORTRESS_PROGRESS_KEY = 'word-monster:fortress:progress:v2';
export const FORTRESS_WORD_IDS: readonly string[] = Object.freeze(['apple', 'banana', 'orange', 'grape', 'watermelon']);
export const FORTRESS_SKILLS: readonly SkillDefinition[] = Object.freeze([
  Object.freeze({ id: 'doubleShot', label: '双发', maxLevel: 3, values: Object.freeze([1, 2, 3, 4]) }),
  Object.freeze({ id: 'fireRate', label: '射速提升', maxLevel: 3, values: Object.freeze([500, 400, 300, 200]) }),
  Object.freeze({ id: 'bulletWidth', label: '子弹变宽', maxLevel: 3, values: Object.freeze([8, 12, 16, 20]) }),
]);

// User confirmed A1–C8 in docs/mvp-v2-rules-proposal.md on 2026-10-30.
export const FORTRESS_RULES: FortressRules = Object.freeze({
  mode: FORTRESS_MODE, schemaVersion: FORTRESS_SCHEMA_VERSION, contentVersion: FORTRESS_CONTENT_VERSION,
  wordIds: FORTRESS_WORD_IDS, waveCount: 5, monstersPerWave: 1, optionCount: 2,
  learning: Object.freeze({ tutorial: 'firstRunThenOptional', hintAfterErrors: 2, unlimitedReplay: true, damageOnWrongChoice: 0 }),
  arena: Object.freeze({ width: 360, height: 560, baseTop: 480, playerY: 510, playerMinX: 24, playerMaxX: 336 }),
  base: Object.freeze({ maxHp: 5, repairPerWave: 0 }),
  monster: Object.freeze({ maxHp: 8, spawnMinX: 48, spawnMaxX: 312, startY: -32, attackY: 448, speed: 40,
    attackIntervalMs: 2000, attackDamage: 1, firstAttack: 'afterFullInterval' }),
  projectile: Object.freeze({ damage: 1, speed: 480, width: 8, height: 18, intervalMs: 500, spread: 16,
    piercing: false, immediateFirstShot: true }),
  skills: FORTRESS_SKILLS, skillChoiceCount: 2, skillWaveCount: 4,
  retirement: Object.freeze({ minShadowMs: 800, fadeMs: 250, audioFailure: 'retryOrContinue' }),
  resolutionOrder: 'hitsThenSurvivingMonsterAttacks',
  progress: Object.freeze({ recentResultLimit: 20, saveFailures: true }),
});
