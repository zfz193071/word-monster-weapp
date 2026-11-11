import { heroVariant } from '../miniprogram/fortress/hero-art';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { openingArt } from '../miniprogram/fortress/opening-encounter';
import type { PackageLoadMeasurement } from '../miniprogram/services/battlefield-assets';
import type { SceneArt } from '../miniprogram/fortress/canvas-scene';

// House 0 in isolated category/cache fixtures deliberately omits fortress dependencies.
// The matrix below covers all five valid production house levels.
function harness() {
  const calls: {path: string; resolve: () => void; reject: (error: Error) => void}[] = [];
  const timers = new Map<number, () => void>();
  let id = 0, now = 0;
  const exports: {battlefieldAssetMeasurements?: () => PackageLoadMeasurement[]; loadBattlefieldAssets?: (level: number, house?: number, art?: SceneArt, preloadPet?: boolean) => Promise<void>} = {};
  const source = readFileSync(new URL('../miniprogram/services/battlefield-assets.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
    Date: { now: () => now },
    exports, require: {async(path: string) {return new Promise<void>((resolve, reject) => calls.push({path, resolve, reject}));}},
    setTimeout(fn: () => void) {timers.set(++id, fn); return id;}, clearTimeout(key: number) {timers.delete(key);},
  });
  return {load: exports.loadBattlefieldAssets!, measurements: exports.battlefieldAssetMeasurements!, advance: (ms: number) => { now += ms; }, calls, timers};
}

test('八关五级堡垒只下载所需资源包，全部就绪才完成', async () => {
  for (let level = 1; level <= 8; level++) for (let house = 1; house <= 5; house++) {
    const {load, calls, timers} = harness();
    let ready = false;
    const pending = load(level, house).then(() => {ready = true;});
    assert.deepEqual(calls.map(c => c.path), [
      ...(level === 1 ? ['../battlefield-assets/ready'] : []),
      ...(house === 1 ? ['../fortress-assets/ready'] : house === 2 ? ['../reinforced-fortress-assets/ready'] : house === 3 ? ['../stone-fortress-assets/ready'] : house === 4 ? ['../castle-fortress-assets/ready'] : ['../armored-fortress-assets/ready']),
    ]);
    if (calls.length === 2) {
      calls[0].resolve(); await new Promise(resolve => setImmediate(resolve));
      assert.equal(ready, false, '只有庭院就绪时不能开始解码');
    }
    calls.forEach(c => c.resolve()); await pending;
    await load(level, house);
    assert.equal(calls.length, Number(level === 1) + 1);
    assert.equal(timers.size, 0);
  }
});

test('并发与跨关共享下载，部分失败只重试失败包', async () => {
  const {load, calls, timers} = harness();
  const first = load(1); const same = load(1); const later = load(2, 1);
  const failures = Promise.all([assert.rejects(first), assert.rejects(same), assert.rejects(later)]);
  assert.equal(calls.length, 2);
  calls[0].resolve(); calls[1].reject(Error('network')); await failures;
  await load(1, 0); assert.equal(calls.length, 2);
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
  for (const name of ['battlefield-assets', 'fortress-assets', 'reinforced-fortress-assets', 'stone-fortress-assets', 'castle-fortress-assets', 'armored-fortress-assets', 'character-assets', 'fruit-assets', 'animal-assets']) {
    const pack = app.subPackages.find((p: {name: string}) => p.name === name);
    assert.equal(pack.root, name);
    assert.ok(existsSync(new URL(`${name}/ready.ts`, root)));
    for (const page of pack.pages) for (const ext of ['ts', 'json', 'wxml', 'wxss']) assert.ok(existsSync(new URL(`${name}/${page}.${ext}`, root)));
  }
  for (const file of ['wood-interior-v2.png', 'wood-front-v2.png', 'wood-ruin-v2.png']) {
    assert.ok(existsSync(new URL(`fortress-assets/${file}`, root)));
    assert.equal(existsSync(new URL(`battlefield-assets/${file}`, root)), false);
  }
});


