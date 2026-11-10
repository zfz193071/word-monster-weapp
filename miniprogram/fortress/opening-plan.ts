import { enemyLayer } from './army';
import { houseForLevel } from '../houses/catalog';
import { coinRulesFor, difficultyFor } from './difficulty';
import type { DifficultyId } from './difficulty';
import { weaponForLevel } from '../weapons/catalog';
import { getLevel } from './levels';
import { createOpeningEncounter, openingMonsterCount, OPENING_WAVE_COUNT } from './opening-encounter';
import type { RandomSource, SessionPlan } from './types';

export function createOpeningPlan(sessionId: string, random: RandomSource, levelId = 1, weaponLevel = 1, difficulty: DifficultyId = 'normal', houseLevel = 1): SessionPlan {
  difficultyFor(difficulty);
  houseForLevel(houseLevel);
  weaponForLevel(weaponLevel);
  if (!sessionId.trim()) throw new Error('会话不能为空');
  const shuffle = (ids: readonly string[]) => {
    const out = [...ids];
    for (let i = out.length - 1; i > 0; i--) {
      const value = random(); if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('随机数无效');
      const j = Math.floor(value * (i + 1)); [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const words = getLevel(levelId).words.map(word => word.id);
  const targets: string[] = [];
  while (targets.length < OPENING_WAVE_COUNT) {
    const cycle = shuffle(words);
    if (cycle[0] === targets[targets.length - 1]) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    targets.push(...cycle.slice(0, OPENING_WAVE_COUNT - targets.length));
  }
  return Object.freeze({ kind: 'fruit-defense', levelId, weaponLevel, houseLevel, difficulty, mode: 'fortress', schemaVersion: 2, contentVersion: 2, sessionId,
    waves: Object.freeze(targets.map((targetWordId, index) => {
      const combat = createOpeningEncounter(sessionId, targetWordId, 0, index, undefined, undefined, targets.slice(0, index), levelId, weaponLevel, [], difficulty, undefined, houseLevel);
      return Object.freeze({ waveId: `${sessionId}:wave:${index + 1}`, index, targetWordId,
        optionWordIds: Object.freeze(shuffle([targetWordId, ...shuffle(words.filter(id => id !== targetWordId)).slice(0, 2)])),
        spawnPlan: Object.freeze(combat.monsters.map(monster => Object.freeze({ monsterId: monster.id, wordId: monster.wordId, enemyType: monster.enemyType, position: monster.position, spawnAtMs: monster.spawnAtMs, ...(monster.boss ? { boss: true, bossKind: monster.bossKind, soldierDropCount: monster.soldierDropCount } : {}), dropCoins: monster.dropCoins }))),
      });
    })) });
}
export function validateOpeningPlan(plan: SessionPlan): void {
  const coins = coinRulesFor(plan.difficulty);
  houseForLevel(plan.houseLevel ?? 1);
  weaponForLevel(plan.weaponLevel ?? 1);
  if (plan.kind !== 'fruit-defense' || !plan.sessionId.trim() || plan.waves.length !== OPENING_WAVE_COUNT) throw new Error('新版计划无效');
  const words = getLevel(plan.levelId).words;
  const previousIds = (plan.levelId ?? 1) > 1 ? getLevel(plan.levelId! - 1).words.map(word => word.id) : [];
  for (const [index, wave] of plan.waves.entries()) {
    if (wave.index !== index || wave.waveId !== `${plan.sessionId}:wave:${index + 1}` || !words.some(word => word.id === wave.targetWordId)
      || wave.spawnPlan.length !== openingMonsterCount(index, plan.levelId) || (index && wave.targetWordId === plan.waves[index - 1].targetWordId)) throw new Error('新版波次无效');
  }
  for (let start = 0; start < plan.waves.length; start += words.length) {
    const cycle = plan.waves.slice(start, start + words.length);
    if (new Set(cycle.map(wave => wave.targetWordId)).size !== cycle.length) throw new Error('词汇学习与复习顺序无效');
  }
  plan.waves.forEach(wave => wave.spawnPlan.forEach(enemyLayer));
  const ironWaves = plan.waves.filter(wave => wave.spawnPlan.some(spawn => spawn.boss && spawn.bossKind !== 'grand'));
  if (ironWaves.length > 1 || ironWaves.some(wave => wave.index < 9 || wave.index > 17 || wave.spawnPlan.filter(spawn => spawn.boss).length !== 1)) throw new Error('铁桶出场规则不匹配');
  for (const wave of plan.waves) {
    const grand = wave.spawnPlan.filter(spawn => spawn.bossKind === 'grand');
    if (grand.length !== (wave.index === 18 ? 1 : 0) || grand.some(spawn => !spawn.boss || !words.some(word => word.id === spawn.wordId)
      || spawn.spawnAtMs !== Math.max(...wave.spawnPlan.map(item => item.spawnAtMs ?? 0)))) throw new Error('大Boss出场规则不匹配');
    if (wave.spawnPlan.filter(spawn => previousIds.includes(spawn.wordId)).length !== (previousIds.length ? Math.round(wave.spawnPlan.length * .3) : 0)
      || wave.optionWordIds.length !== 3 || new Set(wave.optionWordIds).size !== 3 || !wave.optionWordIds.includes(wave.targetWordId)
      || wave.optionWordIds.some(id => !words.some(word => word.id === id))
      || wave.spawnPlan.some(spawn => (!previousIds.includes(spawn.wordId) && !plan.waves.slice(0, wave.index + 1).some(previous => previous.targetWordId === spawn.wordId))
        || (spawn.bossKind === 'grand' ? spawn.dropCoins !== 0 || spawn.soldierDropCount !== undefined : spawn.boss ? !Number.isInteger(spawn.dropCoins) || spawn.dropCoins! < coins.bossMin || spawn.dropCoins! > coins.bossMax
          || !Number.isInteger(spawn.soldierDropCount) || spawn.soldierDropCount! < 0 || spawn.soldierDropCount! > 3
          : spawn.dropCoins !== 0 && spawn.dropCoins !== coins.normal))) throw new Error('关卡词汇或掉落规则不匹配');
  }
}
