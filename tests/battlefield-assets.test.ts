import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function harness() {
  const calls: {path: string; resolve: () => void; reject: (error: Error) => void}[] = [];
  const timers = new Map<number, () => void>();
  let id = 0;
  const exports: {loadBattlefieldAssets?: (level: number, house?: number) => Promise<void>} = {};
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
  for (const name of ['battlefield-assets', 'fortress-assets']) {
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
