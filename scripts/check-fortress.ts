import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FORTRESS_ASSETS, FORTRESS_MONSTERS, FORTRESS_WORDS } from '../miniprogram/fortress/content';
import { createSeededRandom, createSessionPlan } from '../miniprogram/fortress/plans';
import { FORTRESS_RULES } from '../miniprogram/fortress/rules';
import { assertNoFortressIssues, validateFortressContent, validateFortressRules, validateSessionPlan } from '../miniprogram/fortress/validation';

async function main(): Promise<void> {
  assertNoFortressIssues(validateFortressRules(FORTRESS_RULES));
  const plan = createSessionPlan('validation-session', createSeededRandom(19));
  assertNoFortressIssues(validateSessionPlan(plan));
  console.log('V2 已确认规则与确定性计划通过：5 波 / 每波 1 怪 / 2 选项 / 3 类技能。');
  const readiness = validateFortressContent(FORTRESS_WORDS, FORTRESS_MONSTERS, FORTRESS_ASSETS, true);
  if (process.argv.includes('--assets')) {
    for (const asset of FORTRESS_ASSETS) {
      try {
        const file = await stat(fileURLToPath(new URL(`../miniprogram${asset.path}`, import.meta.url)));
        if (!file.isFile() || !file.size) readiness.push({ path: asset.path, message: '资源不是非空文件' });
      } catch { readiness.push({ path: asset.path, message: '资源缺失或不可读取' }); }
    }
    assertNoFortressIssues(readiness);
    console.log('V2 词汇/怪物资源清单、审校与文件检查通过，真机效果仍需验收。');
  } else if (readiness.length) {
    console.log(`V2 资源尚未就绪（${readiness.length} 项），本命令不代表可开战。运行 npm run check:fortress:assets 查看缺项。`);
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