test('角色包按实际主角与混编词条加载，无需求不下载，失败后独立重试', async () => {
  const {load, calls} = harness();
  await load(3, 0, {...characterArt('cat', ['cat'], 2), hero: legacyHero});
  assert.equal(calls.length, 0);
  const hero = load(3, 0, characterArt('cat', ['cat'], 1));
  const apple = load(2, 0, characterArt('banana', ['banana', 'apple'], 2));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '../character-assets/ready');
  const failures = Promise.all([assert.rejects(hero), assert.rejects(apple)]);
  calls[0].reject(Error('network')); await failures;
  let ready = false;
  const retry = load(2, 0, characterArt('apple', ['apple'], 2)).then(() => { ready = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready, false);
  calls[1].resolve(); await retry;
  await load(3, 0, characterArt('cat', ['cat'], 1));
  assert.equal(calls.length, 2);
});

test('角色包超时后的迟到成功不能提前完成重试', async () => {
  const {load, calls, timers} = harness();
  const art = characterArt('apple');
  const first = load(2, 0, art), failed = assert.rejects(first, /超时/);
  for (const [key, fn] of [...timers]) { timers.delete(key); fn(); }
  await failed;
  let ready = false;
  const retry = load(2, 0, art).then(() => { ready = true; });
  calls[0].resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready, false);
  calls[1].resolve(); await retry;
  assert.equal(timers.size, 0);
});

test('精细角色仅在新包中保留一份运行资源', () => {
  const root = new URL('../miniprogram/', import.meta.url);
  for (const name of ['hero-back-weapon-1-textured.png', 'zombie-apple-textured.png', 'zombie-apple-parts.png']) {
    assert.ok(existsSync(new URL(`character-assets/${name}`, root)));
    assert.equal(existsSync(new URL(`assets/images/fortress/${name}`, root)), false);
  }
});

// Category isolation excludes Boss dependencies; the dedicated test below covers them.
function characterArt(...args: Parameters<typeof openingArt>): SceneArt { return {...openingArt(...args), bossBodies: {}, hero: heroVariant(args[2] ?? 1).art, fruitHat: undefined, fruitHats: {}}; }

test('无苹果旧主角无宠物的场景仍等待Boss角色包，失败后独立重试', async () => {
  const {load, calls} = harness();
  const art = {...characterArt('cat', ['cat'], 2), hero: legacyHero, bossBodies: openingArt('cat').bossBodies};
  const failed = load(3, 0, art), failure = assert.rejects(failed);
  assert.deepEqual(calls.map(call => call.path), ['../character-assets/ready']);
  calls[0].reject(Error('offline')); await failure;
  let ready = false;
  const retry = load(3, 0, art).then(() => {ready = true;});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(ready, false);
  calls[1].resolve(); await retry;
  await load(8, 0, art); assert.equal(calls.length, 2);
});

