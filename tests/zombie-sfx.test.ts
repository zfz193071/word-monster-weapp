import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('僵尸含混声随机轮换且不连续重复，暂停和销毁会停止播放', () => {
  const exports: any = {};
  const source = readFileSync(new URL('../miniprogram/services/zombie-sfx.ts', import.meta.url), 'utf8');
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const channel: any = {
    src: '', volume: 0, autoplay: true, loop: true, obeyMuteSwitch: false,
    played: [] as string[], stopped: 0, destroyed: 0,
    onError() {}, stop() { this.stopped++; }, play() { this.played.push(this.src); }, destroy() { this.destroyed++; },
  };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports,
    Date: { now: () => now },
    setTimeout(fn: () => void) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  const controller = exports.createZombieSfx({ volume: 0.3, random: () => 0, createContext: () => channel });
  controller.setActive(true);
  assert.equal(timers.size, 1);
  for (const expectedTime of [4500, 9000, 13500]) {
    now = expectedTime;
    const entry = timers.entries().next().value as [number, () => void];
    timers.delete(entry[0]);
    entry[1]();
  }
  assert.deepEqual(channel.played, [
    '/assets/audio/zombie-mumble-1.mp3',
    '/assets/audio/zombie-mumble-2.mp3',
    '/assets/audio/zombie-mumble-1.mp3',
  ]);
  assert.equal(channel.volume, 0.3);
  assert.equal(channel.autoplay, false);
  assert.equal(channel.loop, false);
  assert.equal(channel.obeyMuteSwitch, true);
  controller.setActive(false);
  assert.equal(timers.size, 0);
  assert.ok(channel.stopped >= 4);
  controller.dispose();
  assert.equal(channel.destroyed, 1);
});
