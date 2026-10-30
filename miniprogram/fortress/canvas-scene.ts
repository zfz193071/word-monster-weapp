import { CombatRunner } from './combat-runner';
import { createViewport, HorizontalControl, logicalHitbox } from './viewport';
import type { Finger, Viewport } from './viewport';
import type { CombatEvent, CombatState, MonsterVisual } from './types';
import { createRetirement } from './retirement';
import type { RetirementOptions } from './retirement';

type Canvas = WechatMiniprogram.Canvas;
type Image = WechatMiniprogram.Image;
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
export interface SpriteAsset { readonly path: string; readonly source: string; readonly rights: string; readonly approved: boolean }
export interface MonsterArt {
  readonly monster: SpriteAsset;
  readonly monsterVisual: MonsterVisual;
  readonly monsterWidth: number;
}
export interface SceneArt extends MonsterArt {
  readonly base: SpriteAsset;
  readonly destroyedBase: SpriteAsset;
  readonly hero: SpriteAsset;
  readonly weapon: SpriteAsset;
  readonly bullet: SpriteAsset;
}
export interface SceneHud { readonly hp: number; readonly maxHp: number; readonly status: CombatState['status'] }
export interface SceneOptions {
  readonly initial: CombatState;
  readonly width: number; readonly height: number; readonly dpr: number; readonly clientLeft: number;
  readonly preview: boolean; // only enabled by a develop-environment gate in the host page
  readonly art?: SceneArt;
  readonly previewMonster?: MonsterArt;
  readonly retirement?: RetirementOptions;
  readonly onHud: (hud: SceneHud) => void;
  readonly onEvents: (events: readonly CombatEvent[]) => void;
  readonly onError: (message: string) => void;
}
export interface FrameDiagnostics { readonly frames: number; readonly maxFrameGapMs: number; readonly recentFrameGapsMs: readonly number[]; readonly droppedSimulationMs: number; readonly peakProjectiles: number }

