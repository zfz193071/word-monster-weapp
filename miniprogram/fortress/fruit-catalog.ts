import { WORDS } from '../content/words';
import type { FortressWord, VisualAsset } from './types';

export const EXTRA_FRUITS = [
  { id: 'pear', meaningZh: '梨', emoji: '1F350' },
  { id: 'strawberry', meaningZh: '草莓', emoji: '1F353' },
  { id: 'cherry', meaningZh: '樱桃', emoji: '1F352' },
  { id: 'pineapple', meaningZh: '菠萝', emoji: '1F34D' },
  { id: 'kiwi', meaningZh: '猕猴桃', emoji: '1F95D' },
  { id: 'peach', meaningZh: '桃子', emoji: '1F351' },
] as const;
export const BATTLE_WORDS: readonly FortressWord[] = Object.freeze([
  ...WORDS.map(word => ({ id: word.id, text: word.text, meaningZh: word.meaningZh, fruitImagePath: word.imagePath, audioPath: word.audioPath })),
  ...EXTRA_FRUITS.map(word => ({ id: word.id, text: word.id, meaningZh: word.meaningZh, fruitImagePath: `/assets/images/${word.id}.png`, audioPath: `/assets/audio/${word.id}.mp3` })),
].map(word => Object.freeze({ ...word, audioPath: `/assets/audio/learn-${word.id}.mp3` })));
export const EXTRA_IMAGE_ASSETS: readonly VisualAsset[] = EXTRA_FRUITS.map(word => ({
  path: `/assets/images/${word.id}.png`, wordId: word.id, kind: 'image',
  source: `https://github.com/hfg-gmuend/openmoji/blob/17.0.0/color/618x618/${word.emoji}.png`,
  rights: 'OpenMoji contributors；CC BY-SA 4.0；原图未修改；https://creativecommons.org/licenses/by-sa/4.0/', reviewStatus: 'approved',
}));

export const EXTRA_AUDIO_ASSETS: readonly VisualAsset[] = EXTRA_FRUITS.flatMap(word => {
  const author = word.id === 'kiwi' ? 'Commander Keane' : 'Dvortygirl';
  const license = word.id === 'kiwi' ? '4.0' : '3.0';
  const source = `https://commons.wikimedia.org/wiki/File:En-${word.id === 'kiwi' ? 'au' : 'us'}-${word.id}.ogg`;
  return ['', 'zombie-'].map(prefix => ({ path: `/assets/audio/${prefix}${word.id}.mp3`, wordId: word.id, kind: 'audio' as const, source,
    rights: `${author}；CC BY-SA ${license}；${prefix ? '降低音高、减速、喉音颤动、软饱和与短混响' : 'OGG转MP3，保留原始词音'}；https://creativecommons.org/licenses/by-sa/${license}/`, reviewStatus: 'pending' as const }));
});

export const LEARNING_VOICE_ASSETS: readonly VisualAsset[] = BATTLE_WORDS.map(word => ({
  path: word.audioPath, wordId: word.id, kind: 'audio',
  source: 'https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium',
  rights: 'Piper LJSpeech 英文合成女声；模型仓库 MIT；LJSpeech 原始录音公有领域；生成与响度处理见 docs/learning-voice-manifest.json',
  reviewStatus: 'pending',
}));
