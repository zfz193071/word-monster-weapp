import { assertValidContent, ContentValidationError, validateRounds } from '../content/validation';
import type { ContentAsset, LevelConfig, Round, Word } from './types';

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机数必须位于 [0, 1)');
    const other = Math.floor(value * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// 每局仅生成一次；引擎重试沿用同一个 Round，不重新洗牌。
export function createRounds(
  words: readonly Word[], level: LevelConfig, assets: readonly ContentAsset[],
  random: () => number = Math.random,
): readonly Round[] {
  assertValidContent(words, level, assets);
  const rounds: Round[] = [];
  for (const config of level.phases) {
    const targets = config.shuffleWords ? shuffle(level.wordIds, random) : [...level.wordIds];
    for (const targetWordId of targets) {
      const distractors = config.optionCount === 1 ? [] : shuffle(
        level.wordIds.filter((id) => id !== targetWordId), random,
      ).slice(0, config.optionCount - 1);
      rounds.push(Object.freeze({
        id: `${config.phase}-${targetWordId}`,
        phase: config.phase,
        targetWordId,
        optionWordIds: Object.freeze(shuffle([targetWordId, ...distractors], random)),
      }));
    }
  }
  const issues = validateRounds(rounds, level);
  if (issues.length) throw new ContentValidationError(issues);
  return Object.freeze(rounds);
}
