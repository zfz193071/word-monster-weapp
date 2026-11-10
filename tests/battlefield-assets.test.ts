import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { openingArt } from '../miniprogram/fortress/opening-encounter';
import type { SceneArt } from '../miniprogram/fortress/canvas-scene';

function harness() {
  const calls: {path: string; resolve: () => void; reject: (error: Error) => void}[] = [];
  const timers = new Map<number, () => void>();
  let id = 0;
  const exports: {loadBattlefieldAssets?: (level: number, house?: number, art?: SceneArt) => Promise<void>} = {};
  const source = readFileSync(new URL('../miniprogram/services/battlefield-assets.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
    exports, require: {async(path: string) {return new Promise<void>((resolve, reject) => calls.push({path, resolve, reject}));}},
    setTimeout(fn: () => void) {timers.set(++id, fn); return id;}, clearTimeout(key: number) {timers.delete(key);},
  });
  return {load: exports.loadBattlefieldAssets!, calls, timers};
}

test('八关五级堡垒只下载所需资源包，全部就绪才完成', async () => {
  for (let level = 1; level <= 8; level++) for (let house = 1; house <= 5; house++) {
    const {load, calls, timers} = harness();
    let ready = false;
    const pending = load(level, house).then(() => {ready = true;});
    assert.deepEqual(calls.map(c => c.path), [
      ...(level === 1 ? ['../battlefield-assets/ready'] : []),
      ...(house === 1 ? ['../fortress-assets/ready'] : []),
    ]);
    if (calls.length === 2) {
      calls[0].resolve(); await new Promise(resolve => setImmediate(resolve));
      assert.equal(ready, false, '只有庭院就绪时不能开始解码');
    }
    calls.forEach(c => c.resolve()); await pending;
    await load(level, house);
    assert.equal(calls.length, Number(level === 1) + Number(house === 1));
    assert.equal(timers.size, 0);
  }
});

test('并发与跨关共享下载，部分失败只重试失败包', async () => {
  const {load, calls, timers} = harness();
  const first = load(1); const same = load(1); const later = load(2, 1);
  const failures = Promise.all([assert.rejects(first), assert.rejects(same), assert.rejects(later)]);
  assert.equal(calls.length, 2);
  calls[0].resolve(); calls[1].reject(Error('network')); await failures;
  await load(1, 2); assert.equal(calls.length, 2);
  const retry = load(1); assert.equal(calls.length, 3);
  assert.equal(calls[2].path, '../fortress-assets/ready'); calls[2].resolve(); await retry;
  await load(8, 1); assert.equal(calls.length, 3); assert.equal(timers.size, 0);
});

test('超时允许重试，旧完成不解锁新请求或覆盖缓存', async () => {
  const {load, calls, timers} = harness();
  const first = load(1); const failed = assert.rejects(first, /超时/);
  for (const [key, fn] of [...timers]) {timers.delete(key); fn();}
  await failed;
  let ready = false; const retry = load(1).then(() => {ready = true;});
  assert.equal(calls.length, 4);
  calls[0].resolve(); calls[1].reject(Error('late failure'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(ready, false);
  const concurrent = load(1); assert.equal(calls.length, 4);
  calls[2].resolve(); calls[3].resolve(); await Promise.all([retry, concurrent]);
  await load(1); assert.equal(calls.length, 4); assert.equal(timers.size, 0);
});

test('战场和堡垒包均注册有效入口，堡垒资源没有重复副本', () => {
  const root = new URL('../miniprogram/', import.meta.url);
  const app = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));
  for (const name of ['battlefield-assets', 'fortress-assets', 'character-assets', 'fruit-assets']) {
    const pack = app.subPackages.find((p: {name: string}) => p.name === name);
    assert.equal(pack.root, name);
    assert.ok(existsSync(new URL(`${name}/ready.ts`, root)));
    for (const page of pack.pages) for (const ext of ['ts', 'json', 'wxml', 'wxss']) assert.ok(existsSync(new URL(`${name}/${page}.${ext}`, root)));
  }
  for (const file of ['fortress-level-1-v1.png', 'fortress-level-1-destroyed-v1.png']) {
    assert.ok(existsSync(new URL(`fortress-assets/${file}`, root)));
    assert.equal(existsSync(new URL(`battlefield-assets/${file}`, root)), false);
  }
});


