import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt, openingMonsterCount } from '../miniprogram/fortress/opening-encounter';

// Unmodified opening-wave factory + production frame loop. No injected positions,
// health, hits, skills or pets; no save access. This is offscreen, not a device run.
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, process.env.WM_OPENING_OUTPUT ?? 'docs/visual-audit/battlefield-overhaul/opening-motion');
await mkdir(output, { recursive: true });
(globalThis as any).wx = { createOffscreenCanvas: ({ width, height }: any) => createCanvas(width, height) };
const fps = 30, maximumSeconds = 40, dpr = 2;
const report: any[] = [];
for (const [device, width, height] of [['phone', 390, 620], ['ipad', 1024, 580]] as const) {
  const canvas = createCanvas(width * dpr, height * dpr);
  const frames = new Map<number, (now: number) => void>();
  let frameId = 0;
  canvas.requestAnimationFrame = (callback: (now: number) => void) => { frames.set(++frameId, callback); return frameId; };
  canvas.cancelAnimationFrame = (id: number) => frames.delete(id);
  const assets = new Map<string, string>();
  canvas.createImage = () => {
    const image = new Image();
    const src = Object.getOwnPropertyDescriptor(Image.prototype, 'src')!;
    Object.defineProperty(image, 'src', {
      set(value: string) {
        const local = resolve(root, 'miniprogram', value.replace(/^\//, ''));
        assets.set(value, local); src.set!.call(image, local);
      },
      get() { return src.get!.call(image); },
    });
    return image;
  };
  // Same seed on both aspect ratios; production CanvasScene maps the arena width.
  const sessionId = 'opening-art-review-2026-11-10';
  const initial = createOpeningEncounter(sessionId, 'apple', 1);
  assert.equal(initial.monsters.length + (initial.incomingMonsters?.length ?? 0), openingMonsterCount(0));
  const eventCounts: Record<string, number> = {};
  const samples: any[] = [], captures: string[] = [];
  const admitted = new Set<string>();
  let lastEventMs = 0;
  const scene = new CanvasScene(canvas, { initial, width, height, dpr, levelId: 1,
    clientLeft: 0, preview: false, art: openingArt('apple'), onHud() {},
    onError(message) { throw Error(message); },
    onEvents(events) { for (const event of events) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1; },
  });
  const videoPath = resolve(output, `${device}.mp4`);
  const encoder = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width * dpr}x${height * dpr}`, '-framerate', String(fps),
    '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', videoPath], { stdio: ['pipe', 'ignore', 'pipe'] });
  let encoderError = '';
  encoder.stderr.on('data', chunk => { encoderError += chunk; });
  const encoded = new Promise<void>((resolve, reject) => {
    encoder.once('error', reject);
    encoder.once('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg: ${encoderError}`)));
  });
  encoded.catch(() => {});
  encoder.stdin.on('error', () => {}); // The process result reports the encoder failure.
  let frameCount = 0, terminalFrame: number | undefined;
  try {
    assert.equal(await scene.load(), true);
    for (let frame = 0; frame < maximumSeconds * fps; frame++) {
      lastEventMs = frame * 1000 / fps;
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(lastEventMs);
      const state = scene.snapshot!;
      for (const monster of state.monsters) admitted.add(monster.id);
      if (frame % fps === 0) samples.push({ second: frame / fps, tick: state.tick, status: state.status,
        alive: state.monsters.filter(m => m.hp > 0).length, incoming: state.incomingMonsters?.length ?? 0,
        positions: state.monsters.filter(m => m.hp > 0).map(m => ({ id: m.id, ...m.position })),
        projectiles: state.projectiles.length, baseHp: state.base.hp });
      if ([0, 3, 8, 15, 25].some(second => frame === second * fps)) {
        const name = `${device}-${frame / fps}s.png`; captures.push(name);
        await writeFile(resolve(output, name), canvas.toBuffer('image/png'));
      }
      if (encoder.stdin.destroyed) { await encoded; throw Error('Encoder input closed early'); }
      if (!encoder.stdin.write(canvas.data())) await once(encoder.stdin, 'drain');
      frameCount++;
      if (state.status !== 'fighting' && terminalFrame === undefined) terminalFrame = frame;
      if (terminalFrame !== undefined && frame - terminalFrame >= fps) break;
    }
    encoder.stdin.end(); await encoded;
    assert.ok((eventCounts.monsterDamaged ?? 0) > 0, 'No natural hits');
    assert.equal(admitted.size, openingMonsterCount(0), 'Not all scheduled enemies entered');
    assert.equal(scene.diagnostics.droppedSimulationMs, 0);
    const final = scene.snapshot!;
    const diagnostics = scene.diagnostics;
    const late = [...frames.values()]; scene.dispose();
    for (const callback of late) callback(lastEventMs + 1000);
    assert.equal(scene.snapshot, null); assert.equal(frames.size, 0);
    const bytes = await readFile(videoPath);
    const assetHashes = await Promise.all([...assets].map(async ([path, local]) => ({ path,
      sha256: createHash('sha256').update(await readFile(local)).digest('hex') })));
    report.push({ device, width, height, dpr, fps, frameCount, durationSeconds: frameCount / fps,
      sessionId, levelId: 1, waveIndex: 0, difficulty: 'normal', weaponLevel: 1, houseLevel: 1,
      pet: null, skills: initial.skills, plannedMonsters: openingMonsterCount(0), admitted: admitted.size,
      source: 'Unmodified production opening encounter and CanvasScene frame loop, deterministic clock; offscreen, not WeChat or device evidence. No audio, quiz, upgrade or subsequent waves.',
      final: { status: final.status, baseHp: final.base.hp, incoming: final.incomingMonsters?.length ?? 0 },
      checks: { naturalDamage: true, allEnemiesAdmitted: true, lateDisposeCallback: true, droppedSimulationMs: diagnostics.droppedSimulationMs },
      eventCounts, samples, captures, assets: assetHashes, file: `${device}.mp4`, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') });
    console.log(`${device}: ${frameCount} frames, ${admitted.size} admitted, ${final.status}`);
  } finally { scene.dispose(); if (encoder.exitCode === null) encoder.kill(); }
}
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>首轮自然进攻离屏回放</title><style>body{font:16px system-ui;background:#f6f1e7;color:#263d38;margin:24px}p{max-width:960px;line-height:1.8}article{background:white;padding:20px;margin:24px 0;overflow:auto}video{display:block;max-width:100%;height:auto}img{max-width:100%;height:auto}summary{cursor:pointer}a{color:#215c87}</style><h1>#91 / #98 首轮自然进攻</h1><p>第一关、普通难度、一级武器和堡垒，无技能和宠物。手机与平板共用种子，使用正式出怪工厂与Canvas帧循环；未摆放敌人、修改血量或注入攻击事件。1倍速、30fps、DPR 2。仅为首轮战斗离屏回放，不含听词、升级面板、音频及后续轮次，不是微信或真机录屏，也不代表混战、Boss、完整通关或性能验收。</p><p>审查重点：上方自然入场、实际交战密度、枪口与弹道、主角与墙体的遮挡关系，以及旧怪物与新庭院的材质差异。整场美术仍待整改及用户确认。</p><p><a href="../review.html">已确认整体方向与原参考</a> · <a href="report.json">逐秒状态、事件、资源与视频哈希</a></p>${report.map(r => `<article><h2>${r.device} · ${r.width}×${r.height} · DPR 2</h2><video width="${r.width}" height="${r.height}" controls preload="metadata" poster="${r.device}-3s.png" src="${r.file}"></video><p>${r.durationSeconds.toFixed(2)}秒 · 8只自然入场 · 最终状态 ${r.final.status} · 堡垒生命 ${r.final.baseHp}</p><details><summary>原始DPR 2关键帧</summary>${r.captures.map((name: string) => `<p><a href="${name}">${name}</a></p><img loading="lazy" src="${name}">`).join('')}</details></article>`).join('')}</html>`);
