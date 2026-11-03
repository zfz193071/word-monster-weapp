import { LEVEL_ASSETS } from './level-assets-manifest';
import { BATTLE_WORDS, EXTRA_IMAGE_ASSETS, EXTRA_AUDIO_ASSETS, LEARNING_VOICE_ASSETS } from './fruit-catalog';
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
export const ZOMBIE_VOICE_ASSETS: readonly VisualAsset[] = Object.freeze(BATTLE_WORDS.map(word => Object.freeze({
  path: `/assets/audio/zombie-${word.id}.mp3`, wordId: word.id, kind: 'audio' as const,
  source: 'https://huggingface.co/hexgrad/Kokoro-82M',
  rights: 'Kokoro v1.0 英文合成男声 am_michael；模型 Apache-2.0；响度规范化、播放速率0.8；生成记录见 docs/defeat-voice-manifest.json',
  reviewStatus: 'pending' as const,
})));
export const FORTRESS_ASSETS: readonly VisualAsset[] = Object.freeze([...CONTENT_ASSETS, ...MONSTER_ASSETS, ...ZOMBIE_VOICE_ASSETS.filter(asset => FORTRESS_WORDS.some(word => word.id === asset.wordId))].map(asset => Object.freeze({ ...asset })));
export const FORTRESS_MONSTERS: readonly MonsterVisual[] = Object.freeze(FORTRESS_WORDS.map(word => {
  const vector = word.id === 'banana' || word.id === 'grape';
  const size = vector ? 256 : 32;
  return Object.freeze({ wordId: word.id, portraitPath: `/assets/images/monsters/${word.id}.png`, spritePath: `/assets/images/monsters/${word.id}.png`,
    sourceSize: Object.freeze({ width: size, height: size }), anchor: Object.freeze({ x: size / 2, y: size / 2 }),
    hitbox: Object.freeze(vector ? { x: 8, y: 8, width: 240, height: 240 } : { x: 5, y: 4, width: 22, height: 24 }) });
}));
export function monsterDrawWidth(visual: MonsterVisual): number { return visual.sourceSize.width === 32 ? 112 : 80; }

export const BATTLE_ASSETS: readonly VisualAsset[] = Object.freeze([...LEVEL_ASSETS, ...FORTRESS_ASSETS, ...EXTRA_IMAGE_ASSETS, ...EXTRA_AUDIO_ASSETS, ...ZOMBIE_VOICE_ASSETS.filter(asset => !FORTRESS_WORDS.some(word => word.id === asset.wordId)), ...LEARNING_VOICE_ASSETS,
  { path: '/assets/audio/victory-applause.mp3', wordId: 'victory-applause', kind: 'audio', source: 'https://sfxmint.com/sounds/crowd-applause-58', rights: 'SFXMint AI生成短掌声；CC0 1.0；原始文件按24kHz单声道32kbps转码，来源及哈希见 docs/victory-applause-manifest.json', reviewStatus: 'pending' },
  { path: '/assets/audio/victory-praise.mp3', wordId: 'victory', kind: 'audio', source: 'https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh', rights: 'Kokoro v1.1-zh（Apache-2.0）生成中文鼓励语音；音色zf_001；生成记录见 docs/victory-praise-manifest.json', reviewStatus: 'pending' }]);
