import type { BattlePet } from '../pets/battle';
import { drawBattlePet } from '../pets/battle-art';
import { drawBattleBackground } from './battle-background';
import { bossChargePhase } from './battle-progression';
import { DamageNumbers } from './damage-numbers';
import { baseAttackPose } from './base-attack-pose';
import { CombatRunner } from './combat-runner';
import { createViewport, HorizontalControl, logicalHitbox } from './viewport';
import type { Finger, Viewport } from './viewport';
import type { CombatEvent, CombatState, MonsterVisual, Point, SkillLevels } from './types';
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
  readonly outfitColors?: Readonly<Record<string, string>>;
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
  readonly levelId?: number;
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
  private effectTime = 0;
  private coinEffects: { position: Point; amount: number; started: number }[] = [];
  showCoinDrop(position: Point, amount: number): void {
    if (this.disposed || amount <= 0) return;
    this.coinEffects.push({ position: { ...position }, amount, started: this.effectTime });
    if (this.ready && this.runner.snapshot) { this.draw(this.runner.snapshot); this.schedule(); }
  }
  private readonly damageNumbers = new DamageNumbers();
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
  applyPet(pet: BattlePet): void { this.runner.applyPet(pet); if (this.ready && this.runner.snapshot) this.draw(this.runner.snapshot); }
  applySkills(skills: SkillLevels): void { this.runner.applySkills(skills); if (this.ready && this.runner.snapshot) this.draw(this.runner.snapshot); }
  restoreBase(): void {
    this.runner.restoreBase();
    if (this.ready && this.runner.snapshot) { this.draw(this.runner.snapshot); this.publishHud(this.runner.snapshot); }
  }
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
      || (this.runner.snapshot?.status !== 'fighting' && !this.retirement?.active && !this.damageNumbers.active && !this.coinEffects.length)) return;
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
        this.damageNumbers.add(result.events, this.effectTime);
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
    this.retirement?.dispose(); this.cancelPendingLoads(); this.images.clear(); this.damageNumbers.clear(); this.coinEffects = []; this.runner.dispose(); this.frameGaps = [];
  }
  private draw(state: CombatState): void {
    const c = this.context; const v = this.viewport;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.left * v.dpr, v.top * v.dpr);
    if (this.options.art?.fruitHat) {
      drawBattleBackground(c, this.options.levelId);
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
    for (const monster of state.monsters) {
      if (monster.status === 'waiting' || monster.hp <= 0) continue;
      c.globalAlpha = 1;
      const attackPose = baseAttackPose(monster);
      c.save(); c.translate(0, attackPose.lunge * 9);
      if (monster.boss) {
        c.translate(monster.position.x, monster.position.y); c.scale(1.5, 1.5); c.translate(-monster.position.x, -monster.position.y);
      }
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
            const color = monsterArt.outfitColors?.[monster.wordId] ?? '#a28a6e';
            c.translate(-hip, -110); this.drawZombieLeg(side, color); c.restore();
          }
          if (attackPose.lunge !== 0) {
            c.strokeStyle = '#89996b'; c.lineWidth = 16; c.lineCap = 'round';
            for (const side of [-1, 1]) {
              c.beginPath(); c.moveTo(side * 32, -2); c.lineTo(side * 42, 15 + attackPose.lunge * 30); c.stroke();
            }
          }
          this.sprite(monsterArt.outfitBodies?.[monster.wordId] ?? monsterArt.walkParts.body, -64 + stride * 1.5, -80 - Math.abs(stride) * 2, 128, 160); c.restore();
        } else {
          this.sprite(monsterArt.monster, monster.position.x - monsterArt.monsterVisual.anchor.x * scale,
            monster.position.y - monsterArt.monsterVisual.anchor.y * scale, monsterArt.monsterWidth, monsterArt.monsterVisual.sourceSize.height * scale);
        }
        c.imageSmoothingEnabled = true;
        if (monsterArt.fruitHat && !monster.boss && !monsterArt.animalIds?.includes(monster.wordId)) {
          const hatScale = monsterArt.monsterWidth / 64;
          c.save(); c.translate(monster.position.x, monster.position.y); c.scale(hatScale, hatScale);
          // White badge keeps each ordinary fruit legible at game scale.
          c.fillStyle = '#fff7df'; c.beginPath(); c.arc(0, -44, 20, 0, Math.PI * 2); c.fill();
          this.sprite(monsterArt.fruitHats?.[monster.wordId] ?? monsterArt.fruitHat, -17, -61, 34, 34);
          c.fillStyle = '#4c5e43'; c.fillRect(-18, 41, 36, 4);
          c.fillStyle = '#b2dc69'; c.fillRect(-18, 41, 36 * monster.hp / monster.maxHp, 4); c.restore();
        }
      }
      if (monster.boss && monster.hp > 0) {
        const phase = bossChargePhase(state.tick * 10 - (monster.spawnAtMs ?? 0));
        const x = monster.position.x; const y = monster.position.y;
        c.save(); c.translate(x, y);
        c.fillStyle = phase === 'warning' && state.tick % 20 < 10 ? '#ffe48a' : '#a6bbc0';
        c.strokeStyle = '#455f6a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-13, -20); c.lineTo(-11, -36); c.lineTo(11, -36); c.lineTo(13, -20); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#dbe7df'; c.fillRect(-9, -33, 3, 10);
        c.fillStyle = '#879da3'; c.fillRect(-22, -5, 10, 8); c.fillRect(12, -5, 10, 8);
        c.strokeStyle = '#f3c65b'; c.lineWidth = 2; c.strokeRect(-22, -5, 10, 8); c.strokeRect(12, -5, 10, 8);
        // The word badge sits above the helmet, including for animal-category bosses.
        const hat = monsterArt?.fruitHats?.[monster.wordId] ?? monsterArt?.fruitHat;
        if (hat) { c.fillStyle = '#fff7df'; c.beginPath(); c.arc(0, -47, 11, 0, Math.PI * 2); c.fill(); this.sprite(hat, -9, -56, 18, 18); }
        c.fillStyle = '#5e4634'; c.fillRect(-22, 30, 44, 4);
        c.fillStyle = '#f0bb58'; c.fillRect(-22, 30, 44 * monster.hp / monster.maxHp, 4);
        if (phase !== 'normal' && monster.status !== 'attackingBase') {
          c.strokeStyle = phase === 'warning' ? '#ffcf69' : '#ffeaaa'; c.lineWidth = 2;
          for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * 24, -18); c.lineTo(side * 27, 13); c.stroke(); }
        }
        c.restore();
      }
      c.restore();
      if (attackPose.impact > 0) {
        c.save(); c.globalAlpha = attackPose.impact; c.strokeStyle = '#ffe9ad'; c.lineWidth = 3;
        for (let ray = 0; ray < 5; ray++) {
          const angle = Math.PI + ray * Math.PI / 4;
          c.beginPath(); c.moveTo(monster.position.x + Math.cos(angle) * 5, 480 + Math.sin(angle) * 5);
          c.lineTo(monster.position.x + Math.cos(angle) * 17, 480 + Math.sin(angle) * 17); c.stroke();
        }
        c.restore();
      }
      if (monster.hp > 0 && (monster.slowUntilTick ?? 0) > state.tick) {
        c.strokeStyle = '#b6f5fa'; c.lineWidth = 2; c.beginPath(); c.ellipse(monster.position.x, monster.position.y + 18, 20, 8, 0, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
    }
    drawBattlePet(c, state);
    for (const soldier of state.supportSoldiers ?? []) {
      const bob = Math.sin(state.tick * .08 + soldier.slot) * 1.5;
      c.save(); c.translate(soldier.position.x, soldier.position.y + bob);
      c.fillStyle = 'rgba(31,50,42,.2)'; c.beginPath(); c.ellipse(0, 10, 8, 2.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#315a50'; c.fillRect(-5, -2, 10, 9);
      c.fillStyle = '#5f8d64'; c.fillRect(-4, -9, 8, 8);
      c.fillStyle = '#b8d86e'; c.fillRect(-4, -15, 8, 6);
      c.fillStyle = '#243f3a'; c.fillRect(-2, -13, 1.5, 1.5); c.fillRect(2, -13, 1.5, 1.5);
      c.fillStyle = '#a8d4e2'; c.fillRect(-5, -17, 10, 3); c.fillRect(-3, -19, 6, 2);
      c.fillStyle = '#3a4546'; c.fillRect(4, -6, 2, 8); c.fillRect(3, -8, 4, 2);
      c.fillStyle = '#243a35'; c.fillRect(-4, 6, 3, 4); c.fillRect(1, 6, 3, 4);
      if (soldier.hp < soldier.maxHp) {
        c.fillStyle = '#33423a'; c.fillRect(-8, -25, 16, 2);
        c.fillStyle = '#84e3a5'; c.fillRect(-8, -25, 16 * soldier.hp / soldier.maxHp, 2);
      }
      c.restore();
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
    for (const number of this.damageNumbers.sample(this.effectTime)) {
      c.save(); c.translate(number.position.x, number.position.y); c.scale(number.scale, number.scale);
      c.globalAlpha = number.opacity; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = '#435343'; c.fillStyle = number.color;
      c.strokeText(number.text, 0, 0); c.fillText(number.text, 0, 0); c.restore();
    }
    if (state.tick < this.baseFlashUntil) { c.fillStyle = 'rgba(255,110,96,0.45)'; c.fillRect(0, 480, 360, 80); }
    this.coinEffects = this.coinEffects.filter(effect => this.effectTime - effect.started < 750);
    for (const effect of this.coinEffects) {
      const progress = Math.min(1, (this.effectTime - effect.started) / 750);
      const travel = Math.max(0, (progress - .25) / .75);
      const x = effect.position.x + (330 - effect.position.x) * travel * travel;
      const y = effect.position.y + (560 - effect.position.y) * travel * travel - Math.sin(progress * Math.PI) * 36;
      c.save(); c.translate(x, y); c.globalAlpha = 1 - travel * .7;
      c.fillStyle = '#ffe184'; c.strokeStyle = '#bc812d'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(0, 0, 7 + Math.abs(Math.cos(progress * Math.PI * 4)) * 4, 11, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#825525'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, 0);
      if (progress < .55) { c.fillStyle = '#fff1ab'; c.font = 'bold 15px sans-serif'; c.strokeText(`+${effect.amount}`, 0, -20); c.fillText(`+${effect.amount}`, 0, -20); }
      c.restore();
    }
  }
  // Original animal silhouettes with sunken red eyes, fangs and stitched patches.
  private drawAnimal(id: string, x: number, y: number, tick: number): void {
    const c = this.context;
    const stride = tick ? Math.sin(tick * .095) : 0;
    const colors: Record<string, string> = { bear: '#70664e', bee: '#a39543', bird: '#547b79', cat: '#687b5c', chicken: '#8a9472', cow: '#a7ad8b', dog: '#7e7c51', duck: '#748650', elephant: '#637d77', fish: '#547c87', horse: '#817257', lion: '#958345', panda: '#a6b597', rabbit: '#8b9f83', sheep: '#aab497', tiger: '#a38a42' };
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(37,62,56,.18)'; c.beginPath(); c.ellipse(0, 22, 18, 4, 0, 0, Math.PI * 2); c.fill();
    const oval = (px: number, py: number, rx: number, ry: number, color: string, angle = 0) => { c.fillStyle = color; c.beginPath(); c.ellipse(px, py, rx, ry, angle, 0, Math.PI * 2); c.fill(); };
    const line = (points: number[], color: string, width = 2) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.stroke(); };
    const body = colors[id];
    if (id === 'bee' || id === 'bird' || id === 'chicken' || id === 'duck') {
      const lift = id === 'bee' || id === 'bird' ? stride * 3 : 0;
      oval(-16, -2 + lift, 8, 4, '#9caa91', -.5); oval(16, -2 - lift, 8, 4, '#9caa91', .5);
    } else if (id === 'fish') {
      c.fillStyle = '#577f87'; c.beginPath(); c.moveTo(-13, 0); c.lineTo(-23, -10 + stride * 2); c.lineTo(-23, 10 + stride * 2); c.closePath(); c.fill();
    } else {
      // Four legs step in opposing diagonal pairs.
      for (let leg = 0; leg < 4; leg++) {
        const footX = (leg % 2 ? 1 : -1) * (leg < 2 ? 8 : 13);
        const footY = 13 + (leg % 2 ? 1 : -1) * stride * 3;
        oval(footX, footY, 3.5, 8, leg < 2 ? '#465746' : '#64765b');
        for (const offset of [-1.7, 1.7]) line([footX + offset, footY + 5, footX + offset, footY + 8], '#d9d3a7', 1.3);
      }
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
    // Wide dark sockets and compact glowing pupils remain readable at battle scale.
    oval(-5.5, -8, 5.5, 5.5, '#26352f', -.18); oval(5.5, -7, 5.5, 5.5, '#26352f', .18);
    oval(-5, -7.5, 3.2, 3.2, '#b74e42'); oval(5, -6.5, 3.2, 3.2, '#b74e42');
    oval(-4.5, -7.5, 1, 2.3, '#ffe49b'); oval(4.5, -6.5, 1, 2.3, '#ffe49b');
    line([-11, -13, -2, -10], '#26352f', 2.5); line([2, -9, 11, -12], '#26352f', 2.5);
    oval(0, 6, 7.5, 5, '#26352f');
    c.fillStyle = '#e5ddad';
    for (const toothX of [-4, 3]) {
      c.beginPath(); c.moveTo(toothX - 1.5, 2); c.lineTo(toothX + 1.5, 2); c.lineTo(toothX, 7); c.closePath(); c.fill();
    }
    line([-5, 10, -1, 11, 3, 10], '#4b5946', 1.5);
    if (id === 'elephant') { line([0, -1, 0, 11, 5, 14], '#6c8983', 6); }
    else if (['bird','chicken','duck'].includes(id)) oval(0, -1, id === 'duck' ? 8 : 5, 3, '#d5b461');
    else oval(0, -1, 3, 2, '#344a3c');
    // A stitched skin patch adds an undead cue without obscuring ears or markings.
    line([7, -18, 12, -13, 10, -10], '#303f34', 1.5);
    line([7, -15, 11, -18], '#c8c49c', 1); line([9, -12, 14, -15], '#c8c49c', 1);
    line([-12, 7, -8, 9, -11, 13], '#344a3c', 1.5);
    line([-13, 9, -8, 11], '#b6b58d', 1);
    c.restore();
  }
  private sprite(asset: SpriteAsset, x: number, y: number, width: number, height: number): void {
    const image = this.images.get(asset.path);
    if (!image) throw new Error('已预载图片丢失');
    this.context.drawImage(image, x, y, width, height);
  }
  private drawZombieLeg(side: number, color: string): void {
    // Color only the trouser geometry. Compositing a sprite-sized rectangle on
    // the main canvas would also dye the background and the other leg.
    const c = this.context;
    c.strokeStyle = '#374c46'; c.lineWidth = 4; c.lineJoin = 'round';
    c.fillStyle = color; c.beginPath();
    if (side < 0) {
      c.moveTo(39, 108); c.lineTo(35, 143); c.lineTo(55, 144); c.lineTo(63, 116); c.lineTo(59, 108);
    } else {
      c.moveTo(65, 108); c.lineTo(71, 144); c.lineTo(92, 143); c.lineTo(88, 108);
    }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#4d5853'; c.beginPath();
    if (side < 0) {
      c.moveTo(35, 137); c.quadraticCurveTo(18, 143, 25, 150); c.lineTo(56, 150); c.lineTo(56, 139);
    } else {
      c.moveTo(72, 139); c.lineTo(72, 150); c.lineTo(103, 150); c.quadraticCurveTo(110, 141, 91, 136);
    }
    c.closePath(); c.fill(); c.stroke();
  }
}
