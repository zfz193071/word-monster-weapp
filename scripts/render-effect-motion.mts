import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';

// Offscreen replay: fixed initial actors, then only the real scene frame loop.
// No injected impacts, damage events, player saves or device performance claims.
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/visual-audit/effects/motion');
await mkdir(output, { recursive: true });
(globalThis as any).wx = { createOffscreenCanvas: ({ width, height }: any) => createCanvas(width, height) };
const report: any[] = [];
const fps = 30, duration = 14;
for (const [device, width, height, count] of [
  ['phone-low', 390, 620, 3], ['phone-high', 390, 620, 18],
  ['ipad-low', 1024, 580, 3], ['ipad-high', 1024, 580, 18],
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
  const initial = createOpeningEncounter('effects-motion', 'apple', 1, 0,
    { doubleShot: 2, fireRate: 2, bulletWidth: 1, flame: 2, frost: 2, lightning: 2, homing: 1 });
  const fixture = { ...initial, incomingMonsters: [], monsters: Array.from({ length: count }, (_, index) => ({
    ...initial.monsters[0], id: `motion-${index}`, hp: 400, maxHp: 400,
    boss: index === count - 1, bossKind: index === count - 1 ? 'grand' as const : undefined,
    position: { x: (index % 3 + 1) * 90, y: 120 + Math.floor(index / 3) * 42 },
  })) };
  const eventCounts: Record<string, number> = {}, kinds = new Set<string>();
  let peakImpacts = 0, peakProjectiles = 0;
  const samples: any[] = [];
  const scene = new CanvasScene(canvas, { initial: fixture, width, height, dpr: 1, levelId: 1,
    clientLeft: 0, preview: false, art: openingArt('apple'), onHud() {},
    onError(message) { throw Error(message); },
    onEvents(events) { for (const event of events) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1; },
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
      if (frame === 5 * fps) {
        stale = [...frames.values()]; scene.setPaused(true);
        pausedState = JSON.stringify(scene.snapshot); pausedFrame = scene.captureFrame();
      }
      if (frame === 6 * fps) scene.setPaused(false);
      if (frame === 8 * fps) scene.setSpeed(2.5);
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(now);
      if (frame >= 5 * fps && frame < 6 * fps) {
        for (const callback of stale) callback(now);
        assert.equal(JSON.stringify(scene.snapshot), pausedState, 'pause/stale callback advanced combat');
        assert.equal(scene.captureFrame(), pausedFrame, 'pause changed pixels');
        assert.equal(frames.size, 0, 'pause scheduled animation');
      }
      const state = scene.snapshot!;
      for (const impact of state.elementImpacts ?? []) {
        assert.ok(impact.untilTick > state.tick, 'expired effect retained'); kinds.add(impact.kind);
      }
      peakImpacts = Math.max(peakImpacts, state.elementImpacts?.length ?? 0);
      peakProjectiles = Math.max(peakProjectiles, state.projectiles.length);
      if (frame % fps === 0) samples.push({ second: frame / fps, tick: state.tick,
        impacts: state.elementImpacts?.length ?? 0, projectiles: state.projectiles.length,
        alive: state.monsters.filter(monster => monster.status === 'alive').length, baseHp: state.base.hp });
      const png = canvas.toBuffer('image/png');
      if (frame === 7 * fps) await writeFile(resolve(output, `${device}.png`), png);
      if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end(); await encoded;
    assert.ok((eventCounts.monsterDamaged ?? 0) > 0, 'no actual damage events');
    assert.ok(kinds.has('flame') && kinds.has('frost'), 'no charged elemental hit');
    assert.equal(scene.diagnostics.droppedSimulationMs, 0);
    const late = [...frames.values()]; scene.dispose();
    for (const callback of late) callback(60000);
    assert.equal(scene.snapshot, null); assert.equal(frames.size, 0);
    const bytes = await readFile(videoPath);
    report.push({ device, width, height, dpr: 1, fps, durationSeconds: duration, count,
      source: 'Fixed initial HP/positions/skills; production combat and Canvas frame loop; offscreen, not device or natural progression.',
      pause: '5–6 seconds, stale callbacks and pixel/state equality checked', speed: '1x until 8 seconds, then 2.5x',
      checks: { pausePixels: true, pauseState: true, staleFrames: true, expiredImpacts: true, dispose: true, droppedSimulationMs: 0 },
      eventCounts, elementKinds: [...kinds].sort(), peakImpacts, peakProjectiles, samples,
      file: `${device}.mp4`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    console.log(`${device}: ${peakImpacts} peak impacts, ${peakProjectiles} peak projectiles; lifecycle checks passed`);
  } finally { scene.dispose(); if (encoder.exitCode === null) encoder.kill(); }
}
assert.deepEqual([...new Set(report.flatMap(r => r.elementKinds))].sort(), ['flame', 'frost', 'lightning']);
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>特效动态审查</title><style>body{background:#172b25;color:#f8efd8;font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:24px}video{width:100%;max-height:620px;background:#0d2019}article{background:#263d33;padding:16px;border-radius:16px}p{line-height:1.7}</style><h1>#95 特效动态审查</h1><p>正式战斗和Canvas帧循环，初始位置/400生命/技能为固定审查夹具。不是自然通关、微信截图或设备性能数据。5–6秒暂停，8秒切换2.5倍。DPR 1；设备高DPR仍待验。视频中的伤害、弹体与特效均来自真实逻辑，未直接注入命中特效。</p><main>${report.map(r => `<article><h2>${r.device} · ${r.width}×${r.height} · ${r.count}怪</h2><video controls preload="metadata" poster="${r.device}.png" src="${r.file}"></video><p>峰值${r.peakImpacts}个元素事件 / ${r.peakProjectiles}发弹体；暂停画面、状态、过期事件与销毁回调检查通过。</p></article>`).join('')}</main><p><a href="report.json">完整参数、事件统计与SHA256</a></p></html>`);