export class CanvasScene {
  private readonly context: Context;
  private readonly runner: CombatRunner;
  private viewport: Viewport;
  private readonly control: HorizontalControl;
  private images = new Map<string, Image>();
  private cancelLoads: (() => void)[] = [];
  private loadVersion = 0;
  private ready = false;
  private disposed = false;
  private paused = false;
  private needsResume = false;
  private frameId: number | undefined;
  private frameVersion = 0;
  private lastHud = '';
  private lastFrameTime: number | undefined;
  private frameGaps: number[] = [];
  private frames = 0;
  private maxFrameGap = 0;
  private droppedMs = 0;
  private peakProjectiles = 0;
  private lastHp: number;
  private lastMonsterHp: number;
  private baseFlashUntil = 0;
  private monsterFlashUntil = 0;
  private retirement: ReturnType<typeof createRetirement> | undefined;
  constructor(private readonly canvas: Canvas, private readonly options: SceneOptions) {
    this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('Canvas 2D 初始化失败');
    this.runner = new CombatRunner(options.initial);
    this.lastHp = options.initial.base.hp; this.lastMonsterHp = options.initial.monsters[0].hp;
    this.viewport = createViewport(options.width, options.height, options.dpr);
    this.control = new HorizontalControl(this.viewport, options.clientLeft);
    this.resize(options.width, options.height, options.dpr, options.clientLeft);
  }
  get snapshot(): CombatState | null { return this.runner.snapshot; }
  retryRetirement(): void { this.retirement?.retry(); }
  continueRetirement(): void { this.retirement?.continueAfterFailure(); }
  get diagnostics(): FrameDiagnostics {
    return { frames: this.frames, maxFrameGapMs: this.maxFrameGap, recentFrameGapsMs: [...this.frameGaps],
      droppedSimulationMs: this.droppedMs, peakProjectiles: this.peakProjectiles };
  }
  resize(width: number, height: number, dpr: number, clientLeft: number): void {
    if (this.disposed) return;
    this.viewport = createViewport(width, height, dpr);
    this.control.resize(this.viewport, clientLeft);
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    if (this.ready && this.runner.snapshot) this.draw(this.runner.snapshot);
  }
  private validateSprites(assets: SpriteAsset[]): void {
    if (assets.some(asset => !asset.approved || !asset.source.trim() || !asset.rights.trim()
      || !/^\/assets\/images\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.png$/.test(asset.path))) throw new Error('战场素材尚未通过审校');
  }
  private validateMonster(art: MonsterArt): void {
    this.validateSprites([art.monster]);
    if (art.monster.path !== art.monsterVisual.spritePath || art.monsterVisual.wordId !== this.options.initial.monsters[0].wordId) throw new Error('怪物图片与当前目标不匹配');
    const expected = logicalHitbox(art.monsterVisual, art.monsterWidth);
    const actual = this.options.initial.monsters[0].hitbox;
    if ((['x', 'y', 'width', 'height'] as const).some(key => !Number.isFinite(expected[key]) || Math.abs(expected[key] - actual[key]) > 1e-6)) throw new Error('怪物绘制与碰撞区域不一致');
  }
  private get monsterArt(): MonsterArt | undefined { return this.options.preview ? this.options.previewMonster : this.options.art; }
  private validateArt(): SpriteAsset[] {
    if (this.options.preview) {
      if (!this.options.previewMonster) return [];
      this.validateMonster(this.options.previewMonster); return [this.options.previewMonster.monster];
    }
    const art = this.options.art;
    if (!art) throw new Error('战场素材尚未准备完成');
    const assets = [art.monster, art.base, art.destroyedBase, art.hero, art.weapon, art.bullet];
    this.validateSprites(assets); this.validateMonster(art); return assets;
  }
  async load(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.ready) { this.schedule(); return true; }
    this.cancelPendingLoads();
    const version = ++this.loadVersion;
    try {
      const assets = this.validateArt();
      if (assets.length) {
        const unique = [...new Set(assets.map(asset => asset.path))];
        const loaded = await Promise.all(unique.map(path => this.loadImage(path)));
        if (this.disposed || version !== this.loadVersion) return false;
        this.images = new Map(loaded.map((image, index) => [unique[index], image]));
        const visual = this.monsterArt!.monsterVisual;
        const monsterImage = this.images.get(visual.spritePath)!;
        if (monsterImage.width !== visual.sourceSize.width || monsterImage.height !== visual.sourceSize.height) throw new Error('怪物原图尺寸与清单不符');
      }
      if (this.disposed || version !== this.loadVersion) return false;
      this.cancelLoads = [];
      this.ready = true;
      this.draw(this.runner.snapshot!); this.publishHud(this.runner.snapshot!); this.schedule();
      return true;
    } catch (error) {
      if (!this.disposed && version === this.loadVersion) {
        this.ready = false;
        this.cancelPendingLoads(); this.images.clear();
        this.options.onError(error instanceof Error ? error.message : '图片加载失败，请重试');
      }
      return false;
    }
  }
  private loadImage(path: string): Promise<Image> {
    return new Promise((resolve, reject) => {
      const image = this.canvas.createImage(); let settled = false;
      const finish = (error?: Error) => {
        if (settled) return; settled = true; clearTimeout(timer);
        image.onload = () => undefined; image.onerror = () => undefined;
        if (error) reject(error); else resolve(image);
      };
      const timer = setTimeout(() => finish(new Error('图片加载超时，请重试')), 10000);
      this.cancelLoads.push(() => finish(new Error('图片加载已取消')));
      image.onload = () => finish(); image.onerror = () => finish(new Error(`图片加载失败：${path}`));
      try { image.src = path; } catch { finish(new Error('图片读取失败，请重试')); }
    });
  }
  private cancelPendingLoads(): void { for (const cancel of this.cancelLoads) cancel(); this.cancelLoads = []; }
  private publishHud(state: CombatState): void {
    const hud = { hp: state.base.hp, maxHp: state.base.maxHp, status: state.status };
    const key = `${hud.hp}:${hud.maxHp}:${hud.status}`;
    if (key !== this.lastHud) { this.lastHud = key; this.options.onHud(hud); }
  }
  private schedule(): void {
    if (!this.ready || this.disposed || this.paused || this.frameId !== undefined
      || (this.runner.snapshot?.status !== 'fighting' && !this.retirement?.active)) return;
    const version = this.frameVersion;
    this.frameId = this.canvas.requestAnimationFrame((now: number) => {
      if (version !== this.frameVersion || this.disposed || this.paused) return;
      this.frameId = undefined;
      try {
        if (this.retirement) {
          const elapsed = this.lastFrameTime === undefined ? 0 : Math.min(100, Math.max(0, now - this.lastFrameTime));
          this.lastFrameTime = now; this.retirement.advance(elapsed);
          if (!this.disposed && this.runner.snapshot) { this.draw(this.runner.snapshot); this.schedule(); }
          return;
        }
        if (this.needsResume) {
          this.runner.resume(now, this.runner.snapshot!.context.generation + 1); this.needsResume = false;
        }
        const result = this.runner.frame(now, { playerX: this.control.playerX });
        if (!result.state) return;
        this.frames++;
        if (this.lastFrameTime !== undefined) {
          const gap = now - this.lastFrameTime; this.maxFrameGap = Math.max(this.maxFrameGap, gap);
          this.frameGaps.push(gap); if (this.frameGaps.length > 120) this.frameGaps.shift();
        }
        this.lastFrameTime = now; this.droppedMs += result.droppedMs;
        this.peakProjectiles = Math.max(this.peakProjectiles, result.state.projectiles.length);
        this.draw(result.state); this.publishHud(result.state);
        if (result.state.status === 'cleared' && this.options.retirement && !this.retirement) {
          this.retirement = createRetirement(result.state, this.options.retirement);
          this.retirement.start();
        }
        if (result.events.length) this.options.onEvents(result.events);
        this.schedule();
      } catch (error) {
        this.setPaused(true);
        this.options.onError(error instanceof Error ? error.message : '战场运行失败');
      }
    });
  }
  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return;
    this.paused = paused; this.control.clear(); this.lastFrameTime = undefined;
    this.retirement?.setPaused(paused);
    if (paused) {
      this.frameVersion++;
      if (this.frameId !== undefined) this.canvas.cancelAnimationFrame(this.frameId);
      this.frameId = undefined; this.runner.pause(); this.needsResume = true;
    } else this.schedule();
  }
  touchStart(touches: readonly Finger[]): void { if (this.acceptsInput()) this.control.start(touches); }
  touchMove(touches: readonly Finger[]): void { if (this.acceptsInput()) this.control.move(touches); }
  touchEnd(changed: readonly Finger[]): void { this.control.end(changed); }
  touchCancel(): void { this.control.clear(); }
  private acceptsInput(): boolean { return this.ready && !this.paused && !this.disposed && this.runner.snapshot?.status === 'fighting'; }
  dispose(): void {
    if (this.disposed) return;
    this.setPaused(true); this.disposed = true; this.loadVersion++;
    this.retirement?.dispose(); this.cancelPendingLoads(); this.images.clear(); this.runner.dispose(); this.frameGaps = [];
  }
  private draw(state: CombatState): void {
    const c = this.context; const v = this.viewport;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.left * v.dpr, v.top * v.dpr);
    c.fillStyle = '#112c36'; c.fillRect(0, 0, 360, 560);
    c.fillStyle = '#21434a';
    for (let y = 32; y < 480; y += 64) for (let x = 24; x < 360; x += 48) c.fillRect(x, y, 2, 2);
    if (state.base.hp < this.lastHp) this.baseFlashUntil = state.tick + 16;
    if (state.monsters[0].hp < this.lastMonsterHp) this.monsterFlashUntil = state.tick + 12;
    this.lastHp = state.base.hp; this.lastMonsterHp = state.monsters[0].hp;
    const art = this.options.art;
    if (this.options.preview) {
      c.fillStyle = state.base.hp === 0 ? '#55636a' : '#789697'; c.fillRect(0, 480, 360, 80);
      c.fillStyle = '#bdd5c1'; for (let x = 0; x < 360; x += 36) c.fillRect(x, 468, 24, 18);
      c.fillStyle = '#69d7be'; c.fillRect(state.player.x - 15, state.player.y - 15, 30, 30);
      c.fillStyle = '#fbd777'; c.fillRect(state.player.x - 5, state.player.y - 30, 10, 22);
    } else if (art) {
      this.sprite(state.base.hp === 0 ? art.destroyedBase : art.base, 0, 480, 360, 80);
      this.sprite(art.hero, state.player.x - 20, state.player.y - 20, 40, 40);
      this.sprite(art.weapon, state.player.x - 8, state.player.y - 34, 16, 28);
    }
    for (const monster of state.monsters) {
      c.globalAlpha = this.retirement ? this.retirement.opacity : monster.hp <= 0 ? 0.35 : 1;
      const monsterArt = this.monsterArt;
      if (!monsterArt && this.options.preview) {
        c.fillStyle = state.tick < this.monsterFlashUntil ? '#ffffff' : '#c2a0f0';
        c.beginPath(); c.arc(monster.position.x, monster.position.y, 32, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#21313e'; c.fillRect(monster.position.x - 14, monster.position.y - 6, 8, 10); c.fillRect(monster.position.x + 6, monster.position.y - 6, 8, 10);
      } else if (monsterArt) {
        const scale = monsterArt.monsterWidth / monsterArt.monsterVisual.sourceSize.width;
        if (monster.hp > 0 && state.tick < this.monsterFlashUntil) c.globalAlpha *= 0.55;
        c.imageSmoothingEnabled = monsterArt.monsterVisual.sourceSize.width > 32;
        this.sprite(monsterArt.monster, monster.position.x - monsterArt.monsterVisual.anchor.x * scale,
          monster.position.y - monsterArt.monsterVisual.anchor.y * scale, monsterArt.monsterWidth, monsterArt.monsterVisual.sourceSize.height * scale);
        c.imageSmoothingEnabled = true;
      }
      c.globalAlpha = 1;
    }
    for (const bullet of state.projectiles) {
      if (this.options.preview) { c.fillStyle = '#ffe68e'; c.fillRect(bullet.position.x - bullet.width / 2, bullet.position.y - bullet.height / 2, bullet.width, bullet.height); }
      else if (art) this.sprite(art.bullet, bullet.position.x - bullet.width / 2, bullet.position.y - bullet.height / 2, bullet.width, bullet.height);
    }
    if (state.tick < this.baseFlashUntil) { c.fillStyle = 'rgba(255,110,96,0.45)'; c.fillRect(0, 480, 360, 80); }
  }
  private sprite(asset: SpriteAsset, x: number, y: number, width: number, height: number): void {
    const image = this.images.get(asset.path);
    if (!image) throw new Error('已预载图片丢失');
    this.context.drawImage(image, x, y, width, height);
  }
}