test('角色包按实际主角与混编词条加载，无需求不下载，失败后独立重试', async () => {
  const {load, calls} = harness();
  await load(3, 2, characterArt('cat', ['cat'], 2));
  assert.equal(calls.length, 0);
  const hero = load(3, 2, characterArt('cat', ['cat'], 1));
  const apple = load(2, 2, characterArt('banana', ['banana', 'apple'], 2));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '../character-assets/ready');
  const failures = Promise.all([assert.rejects(hero), assert.rejects(apple)]);
  calls[0].reject(Error('network')); await failures;
  let ready = false;
  const retry = load(2, 2, characterArt('apple', ['apple'], 2)).then(() => { ready = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready, false);
  calls[1].resolve(); await retry;
  await load(3, 2, characterArt('cat', ['cat'], 1));
  assert.equal(calls.length, 2);
});

test('角色包超时后的迟到成功不能提前完成重试', async () => {
  const {load, calls, timers} = harness();
  const art = characterArt('apple');
  const first = load(2, 2, art), failed = assert.rejects(first, /超时/);
  for (const [key, fn] of [...timers]) { timers.delete(key); fn(); }
  await failed;
  let ready = false;
  const retry = load(2, 2, art).then(() => { ready = true; });
  calls[0].resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready, false);
  calls[1].resolve(); await retry;
  assert.equal(timers.size, 0);
});

test('精细角色仅在新包中保留一份运行资源', () => {
  const root = new URL('../miniprogram/', import.meta.url);
  for (const name of ['hero-back-weapon-1-textured.png', 'zombie-apple-textured.png']) {
    assert.ok(existsSync(new URL(`character-assets/${name}`, root)));
    assert.equal(existsSync(new URL(`assets/images/fortress/${name}`, root)), false);
  }
});

function characterArt(...args: Parameters<typeof openingArt>): SceneArt { return {...openingArt(...args), fruitHat: undefined, fruitHats: {}}; }

test('水果分包按实际词图加载，包含上一关混编；并发失败后仅重试水果', async () => {
  const {load, calls} = harness();
  await load(3, 2, openingArt('cat', ['cat'], 2));
  assert.equal(calls.length, 0);
  const art = openingArt('red', ['red', 'banana'], 2);
  const first = load(2, 2, art), concurrent = load(2, 2, art);
  assert.deepEqual(calls.map(c => c.path), ['../fruit-assets/ready']);
  const failures = Promise.all([assert.rejects(first), assert.rejects(concurrent)]);
  calls[0].reject(Error('offline')); await failures;
  let ready = false;
  const retry = load(2, 2, art).then(() => {ready = true;});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(ready, false);
  calls[1].resolve(); await retry;
  await load(2, 2, art); assert.equal(calls.length, 2);
});

test('水果下载超时后旧完成不能解锁新加载', async () => {
  const {load, calls, timers} = harness();
  const art = openingArt('banana', ['banana'], 2);
  const first = load(2, 2, art), failed = assert.rejects(first, /超时/);
  for (const [key, fn] of [...timers]) {timers.delete(key); fn();}
  await failed;
  let ready = false;
  const retry = load(2, 2, art).then(() => {ready = true;});
  calls[0].resolve(); await new Promise(resolve => setImmediate(resolve)); assert.equal(ready, false);
  calls[1].resolve(); await retry; assert.equal(timers.size, 0);
});

test('11张水果原样迁移，清单哈希及尺寸一致且无旧运行副本', async () => {
  const {createHash} = await import('node:crypto');
  const {BATTLE_WORDS} = await import('../miniprogram/fortress/fruit-catalog');
  const report = JSON.parse(readFileSync(new URL('../docs/visual-audit/fruit-package/migration.json', import.meta.url), 'utf8'));
  assert.equal(report.entries.length, 11);
  for (const word of BATTLE_WORDS) {
    const entry = report.entries.find((e: {wordId: string}) => e.wordId === word.id);
    assert.equal(word.fruitImagePath, entry.path);
    const data = readFileSync(new URL(`../miniprogram${entry.path}`, import.meta.url));
    assert.equal(data.length, entry.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
    assert.equal(data.readUInt32BE(16) * data.readUInt32BE(20) * 4, entry.rgbaBytes);
    assert.equal(existsSync(new URL(`../miniprogram${entry.oldPath}`, import.meta.url)), false);
  }
});
