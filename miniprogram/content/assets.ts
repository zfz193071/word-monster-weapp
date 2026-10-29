import type { ContentAsset } from '../game/types';
import { WORDS } from './words';

// 只登记预期交付物，不将占位路径误当成已制作或已获授权的资源。
export const CONTENT_ASSETS: readonly ContentAsset[] = WORDS.flatMap((word) => [
  { path: word.imagePath, kind: 'image', wordId: word.id,
    source: '待制作', rights: '待核对', reviewStatus: 'pending' },
  { path: word.audioPath, kind: 'audio', wordId: word.id,
    source: '待制作', rights: '待核对', reviewStatus: 'pending' },
]);
