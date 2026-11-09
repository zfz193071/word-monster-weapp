import type { ContentAsset } from '../game/types';
import { WORDS } from './words';

// 图片已逐张检查；音频已解码验证，仍待真人逐条试听，不以文件存在替代听审。
export const CONTENT_ASSETS: readonly ContentAsset[] = WORDS.flatMap((word) => [
  { path: word.imagePath, kind: 'image', wordId: word.id,
    source: 'docs/assets/original/fruit-batch-imagegen.md',
    rights: '项目内置 image_gen 生成，2026-11-09；参考项目苹果样张，保留alpha缩放至256px；非独占版权声明',
    reviewStatus: 'approved' },
  { path: word.audioPath, kind: 'audio', wordId: word.id,
    source: `https://commons.wikimedia.org/wiki/File:En-${word.id === 'orange' ? 'uk' : 'us'}-${word.id}.ogg`,
    rights: word.id === 'orange'
      ? 'Association Shtooka, Judith Franck；CC BY 3.0 US；OGG 转 MP3；https://creativecommons.org/licenses/by/3.0/us/'
      : 'Dvortygirl；CC BY-SA 3.0；OGG 转 MP3；https://creativecommons.org/licenses/by-sa/3.0/',
    reviewStatus: 'pending' },
]);
