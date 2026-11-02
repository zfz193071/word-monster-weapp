import { CombatRunner } from './combat-runner';
import { createViewport, HorizontalControl, logicalHitbox } from './viewport';
import type { Finger, Viewport } from './viewport';
import type { CombatEvent, CombatState, MonsterVisual, SkillLevels } from './types';
import { createRetirement } from './retirement';
import type { RetirementOptions } from './retirement';

type Canvas = WechatMiniprogram.Canvas;
type Image = WechatMiniprogram.Image;
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
export interface SpriteAsset { readonly path: string; readonly source: string; readonly rights: string; readonly approved: boolean }
export interface MonsterArt {
  readonly animalIds?: readonly string[];
  readonly fruitHat?: SpriteAsset;
  readonly outfitBodies?: Readonly<Record<string, SpriteAsset>>;
  readonly fruitHats?: Readonly<Record<string, SpriteAsset>>;
  readonly walkParts?: { readonly body: SpriteAsset; readonly left: SpriteAsset; readonly right: SpriteAsset };
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
  private retiringIds = new Set<string>();
  setRetiringIds(ids: readonly string[]): void {
    this.retiringIds = new Set(ids);
    if (!this.disposed && this.ready && this.runner.snapshot) { this.draw(this.runner.snapshot); this.schedule(); }
  }
  private effectTime = 0;
  private deathStarted = new Map<string, number>();
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
  private lastMonsterHp = new Map<string, number>();
  private monsterFlashes = new Map<string, number>();
  private baseFlashUntil = 0;
  private retirement: ReturnType<typeof createRetirement> | undefined;
  constructor(private readonly canvas: Canvas, private readonly options: SceneOptions) {
    this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('Canvas 2D 初始化失败');
    this.runner = new CombatRunner(options.initial);
    this.lastHp = options.initial.base.hp;
    for (const monster of options.initial.monsters) this.lastMonsterHp.set(monster.id, monster.hp);
    this.viewport = createViewport(options.width, options.height, options.dpr);
    this.control = new HorizontalControl(this.viewport, options.clientLeft);
    this.resize(options.width, options.height, options.dpr, options.clientLeft);
  }
  get snapshot(): CombatState | null { return this.runner.snapshot; }
  captureFrame(): string {
    try { return this.canvas.toDataURL('image/png', 1); } catch { return ''; }
  }
  applySkills(skills: SkillLevels): void { this.runner.applySkills(skills); if (this.ready && this.runner.snapshot) this.draw(this.runner.snapshot); }
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
      || !/^\/(?:assets\/images|learning-assets\/images)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.png$/.test(asset.path))) throw new Error('战场素材尚未通过审校');
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
    const assets = [art.monster, art.base, art.destroyedBase, art.hero, art.weapon, art.bullet, ...(art.fruitHat ? [art.fruitHat] : []), ...(art.walkParts ? Object.values(art.walkParts) : []), ...Object.values(art.outfitBodies ?? {}), ...Object.values(art.fruitHats ?? {})];
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
      || (this.runner.snapshot?.status !== 'fighting' && !this.retirement?.active && !this.retiringIds.size)) return;
    const version = this.frameVersion;
    this.frameId = this.canvas.requestAnimationFrame((now: number) => {
      if (version !== this.frameVersion || this.disposed || this.paused) return;
      this.frameId = undefined;
      try {
        this.effectTime += this.lastFrameTime === undefined ? 0 : Math.min(100, Math.max(0, now - this.lastFrameTime));
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
  private acceptsInput(): boolean { return this.ready && !this.paused && !this.disposed && !this.runner.snapshot?.automatic && this.runner.snapshot?.status === 'fighting'; }
  dispose(): void {
    if (this.disposed) return;
    this.setPaused(true); this.disposed = true; this.loadVersion++;
    this.retirement?.dispose(); this.cancelPendingLoads(); this.images.clear(); this.deathStarted.clear(); this.retiringIds.clear(); this.runner.dispose(); this.frameGaps = [];
  }
  private draw(state: CombatState): void {
    const c = this.context; const v = this.viewport;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.left * v.dpr, v.top * v.dpr);
    if (this.options.art?.fruitHat) {
      c.fillStyle = '#a1b777'; c.fillRect(0, 0, 360, 560);
      c.fillStyle = '#c6c397'; c.beginPath(); c.moveTo(65, 0); c.lineTo(300, 0); c.lineTo(326, 480); c.lineTo(30, 480); c.closePath(); c.fill();
      c.strokeStyle = '#ded8b3'; c.lineWidth = 2;
      for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
        const x = 53 + col * 66 + (row % 2) * 12; const y = row * 64 - 12;
        c.fillStyle = (row + col) % 3 ? '#cbc79e' : '#babd91';
        c.beginPath(); c.moveTo(x + 12, y); c.lineTo(x + 60, y + 8); c.lineTo(x + 64, y + 47); c.lineTo(x + 35, y + 60); c.lineTo(x, y + 45); c.lineTo(x - 3, y + 15); c.closePath(); c.fill(); c.stroke();
      }
      for (let side = 0; side < 2; side++) for (let i = 0; i < 8; i++) {
        const x = side ? 345 : 10; const y = 22 + i * 64;
        c.fillStyle = i % 2 ? '#789858' : '#8ea767'; c.beginPath(); c.arc(x, y, 19, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#9bb773'; c.beginPath(); c.arc(x + 7, y - 7, 11, 0, Math.PI * 2); c.fill();
      }
    } else {
      c.fillStyle = '#112c36'; c.fillRect(0, 0, 360, 560);
      c.fillStyle = '#21434a';
      for (let y = 32; y < 480; y += 64) for (let x = 24; x < 360; x += 48) c.fillRect(x, y, 2, 2);
    }
    if (state.base.hp < this.lastHp) this.baseFlashUntil = state.tick + 16;
    this.lastHp = state.base.hp;
    for (const monster of state.monsters) {
      if (monster.hp < (this.lastMonsterHp.get(monster.id) ?? monster.hp)) this.monsterFlashes.set(monster.id, state.tick + 12);
      this.lastMonsterHp.set(monster.id, monster.hp);
    }
    const art = this.options.art;
    if (this.options.preview) {
      c.fillStyle = state.base.hp === 0 ? '#55636a' : '#789697'; c.fillRect(0, 480, 360, 80);
      c.fillStyle = '#bdd5c1'; for (let x = 0; x < 360; x += 36) c.fillRect(x, 468, 24, 18);
      c.fillStyle = '#69d7be'; c.fillRect(state.player.x - 15, state.player.y - 15, 30, 30);
      c.fillStyle = '#fbd777'; c.fillRect(state.player.x - 5, state.player.y - 30, 10, 22);
    } else if (art) {
      this.sprite(state.base.hp === 0 ? art.destroyedBase : art.base, 0, 480, 360, 80);
      if (art.fruitHat) {
        c.save(); c.translate(state.player.x, state.player.y);
        c.rotate(Math.atan2(state.aimDirection?.x ?? 0, -(state.aimDirection?.y ?? -1)));
        this.sprite(art.hero, -24, -35, 48, 60); c.restore();
      }
      else {
        this.sprite(art.hero, state.player.x - 20, state.player.y - 20, 40, 40);
        this.sprite(art.weapon, state.player.x - 8, state.player.y - 34, 16, 28);
      }
    }
    // Ground splashes are painted below living actors and kept until their word finishes.
    if (art?.fruitHat) for (const monster of state.monsters) {
      if (monster.hp > 0 || !this.retiringIds.has(monster.id)) continue;
      if (!this.deathStarted.has(monster.id)) this.deathStarted.set(monster.id, this.effectTime);
      const age = this.effectTime - this.deathStarted.get(monster.id)!;
      this.drawDeathSplash(monster.position.x, monster.position.y + 21, monster.id, age);
    }
    for (const monster of state.monsters) {
      if (monster.status === 'waiting') continue;
      if (this.options.art?.fruitHat && monster.hp <= 0 && !this.retiringIds.has(monster.id)) continue;
      const deathAge = this.effectTime - (this.deathStarted.get(monster.id) ?? this.effectTime);
      if (art?.fruitHat && monster.hp <= 0 && deathAge >= 240) continue;
      c.globalAlpha = this.retirement ? this.retirement.opacity : monster.hp <= 0 ? .7 * Math.max(0, 1 - deathAge / 240) : 1;
      const monsterArt = this.monsterArt;
      if (!monsterArt && this.options.preview) {
        c.fillStyle = state.tick < (this.monsterFlashes.get(monster.id) ?? 0) ? '#ffffff' : '#c2a0f0';
        c.beginPath(); c.arc(monster.position.x, monster.position.y, 32, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#21313e'; c.fillRect(monster.position.x - 14, monster.position.y - 6, 8, 10); c.fillRect(monster.position.x + 6, monster.position.y - 6, 8, 10);
      } else if (monsterArt) {
        const scale = monsterArt.monsterWidth / monsterArt.monsterVisual.sourceSize.width;
        if (monster.hp > 0 && state.tick < (this.monsterFlashes.get(monster.id) ?? 0)) c.globalAlpha *= 0.55;
        c.imageSmoothingEnabled = monsterArt.monsterVisual.sourceSize.width > 32;
        if (monsterArt.animalIds?.includes(monster.wordId)) {
          this.drawAnimal(monster.wordId, monster.position.x, monster.position.y, monster.hp > 0 && (monster.status === 'alive' || monster.status === 'entering') ? state.tick : 0);
        } else if (monsterArt.walkParts) {
          const walking = monster.hp > 0 && (monster.status === 'entering' || monster.status === 'alive');
          const seed = [...monster.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
          const stride = walking ? Math.sin(state.tick * .07 + seed) : 0;
          c.save(); c.translate(monster.position.x, monster.position.y); c.scale(scale, scale);
          c.fillStyle = 'rgba(37,62,56,.16)'; c.beginPath(); c.ellipse(0, 69, 40, 7, 0, 0, Math.PI * 2); c.fill();
          for (const side of [-1, 1]) {
            const hip = side < 0 ? 50 : 78;
            c.save(); c.translate(hip - 64, 30 + side * stride * 5); c.rotate(side * stride * .23);
            this.sprite(side < 0 ? monsterArt.walkParts.left : monsterArt.walkParts.right, -hip, -110, 128, 160); c.restore();
          }
          this.sprite(monsterArt.outfitBodies?.[monster.wordId] ?? monsterArt.walkParts.body, -64 + stride * 1.5, -80 - Math.abs(stride) * 2, 128, 160); c.restore();
        } else {
          this.sprite(monsterArt.monster, monster.position.x - monsterArt.monsterVisual.anchor.x * scale,
            monster.position.y - monsterArt.monsterVisual.anchor.y * scale, monsterArt.monsterWidth, monsterArt.monsterVisual.sourceSize.height * scale);
        }
        c.imageSmoothingEnabled = true;
        if (monsterArt.fruitHat && !monsterArt.animalIds?.includes(monster.wordId)) {
          const hatScale = monsterArt.monsterWidth / 64;
          c.save(); c.translate(monster.position.x, monster.position.y); c.scale(hatScale, hatScale);
          // White badge keeps each ordinary fruit legible at game scale.
          c.fillStyle = '#fff7df'; c.beginPath(); c.arc(0, -44, 20, 0, Math.PI * 2); c.fill();
          this.sprite(monsterArt.fruitHats?.[monster.wordId] ?? monsterArt.fruitHat, -17, -61, 34, 34);
          c.fillStyle = '#4c5e43'; c.fillRect(-18, 41, 36, 4);
          c.fillStyle = '#b2dc69'; c.fillRect(-18, 41, 36 * monster.hp / monster.maxHp, 4); c.restore();
        }
      }
      if (monster.hp > 0 && (monster.slowUntilTick ?? 0) > state.tick) {
        c.strokeStyle = '#b6f5fa'; c.lineWidth = 2; c.beginPath(); c.ellipse(monster.position.x, monster.position.y + 18, 20, 8, 0, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
    }
    for (const bullet of state.projectiles) {
      if (this.options.preview) { c.fillStyle = '#ffe68e'; c.fillRect(bullet.position.x - bullet.width / 2, bullet.position.y - bullet.height / 2, bullet.width, bullet.height); }
      else if (art) {
        c.save(); c.translate(bullet.position.x, bullet.position.y);
        c.rotate(Math.atan2(bullet.direction?.x ?? 0, -(bullet.direction?.y ?? -1)));
        if (bullet.elements) {
          const colors = [bullet.elements.flame ? '#ff9652' : '', bullet.elements.frost ? '#9ae7f2' : '', bullet.elements.lightning ? '#c7b0ff' : ''].filter(Boolean);
          colors.forEach((color, index) => { c.fillStyle = color; c.globalAlpha = .8; c.beginPath(); c.ellipse((index - (colors.length - 1) / 2) * 5, 7, 4, 15, 0, 0, Math.PI * 2); c.fill(); }); c.globalAlpha = 1;
        }
        this.sprite(art.bullet, -bullet.width / 2, -bullet.height / 2, bullet.width, bullet.height); c.restore();
      }
    }
    for (const impact of state.elementImpacts ?? []) {
      const progress = Math.min(1, Math.max(0, 1 - (impact.untilTick - state.tick) / 35));
      c.save(); c.globalAlpha = (1 - progress) * .85; c.translate(impact.position.x, impact.position.y);
      if (impact.kind === 'flame') {
        c.fillStyle = '#ffbc58'; c.beginPath(); c.arc(0, 0, 45 * (.3 + .7 * progress), 0, Math.PI * 2); c.fill(); c.strokeStyle = '#ed763a'; c.lineWidth = 3; c.stroke();
        c.fillStyle = '#fff3ab'; for (let i = 0; i < 7; i++) { const angle = i * Math.PI * 2 / 7; c.beginPath(); c.arc(Math.cos(angle) * 35 * progress, Math.sin(angle) * 35 * progress, 4, 0, Math.PI * 2); c.fill(); }
      } else if (impact.kind === 'frost') {
        c.strokeStyle = '#d4ffff'; c.lineWidth = 3;
        for (let i = 0; i < 6; i++) { const angle = i * Math.PI / 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(angle) * 28, Math.sin(angle) * 28); c.stroke(); }
      } else if (impact.target) {
        const dx = impact.target.x - impact.position.x; const dy = impact.target.y - impact.position.y;
        c.strokeStyle = '#e0d1ff'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(dx * .3 + 7, dy * .3); c.lineTo(dx * .6 - 7, dy * .6); c.lineTo(dx, dy); c.stroke();
      }
      c.restore();
    }
    if (state.tick < this.baseFlashUntil) { c.fillStyle = 'rgba(255,110,96,0.45)'; c.fillRect(0, 480, 360, 80); }
  }
  // Original geometry: shared zombie eyes and stitches, species-specific silhouettes.
  private drawAnimal(id: string, x: number, y: number, tick: number): void {
    const c = this.context;
    const stride = tick ? Math.sin(tick * .095) : 0;
    const colors: Record<string, string> = { bear: '#9f8a65', bee: '#d5bc54', bird: '#7da9ab', cat: '#96a986', chicken: '#b8bea0', cow: '#d5d4b9', dog: '#a7a071', duck: '#9fb278', elephant: '#91a4a1', fish: '#83a6b4', horse: '#ac9273', lion: '#bca35d', panda: '#c4cdb6', rabbit: '#b4c6b2', sheep: '#cdd4bc', tiger: '#c6a355' };
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(37,62,56,.18)'; c.beginPath(); c.ellipse(0, 22, 18, 4, 0, 0, Math.PI * 2); c.fill();
    const oval = (px: number, py: number, rx: number, ry: number, color: string, angle = 0) => { c.fillStyle = color; c.beginPath(); c.ellipse(px, py, rx, ry, angle, 0, Math.PI * 2); c.fill(); };
    const line = (points: number[], color: string, width = 2) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.stroke(); };
    const body = colors[id];
    if (id === 'bee' || id === 'bird' || id === 'chicken' || id === 'duck') {
      const lift = id === 'bee' || id === 'bird' ? stride * 3 : 0;
      oval(-16, -2 + lift, 8, 4, '#d9e8cf', -.5); oval(16, -2 - lift, 8, 4, '#d9e8cf', .5);
    } else if (id === 'fish') {
      c.fillStyle = '#577f87'; c.beginPath(); c.moveTo(-13, 0); c.lineTo(-23, -10 + stride * 2); c.lineTo(-23, 10 + stride * 2); c.closePath(); c.fill();
    } else {
      // Four legs step in opposing diagonal pairs.
      for (let leg = 0; leg < 4; leg++) oval((leg % 2 ? 1 : -1) * (leg < 2 ? 8 : 13), 13 + (leg % 2 ? 1 : -1) * stride * 3, 3.5, 8, leg < 2 ? '#647866' : '#849379');
      line([13, 3, 22, -3, 20, -11 + stride * 2], body, 4);
    }
    if (id === 'lion') oval(0, -7, 19, 18, '#89794d');
    if (id === 'sheep') for (let i = 0; i < 8; i++) oval(Math.cos(i * Math.PI / 4) * 10, Math.sin(i * Math.PI / 4) * 9, 7, 7, '#dde0c9');
    oval(0, 4, id === 'fish' ? 19 : 14, id === 'fish' ? 12 : 13, body);
    if (id === 'bee') { line([-9, 3, 9, 3], '#596357', 4); line([-8, 10, 8, 10], '#596357', 4); line([-5, -12, -10, -22], '#596357'); line([5, -12, 10, -22], '#596357'); }
    if (id === 'tiger') for (const side of [-1, 1]) { line([side * 12, 1, side * 7, 4], '#5d6651', 3); line([side * 12, 8, side * 8, 10], '#5d6651', 3); }
    if (id === 'cow') { oval(-7, 6, 5, 6, '#596b5d'); oval(7, -1, 4, 4, '#596b5d'); }
    if (id !== 'fish' && id !== 'bee') {
      if (id === 'elephant') { oval(-14, -9, 9, 13, body); oval(14, -9, 9, 13, body); }
      else if (id === 'rabbit') { oval(-7, -20, 4, 12, body, -.18); oval(7, -20, 4, 12, body, .18); }
      else if (['cat', 'tiger', 'horse'].includes(id)) {
        c.fillStyle = body;
        for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * 13, -10); c.lineTo(side * 12, -24); c.lineTo(side * 3, -14); c.closePath(); c.fill(); }
      } else if (id === 'dog') { oval(-12, -8, 5, 10, '#7c8061', .25); oval(12, -8, 5, 10, '#7c8061', -.25); }
      else if (['bear', 'panda', 'lion', 'sheep'].includes(id)) { oval(-10, -17, 5, 5, id === 'panda' ? '#53685e' : body); oval(10, -17, 5, 5, id === 'panda' ? '#53685e' : body); }
      oval(0, -7, id === 'horse' ? 9 : 12, id === 'horse' ? 14 : 11, body);
    }
    if (id === 'panda') { oval(-6, -8, 5, 6, '#53685e', -.4); oval(6, -8, 5, 6, '#53685e', .4); }
    if (id === 'cow') { line([-8, -15, -13, -23], '#e0d8a0', 3); line([8, -15, 13, -23], '#e0d8a0', 3); }
    if (id === 'chicken') { oval(-3, -21, 3, 5, '#b96e5a'); oval(3, -21, 3, 5, '#b96e5a'); }
    oval(-5, -8, 4, 4.5, '#edf0bf'); oval(5, -7, 4, 4.5, '#edf0bf'); oval(-4, -7, 1.5, 2, '#3e594d'); oval(6, -6, 1.5, 2, '#3e594d');
    if (id === 'elephant') { line([0, -1, 0, 11, 5, 14], '#6c8983', 6); }
    else if (['bird','chicken','duck'].includes(id)) oval(0, -1, id === 'duck' ? 8 : 5, 3, '#d5b461');
    else { oval(0, -1, 3, 2, '#526b59'); line([-5, 4, 5, 5], '#526b59'); }
    line([7, -16, 12, -12], '#4f6a58', 1); line([7, -13, 10, -16], '#4f6a58', 1);
    c.restore();
  }
  private drawDeathSplash(x: number, y: number, id: string, age: number): void {
    const c = this.context;
    const seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const spread = Math.min(1, age / 230);
    c.save(); c.translate(x, y); c.scale(.35 + spread * .65, .65);
    c.globalAlpha = .86;
    c.fillStyle = '#526a36'; c.beginPath();
    for (let i = 0; i < 32; i++) {
      const angle = i * Math.PI / 16;
      const radius = i % 2 ? 12 + (seed + i * 7) % 8 : 22 + (seed + i * 13) % 13;
      const px = Math.cos(angle) * radius; const py = Math.sin(angle) * radius;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    c.fillStyle = '#778346'; c.beginPath(); c.ellipse(-3, -1, 15, 11, .2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#384d30';
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse((i * 11 + seed) % 22 - 11, (i * 7) % 14 - 7, 3 + i % 2, 2, i, 0, Math.PI * 2); c.fill(); }
    // Droplets expand outwards, briefly lift, then settle onto the ground.
    const flight = Math.min(1, age / 430);
    c.fillStyle = '#5d753b';
    for (let i = 0; i < 11; i++) {
      const angle = i * Math.PI * 2 / 11 + seed * .13;
      const distance = (30 + (seed + i * 7) % 17) * flight;
      c.beginPath(); c.ellipse(Math.cos(angle) * distance, Math.sin(angle) * distance - Math.sin(flight * Math.PI) * 17, 2 + i % 3, 1.5 + i % 2, angle, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  private sprite(asset: SpriteAsset, x: number, y: number, width: number, height: number): void {
    const image = this.images.get(asset.path);
    if (!image) throw new Error('已预载图片丢失');
    this.context.drawImage(image, x, y, width, height);
  }
}
