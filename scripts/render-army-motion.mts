import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { FORTRESS_RULES as R } from '../miniprogram/fortress/rules';
import type { CombatState } from '../miniprogram/fortress/types';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';

// Offscreen replay: fixed initial actors, then only the real scene frame loop.
// No injected impacts, damage events, player saves or device performance claims.
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/visual-audit/army/motion');
await mkdir(output, { recursive: true });
(globalThis as any).wx = { createOffscreenCanvas: ({ width, height }: any) => createCanvas(width, height) };
const report: any[] = [];
const fps = 30, duration = 14;
for (const [device, width, height, types] of [
  ['phone-defense', 390, 620, ['rifle', 'shield', 'flamethrower']],
  ['phone-heavy', 390, 620, ['rocket', 'jetpack', 'tank']],
  ['ipad-defense', 1024, 580, ['rifle', 'shield', 'flamethrower']],
  ['ipad-heavy', 1024, 580, ['rocket', 'jetpack', 'tank']],
] as const) {
  const canvas = createCanvas(width, height);
  let frameId = 0;
  const frames = new Map<number, (now: number) => void>();
  canvas.requestAnimationFrame = (callback: (now: number) => void) => { frames.set(++frameId, callback); return frameId; };
  canvas.cancelAnimationFrame = (id: number) => frames.delete(id);
  canvas.createImage = () => {
    const image = new Image();
    const src = Object.getOwnPropertyDescriptor(Image.prototype, 'src')!;
    Object.defineProperty(image, 'src', {
      set(value: string) { src.set!.call(image, resolve(root, 'miniprogram', value.replace(/^\//, ''))); },
      get() { return src.get!.call(image); },
    });
    return image;
  };
  const initial = createOpeningEncounter(`army-motion-${device}`, 'apple', 1);
  // Deliberately shortened health and close contact expose all feedback within 14s.
  // No events are injected after construction; attacks and deaths use production logic.
  const fixture: CombatState = { ...initial, incomingMonsters: [],
    base: {...initial.base, hp: 1000, maxHp: 1000},
    supportSoldiers: types.map((soldierType, slot) => ({
      id: soldierType, soldierType, slot, source: 'skill', skill: {level: 1, quality: 'crude'},
      hp: 12, maxHp: 12, attackRemainingMs: 0, position: {x: 180 + (slot - 1) * 36, y: R.arena.baseTop},
    })),
    monsters: Array.from({length: 3}, (_, index) => ({
      ...initial.monsters[0], id: `contact-${index}`, hp: 1000, maxHp: 1000,
      enemyType: index === 2 && types.some(type => type === 'jetpack') ? 'flying' : 'normal',
      status: 'attackingBase', attackRemainingMs: 2000 + index * 300,
      attackIntervalMs: 2000, attackDamage: 6,
      position: {x: 180 + (index - 1) * 36, y: R.arena.baseTop - 28},
    })),
  };
  const eventCounts: Record<string, number> = {};
  const attacked = new Set<string>(), damaged = new Set<string>(), defeated = new Set<string>();
  const samples: any[] = [];
  const scene = new CanvasScene(canvas, { initial: fixture, width, height, dpr: 1, levelId: 1,
    clientLeft: 0, preview: false, art: openingArt('apple'), onHud() {},
    onError(message) { throw Error(message); },
    onEvents(events) { for (const event of events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      if (event.type === 'monsterDamaged' && event.soldier) attacked.add(event.soldier.type);
      if (event.type === 'supportSoldierDamaged') damaged.add(event.soldierId);
      if (event.type === 'supportSoldierDefeated') defeated.add(event.soldierId);
    } },
  });
  const videoPath = resolve(output, `${device}.mp4`);
  const encoder = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps),
    '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', videoPath], { stdio: ['pipe', 'ignore', 'pipe'] });
  let encoderError = '';
  encoder.stderr.on('data', chunk => { encoderError += chunk; });
  const encoded = new Promise<void>((resolve, reject) => {
    encoder.once('error', reject);
    encoder.once('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg: ${encoderError}`)));
  });
  // Attach immediately so a failed executable cannot produce an unhandled rejection.
  encoded.catch(() => {});
  let pausedState = '', pausedFrame = '', stale: ((now: number) => void)[] = [];
  try {
    assert.equal(await scene.load(), true);
    for (let frame = 0; frame < duration * fps; frame++) {
      const now = frame * 1000 / fps;
      if (frame === 63) {
        assert.ok(scene.snapshot!.supportSoldiers!.length > 0, 'pause must exercise live allies');
        stale = [...frames.values()]; scene.setPaused(true);
        pausedState = JSON.stringify(scene.snapshot); pausedFrame = scene.captureFrame();
      }
      if (frame === 93) scene.setPaused(false);
      if (frame === 4 * fps) { assert.ok(scene.snapshot!.supportSoldiers!.length > 0, 'speed change must exercise live allies'); scene.setSpeed(2.5); }
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(now);
      if (frame >= 63 && frame < 93) {
        for (const callback of stale) callback(now);
        assert.equal(JSON.stringify(scene.snapshot), pausedState, 'pause/stale callback advanced combat');
        assert.equal(scene.captureFrame(), pausedFrame, 'pause changed pixels');
        assert.equal(frames.size, 0, 'pause scheduled animation');
      }
      const state = scene.snapshot!;
      if (frame % fps === 0) samples.push({ second: frame / fps, tick: state.tick,
        soldiers: state.supportSoldiers?.map(s => ({type:s.soldierType,hp:s.hp,lastShotTick:s.lastShotTick,lastHitTick:s.lastHitTick})),
        fallen: state.fallenSoldiers?.map(s => ({type:s.soldierType,lastHitTick:s.lastHitTick})), baseHp: state.base.hp });
      const png = canvas.toBuffer('image/png');
      if (frame === fps) await writeFile(resolve(output, `${device}.png`), png);
      if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end(); await encoded;
    assert.ok((eventCounts.monsterDamaged ?? 0) > 0, 'no actual damage events');
    for (const type of types) { assert.ok(attacked.has(type), `${type} never attacked`); assert.ok(damaged.has(type), `${type} never damaged`); assert.ok(defeated.has(type), `${type} never defeated`); }
    assert.equal(scene.diagnostics.droppedSimulationMs, 0);
    const late = [...frames.values()]; scene.dispose();
    for (const callback of late) callback(60000);
    assert.equal(scene.snapshot, null); assert.equal(frames.size, 0);
    const bytes = await readFile(videoPath);
    report.push({ device, width, height, dpr: 1, fps, durationSeconds: duration, types, fixture: {soldierHp:12, enemyHp:1000, enemyDamage:6, enemyIntervalMs:2000},
      source: 'Fixed 12 HP soldiers and 1000 HP close-contact enemies; production combat and Canvas frame loop; offscreen, not device or natural progression.',
      pause: '2.1–3.1 seconds, stale callbacks and pixel/state equality checked', speed: '1x until 4 seconds, then 2.5x',
      checks: { pausePixels: true, pauseState: true, staleFrames: true, dispose: true, droppedSimulationMs: 0 },
      eventCounts, attacked: [...attacked], damaged: [...damaged], defeated: [...defeated], samples,
      file: `${device}.mp4`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    console.log(`${device}: ${attacked.size} types attacked, ${damaged.size} damaged, ${defeated.size} defeated; lifecycle checks passed`);
  } finally { scene.dispose(); if (encoder.exitCode === null) encoder.kill(); }
}
assert.equal(new Set(report.flatMap(r => r.attacked)).size, 6);
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>友军动态审查</title><style>body{background:#172b25;color:#f8efd8;font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:24px}video{width:100%;max-height:620px;background:#0d2019}article{background:#263d33;padding:16px;border-radius:16px}p{line-height:1.7}</style><h1>#79 友军动态审查</h1><p>正式战斗和Canvas帧循环，初始位置、友军12生命、敌人1000生命和6点攻击为固定接敌夹具。不是自然通关、微信截图或设备性能数据。2.1–3.1秒暂停，4秒切换2.5倍。DPR 1；设备高DPR仍待验。视频中的伤害、弹体与特效均来自真实逻辑，未直接注入命中特效。</p><main>${report.map(r => `<article><h2>${r.device} · ${r.width}×${r.height} · ${r.types.join(" / ")}</h2><video controls preload="metadata" poster="${r.device}.png" src="${r.file}"></video><p>三兵种均实际攻击、受伤并阵亡；暂停画面、状态、迟到回调与销毁回调检查通过。</p></article>`).join('')}</main><p><a href="report.json">完整参数、事件统计与SHA256</a></p></html>`);
