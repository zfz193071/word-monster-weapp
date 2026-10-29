import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CONTENT_ASSETS } from '../miniprogram/content/assets';
import { FRUIT_LEVEL } from '../miniprogram/content/levels';
import { WORDS } from '../miniprogram/content/words';
import { assertValidContent } from '../miniprogram/content/validation';
import { createRounds } from '../miniprogram/game/rounds';

async function main(): Promise<void> {
  assertValidContent(WORDS, FRUIT_LEVEL, CONTENT_ASSETS);
  const rounds = createRounds(WORDS, FRUIT_LEVEL, CONTENT_ASSETS);
  console.log(`内容配置通过：${WORDS.length} 词、${rounds.length} 题、${CONTENT_ASSETS.length} 个资源引用。`);

  if (process.argv.includes('--assets')) {
    const failures: string[] = [];
    for (const asset of CONTENT_ASSETS) {
      const path = fileURLToPath(new URL(`../miniprogram${asset.path}`, import.meta.url));
      try {
        const file = await stat(path);
        if (!file.isFile() || file.size === 0) failures.push(`${asset.path}: 不是有效的非空文件`);
      } catch {
        failures.push(`${asset.path}: 文件缺失或无法读取`);
      }
      if (asset.reviewStatus !== 'approved') failures.push(`${asset.path}: 尚未审校`);
      if (!asset.source.trim() || !asset.rights.trim() || asset.source.startsWith('待') || asset.rights.startsWith('待')) {
        failures.push(`${asset.path}: 来源或使用权限未核对`);
      }
    }
    if (failures.length) {
      console.error(`资源交付检查未通过：\n${failures.join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log('词汇资源文件存在且清单已批准；播放、图音匹配与真机效果仍按素材/集成验收执行。');
    }
  } else {
    console.log('这是配置检查，不代表图片/音频已制作或已审校；交付前另运行 npm run check:assets。');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
