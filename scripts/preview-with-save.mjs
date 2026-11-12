import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SAVE_KEYS } from '../miniprogram/preview/save-transfer.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const seedPath = new URL('../miniprogram/preview/save-seed.ts', import.meta.url);
const lockPath = new URL('../artifacts/preview-save.lock', import.meta.url);
const soldierOption = process.argv.find(arg => arg.startsWith('--soldiers='));
const previewSoldiers = soldierOption === undefined ? undefined : Number(soldierOption.slice('--soldiers='.length));
const flagOption = process.argv.find(arg => arg.startsWith('--flags='));
const previewFlags = flagOption === undefined ? undefined : Number(flagOption.slice('--flags='.length));
if (previewSoldiers !== undefined && (!Number.isSafeInteger(previewSoldiers) || previewSoldiers < 0)) {
  throw new Error('--soldiers 必须是非负整数');
}
if (previewFlags !== undefined && (!Number.isSafeInteger(previewFlags) || previewFlags < 0)) {
  throw new Error('--flags 必须是非负整数');
}
let mini, original, lock;
try {
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  lock = await open(lockPath, 'wx');
  const require = createRequire(import.meta.url);
  const automator = require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');
  mini = await automator.connect({ wsEndpoint: process.env.WM_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' });
  const project = JSON.parse(await readFile(new URL('../project.config.json', import.meta.url), 'utf8'));
  const snapshot = await mini.evaluate(keys => ({
    appid: wx.getAccountInfoSync().miniProgram.appId,
    entries: keys.map(key => ({ key, value: wx.getStorageSync(key) })),
  }), [...SAVE_KEYS]);
  if (snapshot.appid !== project.appid) throw new Error('自动化连接的小程序与当前项目不一致');
  const wallet = snapshot.entries[0].value;
  if (!wallet || wallet.version !== 1) throw new Error('开发者工具中没有可迁移的钱包存档，已停止生成二维码');
  const transaction = snapshot.entries.at(-1).value;
  if (transaction) throw new Error('存在未完成的宠物升级，请先回首页完成保存再预览');
  const entries = snapshot.entries.map(entry => ({...entry}));
  if (previewSoldiers !== undefined || previewFlags !== undefined) {
    const supplies = entries.find(entry => entry.key === 'word-monster:daily-checkin:v1');
    const current = supplies?.value;
    if (!supplies || !current || typeof current !== 'object' || (current).version !== 1) {
      throw new Error('开发者工具中的士兵库存存档无效，已停止生成二维码');
    }
    supplies.value = {
      ...current,
      ...(previewSoldiers === undefined ? {} : {soldiers: previewSoldiers}),
      ...(previewFlags === undefined ? {} : {flags: previewFlags}),
    };
  }
  const seed = { id: randomUUID(), entries };
  const output = new URL(`../artifacts/preview-${seed.id}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('save.json', output), JSON.stringify(seed, null, 2), { mode: 0o600 });
  await mini.disconnect(); mini = undefined;
  original = await readFile(seedPath, 'utf8');
  await writeFile(seedPath, `import type { PreviewSave } from './save-transfer';\nexport const previewSave: PreviewSave | null = ${JSON.stringify(seed)};\n`);
  console.log(`存档：金币 ${wallet.balance}，武器 ${wallet.weaponLevel ?? 1} 级${previewSoldiers === undefined ? '' : `，士兵 ${previewSoldiers} 名`}${previewFlags === undefined ? '' : `，复活旗帜 ${previewFlags} 面`}；手机首次打开将覆盖导入。`);
  const qr = fileURLToPath(new URL('qrcode.png', output));
  const result = spawnSync(process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    ['preview', '--project', root, '--qr-format', 'image', '--qr-output', qr], { stdio: 'inherit', timeout: 180000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('预览二维码生成失败');
  console.log(`二维码：${qr}`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  if (original !== undefined) await writeFile(seedPath, original);
  if (mini) await mini.disconnect();
  if (lock) { await lock.close(); await unlink(lockPath); }
}
