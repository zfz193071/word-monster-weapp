export const CONTENT_VERSION = 1;
export const SCHEMA_VERSION = 1;

// 来自 architecture.md 第 14 节已确认规则，不包含未确认的伤害、血量或限时。
export const MVP_RULES = {
  wordCount: 5,
  optionCounts: { intro: 1, practice: 2, boss: 3 },
  hintAfterErrors: 2,
  energyPerCompletedQuestion: 1,
  introEnergy: 0,
  upgradeThresholds: [3, 7],
  weaponStageCount: 3,
  bossShields: 5,
  completedEnergy: 10,
  recentResultLimit: 20,
} as const;