test('宠物预加载在旧主角场景也等待角色包，失败可重试且跨关共享', async () => {
  const {load,calls}=harness(), art={...characterArt('cat',['cat'],2), hero: legacyHero};
  const first=load(3, 0,art,true), failed=assert.rejects(first);
  assert.deepEqual(calls.map(c=>c.path),['../character-assets/ready']);
  calls[0].reject(Error('offline'));await failed;
  let ready=false;const retry=load(3, 0,art,true).then(()=>{ready=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(ready,false);
  calls[1].resolve();await retry;await load(4, 0,art,true);
  assert.equal(calls.length,2);
});

test('水果分包按实际词图加载，包含上一关混编；并发失败后仅重试水果', async () => {
  const {load, calls} = harness();
  await load(2, 0, categoryArt('red', ['red'], 2));
  assert.equal(calls.length, 0);
  const art = categoryArt('red', ['red', 'banana'], 2);
  const first = load(2, 0, art), concurrent = load(2, 0, art);
  assert.deepEqual(calls.map(c => c.path), ['../fruit-assets/ready']);
  const failures = Promise.all([assert.rejects(first), assert.rejects(concurrent)]);
  calls[0].reject(Error('offline')); await failures;
  let ready = false;
  const retry = load(2, 0, art).then(() => {ready = true;});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(ready, false);
  calls[1].resolve(); await retry;
  await load(2, 0, art); assert.equal(calls.length, 2);
});

test('水果下载超时后旧完成不能解锁新加载', async () => {
  const {load, calls, timers} = harness();
  const art = categoryArt('banana', ['banana'], 2);
  const first = load(2, 0, art), failed = assert.rejects(first, /超时/);
  for (const [key, fn] of [...timers]) {timers.delete(key); fn();}
  await failed;
  let ready = false;
  const retry = load(2, 0, art).then(() => {ready = true;});
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

test('动物分包按实际词图加载，包含上一关混编；并发失败后仅重试动物', async () => {
  const {load, calls} = harness();
  await load(2, 0, categoryArt('red', ['red'], 2));
  assert.equal(calls.length, 0);
  const art = categoryArt('book', ['book', 'cat'], 2);
  const first = load(2, 0, art), concurrent = load(2, 0, art);
  assert.deepEqual(calls.map(c => c.path), ['../animal-assets/ready']);
  const failures = Promise.all([assert.rejects(first), assert.rejects(concurrent)]);
  calls[0].reject(Error('offline')); await failures;
  let ready = false;
  const retry = load(2, 0, art).then(() => {ready = true;});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(ready, false);
  calls[1].resolve(); await retry;
  await load(2, 0, art); assert.equal(calls.length, 2);
});

test('动物下载超时后旧完成不能解锁新加载', async () => {
  const {load, calls, timers} = harness();
  const art = categoryArt('cat', ['cat'], 2);
  const first = load(2, 0, art), failed = assert.rejects(first, /超时/);
  for (const [key, fn] of [...timers]) {timers.delete(key); fn();}
  await failed;
  let ready = false;
  const retry = load(2, 0, art).then(() => {ready = true;});
  calls[0].resolve(); await new Promise(resolve => setImmediate(resolve)); assert.equal(ready, false);
  calls[1].resolve(); await retry; assert.equal(timers.size, 0);
});


test('16张动物迁移保留字节、尺寸与唯一副本，覆盖第三及第四关依赖', async () => {
  const {createHash} = await import('node:crypto');
  const {getLevel} = await import('../miniprogram/fortress/levels');
  const report = JSON.parse(readFileSync(new URL('../docs/visual-audit/animal-package/migration.json', import.meta.url), 'utf8'));
  assert.equal(report.entries.length, 16);
  for (const word of getLevel(3).words) {
    const entry = report.entries.find((e: {wordId: string}) => e.wordId === word.id);
    assert.equal(word.fruitImagePath, entry.path);
    const data = readFileSync(new URL(`../miniprogram${entry.path}`, import.meta.url));
    assert.equal(data.length, entry.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
    assert.equal(data.readUInt32BE(16) * data.readUInt32BE(20) * 4, entry.rgbaBytes);
    assert.equal(existsSync(new URL(`../miniprogram${entry.oldPath}`, import.meta.url)), false);
    for (const level of [3, 4]) {
      const {load, calls} = harness();
      const pending = load(level, 0, categoryArt(level === 3 ? word.id : 'book', [word.id, 'book'], 2));
      assert.deepEqual(calls.map(c => c.path), ['../animal-assets/ready']);
      calls[0].resolve(); await pending;
    }
  }
});


test('分包耗时区分首次等待、并发共享与成功缓存，读取诊断不改变内部记录', async () => {
  const h = harness();
  assert.equal(h.measurements().length, 10);
  assert.ok(h.measurements().every(m => m.status === 'idle' && m.lastDurationMs === null));
  const first = h.load(1, 0), shared = h.load(1, 0);
  h.advance(125); h.calls[0].resolve(); await Promise.all([first, shared]);
  await h.load(1, 0);
  const measurement = h.measurements().find(m => m.name === 'battlefield-assets')!;
  assert.equal(measurement.attempts, 1);
  assert.equal(measurement.sharedRequests, 1);
  assert.equal(measurement.cacheHits, 1);
  assert.equal(measurement.lastDurationMs, 125);
  assert.equal(measurement.status, 'ready');
  measurement.attempts = 99;
  assert.equal(h.measurements()[0].attempts, 1);
  assert.ok(h.measurements().slice(1).every(m => m.status === 'idle'));
});

test('失败和超时独立计数，旧请求迟到不污染重试耗时', async () => {
  const h = harness(), sample = () => h.measurements().find(m => m.name === 'fortress-assets')!;
  const first = h.load(2, 1), failed = assert.rejects(first);
  h.advance(40); h.calls[0].reject(Error('network')); await failed;
  assert.equal(sample().status, 'failed'); assert.equal(sample().lastDurationMs, 40);
  const second = h.load(2, 1), timedOut = assert.rejects(second, /超时/);
  h.advance(15000);
  for (const [key, fn] of [...h.timers]) { h.timers.delete(key); fn(); }
  await timedOut;
  assert.equal(sample().status, 'timed-out'); assert.equal(sample().lastDurationMs, 15000);
  const third = h.load(2, 1);
  h.advance(20); h.calls[1].resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(sample().status, 'loading'); assert.equal(sample().lastDurationMs, null);
  h.advance(60); h.calls[2].resolve(); await third;
  assert.equal(sample().status, 'ready'); assert.equal(sample().lastDurationMs, 80);
  assert.equal(sample().attempts, 3); assert.equal(sample().failures, 1); assert.equal(sample().timeouts, 1);
  assert.equal(h.timers.size, 0);
});

// Explicit old/custom asset fixture isolates category loaders from hero dependencies.
const legacyHero = {path:'/assets/images/fortress/hero-back-weapon-2.png',source:'legacy fixture',rights:'test',approved:true};
function categoryArt(...args: Parameters<typeof openingArt>): SceneArt {
  return {...openingArt(...args), bossBodies: {}, hero:legacyHero};
}
test('七级新主角均等待对应角色分包，跨关使用同一成功缓存', async () => {
  for(let level=1;level<=7;level++) {
    const {load,calls}=harness();
    let ready=false;
    const pending=load(5, 0,openingArt('red',['red'],level)).then(()=>{ready=true;});
    assert.deepEqual(calls.map(c=>c.path),[...([4,7].includes(level) ? [] : ['../guardian-assets/ready']), '../character-assets/ready']);
    await Promise.resolve(); assert.equal(ready,false);
    calls.forEach(call => call.resolve());await pending;
    await load(6, 0,openingArt('book',['book'],level));
    assert.equal(calls.length,[4,7].includes(level) ? 1 : 2);
  }
});

test('升级二级后独立加载加固堡垒，失败可重试，跨关复用且不下载一级包', async () => {
  const h = harness();
  const first = h.load(2, 2), concurrent = h.load(8, 2);
  const failures = Promise.all([assert.rejects(first), assert.rejects(concurrent)]);
  assert.deepEqual(h.calls.map(call => call.path), ['../reinforced-fortress-assets/ready']);
  h.calls[0].reject(Error('network')); await failures;
  const retry = h.load(3, 2);
  assert.equal(h.calls.length, 2); h.calls[1].resolve(); await retry;
  await h.load(8, 2); assert.equal(h.calls.length, 2);
  assert.equal(h.timers.size, 0);
});

test('三至五级堡垒分别缓存，失败只重试当前等级且不预载废墟', async () => {
  const { sceneImageAssets } = await import('../miniprogram/fortress/canvas-scene');
  const { openingArt } = await import('../miniprogram/fortress/opening-encounter');
  const h = harness();
  for (const [index, material] of ['stone', 'castle', 'armored'].entries()) {
    const house = index + 3;
    const start = h.calls.length;
    const first = h.load(2, house), failed = assert.rejects(first, /offline/);
    assert.equal(h.calls[start].path, `../${material}-fortress-assets/ready`);
    h.calls[start].reject(Error('offline')); await failed;
    let ready = false;
    const retry = h.load(8, house).then(() => { ready = true; });
    const shared = h.load(3, house);
    await Promise.resolve(); assert.equal(ready, false);
    assert.equal(h.calls.length, start + 2);
    h.calls[start + 1].resolve(); await Promise.all([retry, shared]);
    await h.load(4, house); assert.equal(h.calls.length, start + 2);
    const paths = sceneImageAssets(openingArt('apple'), 2, house).map(asset => asset.path)
      .filter(path => path.includes('fortress-assets/'));
    assert.deepEqual(paths, [`/${material}-fortress-assets/${material}-interior-v2.png`, `/${material}-fortress-assets/${material}-front-v2.png`]);
  }
});

test('关节主角与宠物包独立重试，跨关共享，四七级不请求关节包', async () => {
  const h=harness(), art=openingArt('red',['red'],1);
  const first=h.load(5,0,art,true),failed=assert.rejects(first,/offline/);
  assert.deepEqual(h.calls.map(c=>c.path),['../guardian-assets/ready','../character-assets/ready']);
  h.calls[1].resolve();h.calls[0].reject(Error('offline'));await failed;
  const retry=h.load(6,0,art,true),shared=h.load(8,0,openingArt('book',['book'],3),true);
  assert.equal(h.calls.length,3);assert.equal(h.calls[2].path,'../guardian-assets/ready');
  h.calls[2].resolve();await Promise.all([retry,shared]);
  for(const level of [4,7]) await h.load(6,0,openingArt('red',['red'],level),true);
  assert.equal(h.calls.length,3);
});
