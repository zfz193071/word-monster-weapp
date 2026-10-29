import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const project = await readJson(resolve(root, 'project.config.json'));
assert.equal(project.compileType, 'miniprogram');
assert.match(project.appid, /^wx[0-9a-f]{16}$/);
assert.ok(project.setting.useCompilerPlugins.includes('typescript'));
const source = resolve(root, project.miniprogramRoot);
const app = await readJson(resolve(source, 'app.json'));
assert.ok(app.pages.length > 0, '至少注册一个页面');
assert.equal(new Set(app.pages).size, app.pages.length, '页面路径不能重复');
for (const page of app.pages) {
  assert.ok(!relative(source, resolve(source, page)).startsWith('..'), '页面必须位于源码目录');
  for (const extension of ['ts', 'json', 'wxml', 'wxss']) {
    await access(resolve(source, `${page}.${extension}`));
  }
  await readJson(resolve(source, `${page}.json`));
}
await readJson(resolve(source, app.sitemapLocation));
console.log(`项目配置和 ${app.pages.length} 个页面的文件结构检查通过（不代表微信编译或真机验收）。`);
