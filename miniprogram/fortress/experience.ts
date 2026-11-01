import type { CombatEvent } from './types';

export interface ExperienceRules {
  readonly experiencePerKill: number;
  // Explicit cumulative thresholds for reaching level 2, 3, ...; no default balance table.
  readonly levelThresholds: readonly number[];
}
export interface ExperienceView { readonly total: number; readonly level: number; readonly upgrades: readonly number[] }

// Own one tracker per run. Only actual combat defeat events award experience.
export function createExperience(sessionId: string, rules: ExperienceRules) {
  if (!sessionId.trim() || !Number.isSafeInteger(rules.experiencePerKill) || rules.experiencePerKill <= 0
    || !rules.levelThresholds.length || rules.levelThresholds.some((n, i, all) => !Number.isSafeInteger(n) || n <= (i ? all[i - 1] : 0))) {
    throw new Error('必须显式提供有效的击杀经验和递增升级阈值');
  }
  const thresholds = [...rules.levelThresholds];
  const experiencePerKill = rules.experiencePerKill;
  const defeated = new Set<string>();
  let total = 0;
  let level = 1;
  let disposed = false;
  return {
    get view(): ExperienceView { return Object.freeze({ total, level, upgrades: Object.freeze([]) }); },
    record(events: readonly CombatEvent[]): ExperienceView {
      const upgrades: number[] = [];
      if (!disposed) for (const event of events) {
        if (event.type !== 'monsterDefeated' || event.context.sessionId !== sessionId || !event.monsterId) continue;
        const key = JSON.stringify([event.context.combatId, event.monsterId]);
        if (defeated.has(key)) continue;
        if (!Number.isSafeInteger(total + experiencePerKill)) throw new RangeError('经验超过安全整数范围');
        defeated.add(key); total += experiencePerKill;
        while (level <= thresholds.length && total >= thresholds[level - 1]) upgrades.push(++level);
      }
      return Object.freeze({ total, level, upgrades: Object.freeze(upgrades) });
    },
    dispose() { disposed = true; defeated.clear(); },
  };
}
