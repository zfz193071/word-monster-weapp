import { CONTENT_ASSETS } from '../content/assets';
import { WORDS } from '../content/words';
import type { FortressWord, MonsterVisual, VisualAsset } from './types';

export const FORTRESS_WORDS: readonly FortressWord[] = Object.freeze(WORDS.map(word => Object.freeze({
  id: word.id, text: word.text, meaningZh: word.meaningZh,
  fruitImagePath: word.imagePath, audioPath: word.audioPath,
})));
export const FORTRESS_ASSETS: readonly VisualAsset[] = Object.freeze(CONTENT_ASSETS.map(asset => Object.freeze({ ...asset })));
// #4 is unfinished. No made-up paths or ordinary fruit images disguised as monsters.
export const FORTRESS_MONSTERS: readonly MonsterVisual[] = Object.freeze([]);
