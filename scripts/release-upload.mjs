import { access, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`命令执行失败：${command} ${args.join(' ')}（${result.signal || result.status}）`);
}

try {
  const { values } = parseArgs({ options: {
    version: { type: 'string' },
    desc: { type: 'string' },
    'check-only': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    console.log('检查：npm run release:check\n上传：npm run release:upload -- --version 1.0.0 --desc "首次发布"\n可用 WECHAT_DEVTOOLS_CLI 指定开发者工具 CLI 绝对路径。');
  } else {
    const previewSeed = await readFile(resolve(root, 'miniprogram/preview/save-seed.ts'), 'utf8');
    if (!/export const previewSave: PreviewSave \| null = null;/.test(previewSeed)) {
      throw new Error('预览迁移存档尚未移除，禁止正式上传。请先恢复 save-seed.ts 的空存档。');
    }
    const project = JSON.parse(await readFile(resolve(root, 'project.config.json'), 'utf8'));
    if (project.compileType !== 'miniprogram' || !/^wx[0-9a-f]{16}$/.test(project.appid)) {
      throw new Error('project.config.json 必须配置真实小程序 AppID。');
    }
    const cli = process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
    if (!values['check-only']) {
      if (!values.version?.trim() || !values.desc?.trim()) {
        throw new Error('上传必须明确指定 --version 和 --desc；使用 --help 查看示例。');
      }
      await access(cli, constants.X_OK).catch(() => {
        throw new Error('未找到可执行的微信开发者工具 CLI，请安装工具或设置 WECHAT_DEVTOOLS_CLI。');
      });
    }
    console.log(`目标：${project.projectname} / ${project.appid}`);
    // Use the npm executable that started this script, without shell interpolation.
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('请通过 npm run release:check 或 npm run release:upload 执行。');
    run(process.execPath, [npm, 'run', 'check']);
    run(process.execPath, [npm, 'test']);
    if (values['check-only']) {
      console.log('本地检查通过；尚未进行微信编译、上传或真机验收。');
    } else {
      const output = resolve(root, 'artifacts', 'releases', `${Date.now()}-${process.pid}`);
      await mkdir(output, { recursive: true });
      console.log(`上传开发版本 ${values.version}：${values.desc}`);
      run(cli, ['upload', '--project', root, '--version', values.version,
        '--desc', values.desc, '--info-output', resolve(output, 'upload.json')]);
      console.log(`开发版本上传成功，上传信息：${output}/upload.json`);
      console.log('请到 https://mp.weixin.qq.com 的版本管理核对版本、体验测试并提交审核；审核通过后发布。上传成功不代表已上线。');
    }
  }
} catch (error) {
  console.error(`发布流程已停止：${error.message}`);
  process.exitCode = 1;
}
