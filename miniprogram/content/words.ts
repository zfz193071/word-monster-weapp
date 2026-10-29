import type { Word } from '../game/types';

// 词表已确认；资源路径是交付约定，资源审校状态由 assets.ts 单独记录。
export const WORDS: readonly Word[] = [
  { id: 'apple', text: 'apple', meaningZh: '苹果', imagePath: '/assets/images/apple.png', audioPath: '/assets/audio/apple.mp3' },
  { id: 'banana', text: 'banana', meaningZh: '香蕉', imagePath: '/assets/images/banana.png', audioPath: '/assets/audio/banana.mp3' },
  { id: 'orange', text: 'orange', meaningZh: '橙子', imagePath: '/assets/images/orange.png', audioPath: '/assets/audio/orange.mp3' },
  { id: 'grape', text: 'grape', meaningZh: '葡萄', imagePath: '/assets/images/grape.png', audioPath: '/assets/audio/grape.mp3' },
  { id: 'watermelon', text: 'watermelon', meaningZh: '西瓜', imagePath: '/assets/images/watermelon.png', audioPath: '/assets/audio/watermelon.mp3' },
];
