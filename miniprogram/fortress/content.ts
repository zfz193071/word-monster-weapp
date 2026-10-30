import { CONTENT_ASSETS } from '../content/assets';
import { WORDS } from '../content/words';
import type { FortressWord, MonsterVisual, VisualAsset } from './types';

export const FORTRESS_WORDS: readonly FortressWord[] = Object.freeze(WORDS.map(word => Object.freeze({
  id: word.id, text: word.text, meaningZh: word.meaningZh,
  fruitImagePath: word.imagePath, audioPath: word.audioPath,
})));
export const MONSTER_ASSETS: readonly VisualAsset[] = Object.freeze(FORTRESS_WORDS.map(word => {
  const vector = word.id === 'banana' || word.id === 'grape';
  return Object.freeze({ path: `/assets/images/monsters/${word.id}.png`, wordId: word.id, kind: 'image' as const,
    source: vector ? 'https://openclipart.org/detail/183203/happy-fruits' : 'https://caz-bee.itch.io/cute-fruit-characters',
    rights: `${vector ? 'gem；原 SVG 分离角色并转 PNG' : 'CazBee；原始 PNG 未修改'}；CC0 1.0；https://creativecommons.org/publicdomain/zero/1.0/`,
    reviewStatus: 'approved' as const });
}));
export const FORTRESS_ASSETS: readonly VisualAsset[] = Object.freeze([...CONTENT_ASSETS, ...MONSTER_ASSETS].map(asset => Object.freeze({ ...asset })));
export const FORTRESS_MONSTERS: readonly MonsterVisual[] = Object.freeze(FORTRESS_WORDS.map(word => {
  const vector = word.id === 'banana' || word.id === 'grape';
  const size = vector ? 256 : 32;
  return Object.freeze({ wordId: word.id, portraitPath: `/assets/images/monsters/${word.id}.png`, spritePath: `/assets/images/monsters/${word.id}.png`,
    sourceSize: Object.freeze({ width: size, height: size }), anchor: Object.freeze({ x: size / 2, y: size / 2 }),
    hitbox: Object.freeze(vector ? { x: 8, y: 8, width: 240, height: 240 } : { x: 5, y: 4, width: 22, height: 24 }) });
}));
export function monsterDrawWidth(visual: MonsterVisual): number { return visual.sourceSize.width === 32 ? 112 : 80; }
