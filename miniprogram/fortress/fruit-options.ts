import { FORTRESS_WORD_IDS } from './rules';
import type { RandomSource } from './types';

// Preserve the learning target, replace both distractors, then shuffle all cards.
export function createFruitOptions(target: string, previous: readonly string[], random: RandomSource, wordIds: readonly string[] = FORTRESS_WORD_IDS): readonly string[] {
  if (!wordIds.includes(target)) throw new Error('未知水果');
  const shuffle = (values: readonly string[]) => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机数必须位于 [0, 1)');
      const j = Math.floor(value * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const distractors = shuffle(wordIds.filter(id => id !== target && !previous.includes(id)));
  if (distractors.length < 2) throw new Error('没有足够的新干扰项');
  return Object.freeze(shuffle([target, ...distractors.slice(0, 2)]));
}
