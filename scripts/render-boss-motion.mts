import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { bossWaveIndex, bossChargePhase, grandBossWindingUp } from '../miniprogram/fortress/battle-progression';
import { createOpeningEncounter, openingArt, openingMonsterCount } from '../miniprogram/fortress/opening-encounter';

// Selected production Boss wave with declared loadout, not progression from wave one.
// No injected enemy positions, HP, arrivals or events; offscreen, no save access.
const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, process.env.WM_BOSS_OUTPUT ?? 'docs/visual-audit/enemies/approved-parts/boss-motion');
await mkdir(output, { recursive: true });
(globalThis as any).wx = { createOffscreenCanvas: ({ width, height }: any) => createCanvas(width, height) };
const fps = 30, maximumSeconds = 100, dpr = 1;
const report: any[] = [];
for (const kind of ['iron', 'grand'] as const) for (const [device, width, height] of [['phone', 390, 620], ['ipad', 1024, 580]] as const) {
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
  const sessionId = 'boss-art-review-2026-11-11';
  const waveIndex = kind === 'iron' ? bossWaveIndex(sessionId) : 18;
  assert.ok(waveIndex >= 0);
  const weaponLevel = kind === 'iron' ? 3 : 5;
  const initial = createOpeningEncounter(sessionId, 'apple', 1, waveIndex,
    {doubleShot: 2, fireRate: 2, bulletWidth: 1}, undefined, [], 1, weaponLevel, [], 'normal', undefined, 5);
  const plannedBoss = [...initial.monsters, ...(initial.incomingMonsters ?? [])].find(monster => monster.boss)!;
  assert.ok(plannedBoss && plannedBoss.bossKind === kind);
  const clipStartMs = Math.max(0, (plannedBoss.spawnAtMs ?? 0) - 2000);
  const phases = new Set<string>(), bossEvents: any[] = [];
  const basename = `${device}-${kind}`;
  assert.equal(initial.monsters.length + (initial.incomingMonsters?.length ?? 0), openingMonsterCount(waveIndex));
  const eventCounts: Record<string, number> = {};
  const samples: any[] = [], captures: string[] = [];
  const admitted = new Set<string>();
  let lastEventMs = 0;
  const scene = new CanvasScene(canvas, { initial, width, height, dpr, levelId: 1,
    clientLeft: 0, preview: false, art: openingArt('apple', ['apple'], weaponLevel), onHud() {},
    onError(message) { throw Error(message); },
    onEvents(events) { for (const event of events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      if ('monsterId' in event && event.monsterId === plannedBoss.id) bossEvents.push(event);
    } },
  });
  const videoPath = resolve(output, `${basename}.mp4`);
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
      const boss = state.monsters.find(monster => monster.id === plannedBoss.id);
      if (boss && boss.hp > 0 && boss.status !== 'waiting') {
        const elapsed = state.tick * 10 - (boss.spawnAtMs ?? 0);
        const phase = boss.status === 'attackingBase' ? 'attackingBase' : kind === 'iron'
          ? bossChargePhase(elapsed) : grandBossWindingUp(elapsed) ? 'winding' : 'walking';
        const observed = [phase, ...(bossEvents.some(event => event.attackId?.includes('shockwave')) ? ['shockwave'] : [])];
        for (const label of observed) if (!phases.has(label)) {
          phases.add(label); const name = `${basename}-${label}.png`; captures.push(name);
          await writeFile(resolve(output, name), canvas.toBuffer('image/png'));
        }
      }
      if (lastEventMs < clipStartMs) continue;
      if (encoder.stdin.destroyed) { await encoded; throw Error('Encoder input closed early'); }
      if (!encoder.stdin.write(canvas.data())) await once(encoder.stdin, 'drain');
      frameCount++;
      if (state.status !== 'fighting' && terminalFrame === undefined) terminalFrame = frame;
      if (terminalFrame !== undefined && frame - terminalFrame >= fps) break;
    }
    encoder.stdin.end(); await encoded;
    assert.ok(bossEvents.some(event => event.type === 'monsterDamaged'), 'Boss never hit');
    assert.ok(bossEvents.some(event => event.type === 'monsterDefeated'), 'Boss not defeated');
    assert.ok(phases.has('attackingBase'), 'Boss did not reach fortress');
    for (const phase of kind === 'iron' ? ['warning','charging'] : ['winding','shockwave']) assert.ok(phases.has(phase), `Missing ${phase}`);
    assert.equal(admitted.size, openingMonsterCount(waveIndex), 'Not all scheduled enemies entered');
    assert.equal(scene.diagnostics.droppedSimulationMs, 0);
    const final = scene.snapshot!;
    const diagnostics = scene.diagnostics;
    const late = [...frames.values()]; scene.dispose();
    for (const callback of late) callback(lastEventMs + 1000);
    assert.equal(scene.snapshot, null); assert.equal(frames.size, 0);
    const bytes = await readFile(videoPath);
    const assetHashes = await Promise.all([...assets].map(async ([path, local]) => ({ path,
      sha256: createHash('sha256').update(await readFile(local)).digest('hex') })));
    report.push({ device, kind, width, height, dpr, fps, frameCount, clipStartMs, phases: [...phases], bossEvents, durationSeconds: frameCount / fps,
      sessionId, levelId: 1, waveIndex, difficulty: 'normal', weaponLevel, houseLevel: 5,
      pet: null, skills: initial.skills, plannedMonsters: openingMonsterCount(waveIndex), admitted: admitted.size,
      source: 'Selected production Boss wave with declared valid loadout; natural enemy timing, positions, HP and combat events. Video begins two seconds before scheduled Boss arrival. Not full progression, WeChat, audio, device or performance evidence.',
      final: { status: final.status, baseHp: final.base.hp, incoming: final.incomingMonsters?.length ?? 0 },
      checks: { naturalDamage: true, allEnemiesAdmitted: true, lateDisposeCallback: true, droppedSimulationMs: diagnostics.droppedSimulationMs },
      eventCounts, samples, captures, assets: assetHashes, file: `${basename}.mp4`, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') });
    console.log(`${basename}: ${frameCount} frames, ${admitted.size} admitted, ${final.status}`);
  } finally { scene.dispose(); if (encoder.exitCode === null) encoder.kill(); }
}
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(output, 'review.html'), `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Boss 波次动态审查</title><style>body{font:16px system-ui;background:#f6f1e7;color:#263d38;margin:24px}p{line-height:1.8}article{background:white;padding:20px;margin:24px 0}video,img{max-width:100%;height:auto}</style><h1>#92 / #98 Boss 波次离屏回放</h1><p>直接从正式工厂建立指定波次：铁桶第10波、三级武器；王冠第19波、五级武器。第一关、普通难度、五级堡垒，齐射2/射速2/弹宽1，无宠物或士兵。没有修改敌人入场、血量、位置、伤害或奖励；这些为明确的测试初始装备，并非第一波开始的存档通关。30fps，DPR 1；视频从计划Boss到达前2秒开始，后台模拟从该波开始。不是微信、真机、音频或性能验收。</p><p><a href="report.json">装备、事件、逐秒状态、资源与视频哈希</a></p>${report.map(r => `<article><h2>${r.device} · ${r.kind}</h2><video controls preload="metadata" width="${r.width}" poster="${r.captures[0]}" src="${r.file}"></video><p>视频${r.durationSeconds.toFixed(2)}秒，起点模拟${(r.clipStartMs/1000).toFixed(2)}秒，最终${r.final.status}，堡垒生命${r.final.baseHp}。观察阶段：${r.phases.join(', ')}。</p><details><summary>阶段首次出现的截图</summary>${r.captures.map((name: string) => `<p>${name}</p><img loading="lazy" src="${name}">`).join('')}</details></article>`).join('')}</html>`);
