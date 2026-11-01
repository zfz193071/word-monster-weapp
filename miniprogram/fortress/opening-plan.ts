import { BATTLE_WORDS } from './fruit-catalog';
import { createOpeningEncounter, OPENING_WAVE_COUNT } from './opening-encounter';
import type { RandomSource, SessionPlan } from './types';

export function createOpeningPlan(sessionId: string, random: RandomSource): SessionPlan {
  if (!sessionId.trim()) throw new Error('会话不能为空');
  const shuffle = (ids: readonly string[]) => {
    const out = [...ids];
    for (let i = out.length - 1; i > 0; i--) {
      const value = random(); if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('随机数无效');
      const j = Math.floor(value * (i + 1)); [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const words = BATTLE_WORDS.map(word => word.id);
  const first = shuffle(words); const review = shuffle(words);
  if (review[0] === first[first.length - 1]) [review[0], review[1]] = [review[1], review[0]];
  const targets = [...first, ...review].slice(0, OPENING_WAVE_COUNT);
  return Object.freeze({ kind: 'fruit-defense', mode: 'fortress', schemaVersion: 2, contentVersion: 2, sessionId,
    waves: Object.freeze(targets.map((targetWordId, index) => {
      const combat = createOpeningEncounter(sessionId, targetWordId, 0, index, undefined, undefined, targets.slice(0, index));
      return Object.freeze({ waveId: `${sessionId}:wave:${index + 1}`, index, targetWordId,
        optionWordIds: Object.freeze(shuffle([targetWordId, ...shuffle(words.filter(id => id !== targetWordId)).slice(0, 2)])),
        spawnPlan: Object.freeze(combat.monsters.map(monster => Object.freeze({ monsterId: monster.id, wordId: monster.wordId, position: monster.position, spawnAtMs: monster.spawnAtMs }))),
      });
    })) });
}
export function validateOpeningPlan(plan: SessionPlan): void {
  if (plan.kind !== 'fruit-defense' || !plan.sessionId.trim() || plan.waves.length !== OPENING_WAVE_COUNT) throw new Error('新版计划无效');
  for (const [index, wave] of plan.waves.entries()) {
    if (wave.index !== index || wave.waveId !== `${plan.sessionId}:wave:${index + 1}` || !BATTLE_WORDS.some(word => word.id === wave.targetWordId)
      || wave.spawnPlan.length !== 3 + 2 * index || (index && wave.targetWordId === plan.waves[index - 1].targetWordId)) throw new Error('新版波次无效');
  }
  if (new Set(plan.waves.slice(0, BATTLE_WORDS.length).map(wave => wave.targetWordId)).size !== BATTLE_WORDS.length
    || new Set(plan.waves.slice(BATTLE_WORDS.length).map(wave => wave.targetWordId)).size !== OPENING_WAVE_COUNT - BATTLE_WORDS.length) throw new Error('词汇学习与复习顺序无效');
}
