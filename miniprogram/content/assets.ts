import type { ContentAsset } from '../game/types';
import { WORDS } from './words';

const IMAGE_CODES: Record<string, string> = {
  apple: '1F34E', banana: '1F34C', orange: '1F34A', grape: '1F347', watermelon: '1F349',
};

// 图片已逐张检查；音频已解码验证，仍待真人逐条试听，不以文件存在替代听审。
export const CONTENT_ASSETS: readonly ContentAsset[] = WORDS.flatMap((word) => [
  { path: word.imagePath, kind: 'image', wordId: word.id,
    source: `https://github.com/hfg-gmuend/openmoji/blob/17.0.0/color/618x618/${IMAGE_CODES[word.id]}.png`,
    rights: 'OpenMoji contributors；CC BY-SA 4.0；原图未修改；https://creativecommons.org/licenses/by-sa/4.0/',
    reviewStatus: 'approved' },
  { path: word.audioPath, kind: 'audio', wordId: word.id,
    source: `https://commons.wikimedia.org/wiki/File:En-${word.id === 'orange' ? 'uk' : 'us'}-${word.id}.ogg`,
    rights: word.id === 'orange'
      ? 'Association Shtooka, Judith Franck；CC BY 3.0 US；OGG 转 MP3；https://creativecommons.org/licenses/by/3.0/us/'
      : 'Dvortygirl；CC BY-SA 3.0；OGG 转 MP3；https://creativecommons.org/licenses/by-sa/3.0/',
    reviewStatus: 'pending' },
]);
