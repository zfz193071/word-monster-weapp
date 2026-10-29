import { CONTENT_VERSION, MVP_RULES } from '../game/rules';
import type { LevelConfig } from '../game/types';

export const FRUIT_LEVEL: LevelConfig = {
  id: 'fruit-island',
  contentVersion: CONTENT_VERSION,
  // 初遇顺序固定；辨词和守关分别随机遍历这五个词。
  wordIds: ['apple', 'banana', 'orange', 'grape', 'watermelon'],
  phases: [
    { phase: 'intro', optionCount: MVP_RULES.optionCounts.intro, shuffleWords: false },
    { phase: 'practice', optionCount: MVP_RULES.optionCounts.practice, shuffleWords: true },
    { phase: 'boss', optionCount: MVP_RULES.optionCounts.boss, shuffleWords: true },
  ],
};
