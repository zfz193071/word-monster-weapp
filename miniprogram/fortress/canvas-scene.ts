import { drawHouseFortress } from '../houses/battle-art';
import { drawTexturedZombie } from './zombie-art';
import { WOOD_FORTRESS_ASSET, WOOD_FORTRESS_RUIN_ASSET, drawWoodFortress } from '../houses/fortress-sprite';
import { soldierType } from './army';
import { SOLDIER_SPRITES, soldierSpritePath } from './soldier-sprites';
import { drawSoldier, drawFallenSoldier } from './soldier-art';
import { weaponAppearance } from '../weapons/appearance';
import type { SkillCollection } from './skill-quality';
import type { BattlePet } from '../pets/battle';
import { drawBattlePet } from '../pets/battle-art';
import { battleBackgroundColor, drawBattleBackground, courtyardAsset, COURTYARD_ASSETS, drawCourtyard } from './battle-background';
import { grandBossWindingUp, bossChargePhase } from './battle-progression';
import { DamageNumbers } from './damage-numbers';
import { baseAttackPose } from './base-attack-pose';
import { CombatRunner } from './combat-runner';
import { createViewport, HorizontalControl, logicalHitbox } from './viewport';
import type { Finger, Viewport } from './viewport';
import type { CombatEvent, CombatState, MonsterVisual, Point, SkillLevels } from './types';
import { createRetirement } from './retirement';
import type { RetirementOptions } from './retirement';

type Canvas = WechatMiniprogram.Canvas;
import { LEVEL_ONE_HERO_ART, LEVEL_ONE_HERO_FRAME } from './hero-art';
type Image = WechatMiniprogram.Image;
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
// Shared elemental identity across projectile trails, status and hit feedback.
const ELEMENT_COLORS = { flame: '#ee9650', frost: '#94dce8', lightning: '#baa6ec', core: '#fff2cf' } as const;
export interface SpriteAsset { readonly path: string; readonly source: string; readonly rights: string; readonly approved: boolean }
export interface MonsterArt {
  readonly animalIds?: readonly string[];
  readonly fruitHat?: SpriteAsset;
  readonly outfitBodies?: Readonly<Record<string, SpriteAsset>>;
  readonly texturedBodies?: Readonly<Record<string, SpriteAsset>>;
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
export interface SceneHud { readonly hp: number; readonly maxHp: number; readonly status: CombatState['status']; readonly frostEnergy: number; readonly frostTarget: boolean }
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
  readonly onLoadProgress?: (percent: number) => void;
  readonly onError: (message: string) => void;
}
export interface FrameDiagnostics { readonly frames: number; readonly maxFrameGapMs: number; readonly recentFrameGapsMs: readonly number[]; readonly droppedSimulationMs: number; readonly peakProjectiles: number }

export class CanvasScene {
  private readonly context: Context;
  private readonly runner: CombatRunner;
  private viewport: Viewport;
  private readonly control: HorizontalControl;
  private effectTime = 0;
  private combatSpeed = 1;
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
  private backgroundCache?: WechatMiniprogram.OffscreenCanvas;
  private backgroundCacheUnavailable = false;
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
    this.viewport = createViewport(options.width, options.height, options.dpr, !!options.initial.automatic);
    this.control = new HorizontalControl(this.viewport, options.clientLeft);
    this.resize(options.width, options.height, options.dpr, options.clientLeft);
  }
  get snapshot(): CombatState | null { return this.runner.snapshot; }
  captureFrame(): string {
    try { return this.canvas.toDataURL('image/png', 1); } catch { return ''; }
  }
  private cancelPresentation?: () => void;
  // Submit a full frame and yield another Canvas frame. This alone is not a
  // view-layer readiness signal; the host also waits for the captured image to load.
  present(): Promise<boolean> {
    this.cancelPresentation?.();
    if (!this.ready || this.disposed) return Promise.resolve(false);
    return new Promise(resolve => {
      let frame: number | undefined;
      const finish = (ready: boolean) => {
        clearTimeout(timeout);
        if (frame !== undefined) this.canvas.cancelAnimationFrame(frame);
        this.cancelPresentation = undefined;
        resolve(ready);
      };
      this.cancelPresentation = () => finish(false);
      const timeout = setTimeout(() => {
        finish(false);
        this.options.onError('战场画面呈现超时，请重试');
      }, 10000);
      frame = this.canvas.requestAnimationFrame(() => {
        try {
          this.draw(this.runner.snapshot!);
          frame = this.canvas.requestAnimationFrame(() => finish(true));
        } catch {
          finish(false); this.options.onError('战场画面绘制失败，请重试');
        }
      });
    });
  }
  applyPet(pet: BattlePet): void { this.runner.applyPet(pet); if (this.ready && this.runner.snapshot) this.draw(this.runner.snapshot); }
  applySkills(skills: SkillLevels, collection?: SkillCollection): void { this.runner.applySkills(skills, collection); if (this.ready && this.runner.snapshot) this.draw(this.runner.snapshot); }
  releaseFrost(): boolean {
    if (!this.ready || this.disposed || this.paused || this.needsResume) return false;
    if (!this.runner.releaseFrost()) return false;
    this.publishHud(this.runner.snapshot!); return true;
  }
  summonSoldier(id: string, debit: () => boolean): boolean {
    if (!this.ready || this.disposed || this.paused || this.needsResume) return false;
    // The existing animation loop draws the committed state on its next frame.
    // Rendering failures must not be reported as a failed inventory transaction.
    return this.runner.summonSoldier(id, debit);
  }
  revive(kind: string, id: string, debit: () => boolean): boolean {
    if (!this.ready || this.disposed || !this.paused) return false;
    return this.runner.revive(kind, id, debit);
  }
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
    this.backgroundCache = undefined;
    const previousWidth = this.viewport.worldWidth;
    this.viewport = createViewport(width, height, dpr, !!this.options.initial.automatic);
    this.runner.resizeArena(this.viewport.worldWidth);
    const ratio = this.viewport.worldWidth / previousWidth;
    this.damageNumbers.resize(ratio);
    this.coinEffects = this.coinEffects.map(effect => ({...effect, position: {...effect.position, x: effect.position.x * ratio}}));
    this.control.resize(this.viewport, clientLeft);
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    if (this.ready && this.runner.snapshot) this.draw(this.runner.snapshot);
  }
  private validateSprites(assets: SpriteAsset[]): void {
    if (assets.some(asset => !asset.approved || !asset.source.trim() || !asset.rights.trim()
      || !(asset.path === WOOD_FORTRESS_ASSET.path || asset.path === WOOD_FORTRESS_RUIN_ASSET.path || COURTYARD_ASSETS.some(ground => ground.path === asset.path) || /^\/(?:assets\/images|learning-assets\/images)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.png$/.test(asset.path)))) throw new Error('战场素材尚未通过审校');
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
    const assets = [art.monster, art.base, art.destroyedBase, art.hero, art.weapon, art.bullet, ...(art.fruitHat ? [art.fruitHat] : []), ...(art.walkParts ? Object.values(art.walkParts) : []), ...Object.values(art.outfitBodies ?? {}), ...Object.values(art.texturedBodies ?? {}), ...Object.values(art.fruitHats ?? {}), ...SOLDIER_SPRITES];
    const courtyard = art.fruitHat && courtyardAsset(this.options.levelId);
    // Preload both orientations so resize can switch immediately while paused or active.
    if (courtyard) assets.push(...COURTYARD_ASSETS);
    if (art.fruitHat && (this.options.initial.houseLevel ?? 1) === 1) assets.push(WOOD_FORTRESS_ASSET, WOOD_FORTRESS_RUIN_ASSET);
    this.validateSprites(assets); this.validateMonster(art); return assets;
  }
  async load(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.ready) { this.schedule(); return true; }
    this.cancelPendingLoads();
    const version = ++this.loadVersion;
    try {
      this.drawBackground();
      this.options.onLoadProgress?.(0);
      const assets = this.validateArt();
      if (assets.length) {
        const unique = [...new Set(assets.map(asset => asset.path))];
        let completed = 0;
        const loaded = await Promise.all(unique.map(async path => {
          const image = await this.loadImage(path);
          if (!this.disposed && version === this.loadVersion) this.options.onLoadProgress?.(Math.floor(++completed / unique.length * 99));
          return image;
        }));
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
      this.options.onLoadProgress?.(100);
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
    const hud = { hp: state.base.hp, maxHp: state.base.maxHp, status: state.status, frostEnergy: state.frostEnergy ?? 0, frostTarget: state.monsters.some(m => m.hp > 0 && m.status !== 'waiting' && m.status !== 'retiring') };
    const key = `${hud.hp}:${hud.maxHp}:${hud.status}:${hud.frostEnergy}:${hud.frostTarget}`;
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
        this.effectTime += this.lastFrameTime === undefined ? 0 : Math.min(100, Math.max(0, now - this.lastFrameTime)) * this.combatSpeed;
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
  setSpeed(value: number): void {
    if (this.disposed) return;
    this.runner.setSpeed(value);
    this.combatSpeed = value;
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
    this.cancelPresentation?.(); this.setPaused(true); this.disposed = true; this.loadVersion++;
    this.retirement?.dispose(); this.cancelPendingLoads(); this.images.clear(); this.backgroundCache = undefined; this.damageNumbers.clear(); this.coinEffects = []; this.runner.dispose(); this.frameGaps = [];
  }
  private drawBackground(): void {
    const c = this.context; const v = this.viewport;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.left * v.dpr, v.top * v.dpr);
    if (!this.ready) {
      c.fillStyle = battleBackgroundColor(this.options.levelId); c.fillRect(0, 0, this.viewport.worldWidth, 560);
      return;
    }
    // Rasterize scenery once at native backing-store size, never at a reduced
    // resolution. Unsupported devices retain the vector rendering path.
    if (!this.backgroundCache && !this.backgroundCacheUnavailable) {
      try {
        if (typeof wx === 'undefined' || typeof wx.createOffscreenCanvas !== 'function') throw new Error('offscreen unavailable');
        const cache = wx.createOffscreenCanvas({ type: '2d', width: this.canvas.width, height: this.canvas.height });
        const context = cache.getContext('2d') as Context;
        context.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.left * v.dpr, v.top * v.dpr);
        this.paintBackground(context);
        this.backgroundCache = cache;
      } catch { this.backgroundCacheUnavailable = true; }
    }
    if (this.backgroundCache) {
      try {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(this.backgroundCache, 0, 0);
        c.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.left * v.dpr, v.top * v.dpr);
        return;
      } catch {
        this.backgroundCache = undefined; this.backgroundCacheUnavailable = true;
        c.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, v.left * v.dpr, v.top * v.dpr);
      }
    }
    this.paintBackground(c);
  }
  private paintBackground(c: Context): void {
    if (this.options.art?.fruitHat) {
      const asset = courtyardAsset(this.options.levelId, this.viewport.worldWidth);
      const image = asset && this.images.get(asset.path);
      if (image) drawCourtyard(c, image, this.viewport.worldWidth);
      else drawBattleBackground(c, this.options.levelId, this.viewport.worldWidth);
    } else {
      c.fillStyle = '#112c36'; c.fillRect(0, 0, this.viewport.worldWidth, 560);
      c.fillStyle = '#21434a';
      for (let y = 32; y < 480; y += 64) for (let x = 24; x < this.viewport.worldWidth; x += 48) c.fillRect(x, y, 2, 2);
    }
  }
  private draw(state: CombatState): void {
    this.drawBackground();
    const c = this.context;
    if (state.base.hp < this.lastHp) this.baseFlashUntil = state.tick + 16;
    this.lastHp = state.base.hp;
    for (const monster of state.monsters) {
      if (monster.hp < (this.lastMonsterHp.get(monster.id) ?? monster.hp)) this.monsterFlashes.set(monster.id, state.tick + 12);
      this.lastMonsterHp.set(monster.id, monster.hp);
    }
    const art = this.options.art;
    if (art?.fruitHat) this.drawAtmosphere(state.tick);
    if (this.options.preview) {
      c.fillStyle = state.base.hp === 0 ? '#55636a' : '#789697'; c.fillRect(0, 480, this.viewport.worldWidth, 80);
      c.fillStyle = '#bdd5c1'; for (let x = 0; x < this.viewport.worldWidth; x += 36) c.fillRect(x, 468, 24, 18);
      c.fillStyle = '#69d7be'; c.fillRect(state.player.x - 15, state.player.y - 15, 30, 30);
      c.fillStyle = '#fbd777'; c.fillRect(state.player.x - 5, state.player.y - 30, 10, 22);
    } else if (art) {
      if (state.base.hp === 0) {
        const ruin = art.fruitHat && (state.houseLevel ?? 1) === 1 && this.images.get(WOOD_FORTRESS_RUIN_ASSET.path);
        if (ruin) drawWoodFortress(c, ruin, this.viewport.worldWidth);
        else for (let x = 0; x < this.viewport.worldWidth; x += 360) this.sprite(art.destroyedBase, x, 480, 360, 80);
      } else {
        const wall = art.fruitHat && (state.houseLevel ?? 1) === 1 && this.images.get(WOOD_FORTRESS_ASSET.path);
        if (wall) drawWoodFortress(c, wall, this.viewport.worldWidth);
        else drawHouseFortress(c, state.houseLevel ?? 1, this.viewport.worldWidth);
      }
      if (art.fruitHat) {
        c.save(); c.translate(state.player.x, state.player.y);
        c.rotate(Math.atan2(state.aimDirection?.x ?? 0, -(state.aimDirection?.y ?? -1)));
        if (art.hero.path === LEVEL_ONE_HERO_ART.path) {
          const frame = LEVEL_ONE_HERO_FRAME;
          this.sprite(art.hero, frame.x, frame.y, frame.width, frame.height);
        } else this.sprite(art.hero, -24, -35, 48, 60);
        const weaponLevel=state.weaponLevel ?? 1;
        if(weaponLevel>=4 && state.base.hp>0){
          const design=weaponAppearance(weaponLevel);
          c.fillStyle=design.light;
          // Cosmetic energy sparks use simulation time, so pause freezes them too.
          for(let i=0;i<weaponLevel-3;i++){
            const phase=state.tick*.06+i*2.1;
            c.globalAlpha=.45+.35*(1+Math.sin(phase))*.5;
            c.fillRect(17+Math.cos(phase)*5,-21+Math.sin(phase)*9,1.5,3);
          }
          c.globalAlpha=1;
        }
        c.restore();
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
      const motionSeed = [...monster.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      c.save(); c.translate(0, attackPose.lunge * 9);
      if (monster.boss || monster.enemyType === 'giant') {
        c.translate(monster.position.x, monster.position.y); c.scale(monster.bossKind === 'grand' ? 2 : 1.5, monster.bossKind === 'grand' ? 2 : 1.5); c.translate(-monster.position.x, -monster.position.y);
      }
      if (monster.enemyType === 'exploder' && monster.explosionRemainingMs !== undefined) {
        c.save(); c.fillStyle = 'rgba(201,65,54,.14)'; c.strokeStyle = '#dc5948'; c.lineWidth = 2;
        c.beginPath(); c.arc(monster.position.x, monster.position.y, 60, 0, Math.PI * 2); c.fill(); c.stroke();
        c.lineWidth = 4; c.beginPath(); c.arc(monster.position.x, monster.position.y, 60, -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * (1 - monster.explosionRemainingMs / 1000)); c.stroke(); c.restore();
      }
      const monsterArt = this.monsterArt;
      if (monsterArt && (monster.status === 'entering' || monster.status === 'alive') && (monster.frozenUntilTick ?? -1) < state.tick
        && !['bee', 'bird', 'fish'].includes(monster.wordId)) {
        const step = ((state.tick + motionSeed) % 44) / 44;
        c.save(); c.globalAlpha = (1 - step) * .2; c.fillStyle = '#fff0c9';
        for (const side of [-1, 1]) {
          c.beginPath(); c.ellipse(monster.position.x + side * (9 + step * 7), monster.position.y + 24 - step * 3, 2 + step * 3, 1.2, 0, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      if (!monsterArt && this.options.preview) {
        c.fillStyle = state.tick < (this.monsterFlashes.get(monster.id) ?? 0) ? '#ffffff' : '#c2a0f0';
        c.beginPath(); c.arc(monster.position.x, monster.position.y, 32, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#21313e'; c.fillRect(monster.position.x - 14, monster.position.y - 6, 8, 10); c.fillRect(monster.position.x + 6, monster.position.y - 6, 8, 10);
      } else if (monsterArt) {
        const scale = monsterArt.monsterWidth / monsterArt.monsterVisual.sourceSize.width;
        if (monster.hp > 0 && state.tick < (this.monsterFlashes.get(monster.id) ?? 0)) {
          // A short impact halo keeps the character readable instead of blinking it away.
          const hit = ((this.monsterFlashes.get(monster.id) ?? 0) - state.tick) / 12;
          c.save(); c.globalAlpha = hit * .7; c.strokeStyle = '#fff2b7'; c.lineWidth = 2;
          c.beginPath(); c.ellipse(monster.position.x, monster.position.y, 23 + (1 - hit) * 9, 27 + (1 - hit) * 7, 0, 0, Math.PI * 2); c.stroke(); c.restore();
        }
        c.imageSmoothingEnabled = monsterArt.monsterVisual.sourceSize.width > 32;
        if (monsterArt.animalIds?.includes(monster.wordId)) {
          this.drawAnimal(monster.wordId, monster.position.x, monster.position.y, monster.hp > 0 && (monster.frozenUntilTick ?? -1) < state.tick && (monster.status === 'alive' || monster.status === 'entering') ? state.tick + motionSeed : 0);
        } else if (!monster.boss && (!monster.enemyType || monster.enemyType === 'normal') && monsterArt.texturedBodies?.[monster.wordId]) {
          const image = this.images.get(monsterArt.texturedBodies[monster.wordId].path);
          if (!image) throw new Error('已预载图片丢失');
          const walking = (monster.frozenUntilTick ?? -1) < state.tick && (monster.status === 'entering' || monster.status === 'alive');
          c.save(); c.translate(monster.position.x, monster.position.y); c.scale(scale, scale);
          drawTexturedZombie(c, image, walking ? Math.sin(state.tick * .07 + motionSeed) : 0);
          c.restore();
        } else if (monsterArt.walkParts) {
          const walking = monster.hp > 0 && (monster.frozenUntilTick ?? -1) < state.tick && (monster.status === 'entering' || monster.status === 'alive');
          const seed = motionSeed;
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
          c.fillStyle = 'rgba(30,52,40,.2)'; c.beginPath(); c.ellipse(1, -40, 21, 20, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff7df'; c.strokeStyle = '#c5ab71'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -44, 20, 0, Math.PI * 2); c.fill(); c.stroke();
          this.sprite(monsterArt.fruitHats?.[monster.wordId] ?? monsterArt.fruitHat, -17, -61, 34, 34);
          c.fillStyle = '#4c5e43'; c.fillRect(-18, 41, 36, 4);
          c.fillStyle = '#b2dc69'; c.fillRect(-18, 41, 36 * monster.hp / monster.maxHp, 4); c.restore();
        }
      }
      if (monster.bossKind === 'grand' && monster.hp > 0) {
        const elapsed = state.tick * 10 - (monster.spawnAtMs ?? 0);
        const warning = grandBossWindingUp(elapsed);
        c.save(); c.translate(monster.position.x, monster.position.y);
        c.fillStyle = '#657982'; c.strokeStyle = '#e8ba58'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-17, -7); c.lineTo(17, -7); c.lineTo(12, 15); c.lineTo(0, 20); c.lineTo(-12, 15); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#f5c54f'; c.beginPath(); c.moveTo(-15, -24); c.lineTo(-17, -39); c.lineTo(-7, -32); c.lineTo(0, -44); c.lineTo(7, -32); c.lineTo(17, -39); c.lineTo(15, -24); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#e55257'; c.fillRect(-3, -31, 6, 5);
        const hat = monsterArt?.fruitHats?.[monster.wordId] ?? monsterArt?.fruitHat;
        if (hat) this.sprite(hat, -9, -66, 18, 18);
        c.fillStyle = '#4a2630'; c.fillRect(-24, 29, 48, 5);
        c.fillStyle = '#f16a59'; c.fillRect(-24, 29, 48 * monster.hp / monster.maxHp, 5);
        if (warning) {
          c.strokeStyle = state.tick % 20 < 10 ? '#ff302f' : '#ff9583'; c.lineWidth = 3;
          c.beginPath(); c.ellipse(0, 22, 30, 10, 0, 0, Math.PI * 2); c.stroke();
          c.fillStyle = '#ff302f'; c.fillRect(-2, -17, 4, 13); c.fillRect(-2, -1, 4, 4);
        }
        c.restore();
      }
      if (monster.boss && monster.bossKind !== 'grand' && monster.hp > 0) {
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
      if (monster.bossKind === 'grand') {
        const elapsed = state.tick * 10 - (monster.spawnAtMs ?? 0);
        const phase = elapsed % 10000;
        if (elapsed >= 11000 && phase >= 1000 && phase < 1400) {
          c.save(); c.globalAlpha = 1 - (phase - 1000) / 400;
          c.strokeStyle = '#ff514c'; c.lineWidth = 5;
          c.beginPath(); c.moveTo(monster.position.x, monster.position.y); c.lineTo(state.player.x, 480); c.stroke();
          c.beginPath(); c.ellipse(state.player.x, 480, 30 + (phase - 1000) / 3, 14, 0, 0, Math.PI * 2); c.stroke(); c.restore();
        }
      }
      if (attackPose.impact > 0) {
        c.save(); c.globalAlpha = attackPose.impact; c.strokeStyle = '#ffe9ad'; c.lineWidth = 3;
        for (let ray = 0; ray < 5; ray++) {
          const angle = Math.PI + ray * Math.PI / 4;
          c.beginPath(); c.moveTo(monster.position.x + Math.cos(angle) * 5, 480 + Math.sin(angle) * 5);
          c.lineTo(monster.position.x + Math.cos(angle) * 17, 480 + Math.sin(angle) * 17); c.stroke();
        }
        c.restore();
      }
      if (monster.hp > 0 && !monster.boss && (monster.frozenUntilTick ?? -1) >= state.tick) {
        c.fillStyle = 'rgba(168,237,249,.35)'; c.strokeStyle = '#dbfbff'; c.lineWidth = 2;
        c.fillRect(monster.position.x - 22, monster.position.y - 34, 44, 56);
        c.strokeRect(monster.position.x - 22, monster.position.y - 34, 44, 56);
      }
      if (monster.hp > 0 && monster.burn && monster.burn.untilTick >= state.tick) {
        c.fillStyle = ELEMENT_COLORS.flame;
        for (let flame = 0; flame < 3; flame++) {
          const x = monster.position.x - 15 + flame * 15;
          const height = 10 + 5 * Math.sin(state.tick * .12 + flame);
          c.beginPath(); c.moveTo(x - 5, monster.position.y + 22); c.lineTo(x, monster.position.y + 12 - height);
          c.lineTo(x + 5, monster.position.y + 22); c.fill();
        }
      }
      if (monster.hp > 0 && (monster.slowUntilTick ?? 0) > state.tick) {
        c.strokeStyle = ELEMENT_COLORS.frost; c.lineWidth = 2; c.beginPath(); c.ellipse(monster.position.x, monster.position.y + 18, 20, 8, 0, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
    }
    drawBattlePet(c, state);
    for (const soldier of state.fallenSoldiers ?? []) drawFallenSoldier(c, soldier, state.tick, state.context.combatId, this.images.get(soldierSpritePath(soldierType(soldier.soldierType))));
    for (const soldier of state.supportSoldiers ?? []) drawSoldier(c, soldier, state.tick, state.context.combatId, this.images.get(soldierSpritePath(soldierType(soldier.soldierType))));
    if ((state.flameFanUntilTick ?? 0) > state.tick) {
      c.save(); c.translate(state.player.x, state.player.y);
      c.rotate(Math.atan2(state.aimDirection?.x ?? 0, -(state.aimDirection?.y ?? -1)));
      c.globalAlpha = Math.min(.6, ((state.flameFanUntilTick ?? 0) - state.tick) / 25);
      c.fillStyle = ELEMENT_COLORS.flame; c.beginPath(); c.moveTo(16.8, -34.4);
      c.arc(16.8, -34.4, 52, -Math.PI * .72, -Math.PI * .28); c.closePath(); c.fill(); c.restore();
    }
    for (const bullet of state.projectiles) {
      if (this.options.preview) { c.fillStyle = '#ffe68e'; c.fillRect(bullet.position.x - bullet.width / 2, bullet.position.y - bullet.height / 2, bullet.width, bullet.height); }
      else if (art) {
        c.save(); c.translate(bullet.position.x, bullet.position.y);
        c.rotate(Math.atan2(bullet.direction?.x ?? 0, -(bullet.direction?.y ?? -1)));
        if (bullet.elements) {
          const colors = [bullet.elements.flame ? ELEMENT_COLORS.flame : '', bullet.elements.frost ? ELEMENT_COLORS.frost : '', bullet.elements.lightning ? ELEMENT_COLORS.lightning : ''].filter(Boolean);
          colors.forEach((color, index) => { c.fillStyle = color; c.globalAlpha = .8; c.beginPath(); c.ellipse((index - (colors.length - 1) / 2) * 5, 7, 4, 15, 0, 0, Math.PI * 2); c.fill(); }); c.globalAlpha = 1;
        }
        this.sprite(art.bullet, -bullet.width / 2, -bullet.height / 2, bullet.width, bullet.height); c.restore();
      }
    }
    for (const impact of state.elementImpacts ?? []) {
      if (impact.untilTick <= state.tick) continue;
      const progress = Math.min(1, Math.max(0, 1 - (impact.untilTick - state.tick) / 35));
      c.save(); c.globalAlpha = (1 - progress) * .85; c.translate(impact.position.x, impact.position.y);
      if (impact.kind === 'flame') {
        const radius = impact.radius ?? 45;
        const ring = radius * (.3 + .7 * progress);
        // A faint interior keeps the target readable even when blasts overlap.
        c.globalAlpha = (1 - progress) * .12;
        c.fillStyle = ELEMENT_COLORS.flame; c.beginPath(); c.arc(0, 0, ring, 0, Math.PI * 2); c.fill();
        c.globalAlpha = (1 - progress) * .7;
        c.strokeStyle = ELEMENT_COLORS.flame; c.lineWidth = 3; c.stroke();
        c.strokeStyle = ELEMENT_COLORS.core; c.lineWidth = 1;
        c.beginPath(); c.arc(0, 0, ring * .88, 0, Math.PI * 2); c.stroke();
        c.fillStyle = ELEMENT_COLORS.core;
        for (let i = 0; i < 7; i++) { const angle = i * Math.PI * 2 / 7; c.beginPath(); c.arc(Math.cos(angle) * ring, Math.sin(angle) * ring, 2 * (1 - progress), 0, Math.PI * 2); c.fill(); }
      } else if (impact.kind === 'frost') {
        c.strokeStyle = ELEMENT_COLORS.frost; c.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const angle = i * Math.PI / 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(angle) * 28, Math.sin(angle) * 28); c.stroke(); }
      } else if (impact.target) {
        const dx = impact.target.x - impact.position.x; const dy = impact.target.y - impact.position.y;
        c.strokeStyle = impact.iceChain ? ELEMENT_COLORS.frost : ELEMENT_COLORS.lightning; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(dx * .3 + 7, dy * .3); c.lineTo(dx * .6 - 7, dy * .6); c.lineTo(dx, dy); c.stroke();
      }
      c.restore();
    }
    for (const number of this.damageNumbers.sample(this.effectTime, this.viewport.worldWidth)) {
      c.save(); c.translate(number.position.x, number.position.y); c.scale(number.scale, number.scale);
      c.globalAlpha = number.opacity; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = '#435343'; c.fillStyle = number.color;
      c.strokeText(number.text, 0, 0); c.fillText(number.text, 0, 0); c.restore();
    }
    if (state.tick < this.baseFlashUntil) { c.fillStyle = 'rgba(255,110,96,0.45)'; c.fillRect(0, 480, this.viewport.worldWidth, 80); }
    this.coinEffects = this.coinEffects.filter(effect => this.effectTime - effect.started < 750);
    for (const effect of this.coinEffects) {
      const progress = Math.min(1, (this.effectTime - effect.started) / 750);
      const travel = Math.max(0, (progress - .25) / .75);
      const x = effect.position.x + (this.viewport.worldWidth - 30 - effect.position.x) * travel * travel;
      const y = effect.position.y + (560 - effect.position.y) * travel * travel - Math.sin(progress * Math.PI) * 36;
      c.save(); c.translate(x, y); c.globalAlpha = 1 - travel * .7;
      c.fillStyle = '#ffe184'; c.strokeStyle = '#bc812d'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(0, 0, 7 + Math.abs(Math.cos(progress * Math.PI * 4)) * 4, 11, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#825525'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, 0);
      if (progress < .55) { c.fillStyle = '#fff1ab'; c.font = 'bold 15px sans-serif'; c.strokeText(`+${effect.amount}`, 0, -20); c.fillText(`+${effect.amount}`, 0, -20); }
      c.restore();
    }
  }
  private drawAtmosphere(tick: number): void {
    const c = this.context;
    // A fixed handful of drifting motes, driven by simulation time. Pause and
    // speed changes share the same clock as walking and hit feedback.
    c.save();
    for (let i = 0; i < 7; i++) {
      const phase = tick * .0007 + i * 1.37;
      const x = ((i * .173 + tick * .000025) % 1) * this.viewport.worldWidth;
      const y = 30 + ((i * 61 + tick * .035) % 400);
      c.globalAlpha = .16 + (1 + Math.sin(phase)) * .08;
      c.fillStyle = i % 2 ? '#fff5c6' : '#e9d092';
      c.beginPath(); c.ellipse(x, y, 2.5, 1.1, phase, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  // Original animal silhouettes with sunken red eyes, fangs and stitched patches.
  private drawAnimal(id: string, x: number, y: number, tick: number): void {
    const c = this.context;
    const stride = tick ? Math.sin(tick * .095) : 0;
    const colors: Record<string, string> = { bear: '#9b704b', bee: '#e6bd38', bird: '#69a8bc', cat: '#77859a', chicken: '#dfd1a5', cow: '#e5e0cb', dog: '#b99770', duck: '#77a96f', elephant: '#87a9a8', fish: '#54acb8', horse: '#ad7657', lion: '#d2aa52', panda: '#e1e2d2', rabbit: '#b8a9ca', sheep: '#e5e4cc', tiger: '#de9749' };
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(37,62,56,.18)'; c.beginPath(); c.ellipse(0, 22, 18, 4, 0, 0, Math.PI * 2); c.fill();
    const oval = (px: number, py: number, rx: number, ry: number, color: string, angle = 0) => { c.fillStyle = color; c.beginPath(); c.ellipse(px, py, rx, ry, angle, 0, Math.PI * 2); c.fill(); if (rx > 6 && ry > 6) { c.strokeStyle = 'rgba(34,52,46,.36)'; c.lineWidth = 1; c.stroke(); } };
    const line = (points: number[], color: string, width = 2) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.stroke(); };
    const body = colors[id];
    if (id === 'bee' || id === 'bird' || id === 'chicken' || id === 'duck') {
      const lift = id === 'bee' || id === 'bird' ? stride * 3 : 0;
      const wingColor = id === 'bee' ? '#c8ede3' : id === 'bird' ? '#91cbd0' : id === 'chicken' ? '#f1e5c6' : '#9caa91';
      oval(-16, -2 + lift, id === 'bee' ? 11 : 8, id === 'bee' ? 6 : 4, wingColor, -.5);
      oval(16, -2 - lift, id === 'bee' ? 11 : 8, id === 'bee' ? 6 : 4, wingColor, .5);
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
    if (id === 'lion') oval(0, -7, 20, 19, '#a6733e');
    if (id === 'sheep') for (let i = 0; i < 10; i++) oval(Math.cos(i * Math.PI / 5) * 12, Math.sin(i * Math.PI / 5) * 10, 7, 7, '#f5f0da');
    oval(0, 4, id === 'fish' ? 19 : 14, id === 'fish' ? 12 : 13, body);
    oval(-4, 0, id === 'fish' ? 10 : 8, 5, 'rgba(255,248,219,.16)', -.3);
    if (id === 'cow') { oval(-8, 2, 5, 5, '#556269'); oval(8, 11, 5, 4, '#556269'); }
    if (id === 'bee') { line([-9, 3, 9, 3], '#596357', 4); line([-8, 10, 8, 10], '#596357', 4); line([-5, -12, -10, -22], '#596357'); line([5, -12, 10, -22], '#596357'); }
    if (id === 'tiger') for (const side of [-1, 1]) { line([side * 12, 1, side * 7, 4], '#5d6651', 3); line([side * 12, 8, side * 8, 10], '#5d6651', 3); }
    if (id === 'cow') { oval(-7, 6, 5, 6, '#596b5d'); oval(7, -1, 4, 4, '#596b5d'); }
    if (id !== 'fish' && id !== 'bee') {
      if (id === 'elephant') { oval(-16, -9, 11, 15, body); oval(16, -9, 11, 15, body); oval(-16, -9, 6, 10, '#b2c1ae'); oval(16, -9, 6, 10, '#b2c1ae'); }
      else if (id === 'rabbit') { oval(-7, -22, 5, 15, body, -.18); oval(7, -22, 5, 15, body, .18); oval(-7, -22, 2, 10, '#dca8b6', -.18); oval(7, -22, 2, 10, '#dca8b6', .18); }
      else if (['cat', 'tiger', 'horse'].includes(id)) {
        c.fillStyle = body;
        for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * 13, -10); c.lineTo(side * 12, -24); c.lineTo(side * 3, -14); c.closePath(); c.fill(); }
      } else if (id === 'dog') { oval(-13, -7, 6, 12, '#765e4c', .25); oval(13, -7, 6, 12, '#765e4c', -.25); }
      else if (['bear', 'panda', 'lion', 'sheep'].includes(id)) { oval(-10, -17, 5, 5, id === 'panda' ? '#53685e' : body); oval(10, -17, 5, 5, id === 'panda' ? '#53685e' : body); }
      oval(0, -7, id === 'horse' ? 9 : 12, id === 'horse' ? 14 : 11, body);
    }
    if (id !== 'fish' && id !== 'bee') oval(-3, -12, 6, 3, 'rgba(255,248,219,.22)', -.25);
    if (id === 'panda') { oval(-6, -8, 5, 6, '#53685e', -.4); oval(6, -8, 5, 6, '#53685e', .4); }
    if (id === 'bear') oval(0, 1, 10, 7, '#c99a69');
    if (id === 'cat') { oval(-7, -2, 5, 4, '#a4b0bf'); oval(7, -2, 5, 4, '#a4b0bf'); }
    if (id === 'horse') {
      line([-7, -20, -10, -28, -3, -25, 1, -29], '#4a5346', 4);
      oval(0, 5, 7, 12, '#c69272');
    }
    if (id === 'panda') {
      oval(-6, -8, 7, 8, '#405149', -.3); oval(6, -8, 7, 8, '#405149', .3);
      oval(0, 2, 8, 6, '#f0eadb');
    }
    if (id === 'bird') {
      c.fillStyle = '#4d879b'; c.beginPath(); c.moveTo(-11, 7); c.lineTo(-20, 16); c.lineTo(-9, 12); c.closePath(); c.fill();
      oval(0, 0, 7, 5, '#8ed1cf');
    }
    if (id === 'chicken') { oval(-3, -21, 4, 6, '#d45c4b'); oval(3, -21, 4, 6, '#d45c4b'); oval(6, 3, 3, 5, '#d45c4b'); }
    if (id === 'dog') oval(0, 3, 9, 6, '#e0c6a0');
    if (id === 'lion') oval(0, 2, 9, 6, '#ead28b');
    if (id === 'rabbit') { oval(0, 2, 7, 5, '#e7dce3'); oval(13, 11, 4, 4, '#e7dce3'); }
    if (id === 'sheep') { oval(0, -5, 10, 11, '#937965'); for (const px of [-10, -4, 3, 10]) oval(px, -17, 4, 5, '#f5f0da'); }
    if (id === 'fish') {
      c.fillStyle = '#40818c'; c.beginPath(); c.moveTo(-5, -8); c.lineTo(3, -21); c.lineTo(10, -7); c.closePath(); c.fill();
      line([8, -2, 11, 2, 8, 6], '#e2d5a1', 2);
      for (const px of [-8, -1, 6]) oval(px, 9, 2, 1, '#aed9cf');
    }
    if (id === 'cow') { line([-8, -15, -13, -23], '#e0d8a0', 3); line([8, -15, 13, -23], '#e0d8a0', 3); }
    // Wide dark sockets and compact glowing pupils remain readable at battle scale.
    oval(-5.5, -8, 3.7, 3.7, '#26352f', -.18); oval(5.5, -7, 3.7, 3.7, '#26352f', .18);
    oval(-5, -7.5, 2.1, 2.1, '#b74e42'); oval(5, -6.5, 2.1, 2.1, '#b74e42');
    oval(-4.5, -7.5, 1, 1.5, '#ffe49b'); oval(4.5, -6.5, 1, 1.5, '#ffe49b');
    line([-11, -13, -2, -10], '#26352f', 2.5); line([2, -9, 11, -12], '#26352f', 2.5);
    oval(0, 6, 4.5, 3.5, '#26352f');
    c.fillStyle = '#e5ddad';
    for (const toothX of [-2.5, 2.5]) {
      c.beginPath(); c.moveTo(toothX - 1.5, 2); c.lineTo(toothX + 1.5, 2); c.lineTo(toothX, 7); c.closePath(); c.fill();
    }
    line([-5, 10, -1, 11, 3, 10], '#4b5946', 1.5);
    if (id === 'elephant') { line([0, -1, 1, 13, 7, 18], '#698f91', 7); line([-5, 5, -9, 9], '#f1dfad', 2); line([5, 5, 9, 9], '#f1dfad', 2); }
    else if (['bird','chicken','duck'].includes(id)) oval(0, -1, id === 'duck' ? 11 : 5, id === 'duck' ? 5 : 3, id === 'duck' ? '#e8ad54' : '#d5b461');
    else oval(0, -1, 3, 2, '#344a3c');
    if (id === 'cow') { oval(0, 5, 10, 7, '#cfaeaa'); oval(-4, 6, 1.4, 1.8, '#6e5a58'); oval(4, 6, 1.4, 1.8, '#6e5a58'); }
    if (id === 'dog') oval(0, 0, 4, 3, '#3f4b3d');
    if (id === 'lion') oval(0, 0, 4, 3, '#735840');
    if (id === 'rabbit') { c.fillStyle = '#fff7e9'; c.fillRect(-3, 6, 2, 5); c.fillRect(1, 6, 2, 5); }
    if (id === 'cat') {
      for (const side of [-1, 1]) { line([side * 4, 0, side * 18, -3], '#e6dcc1', 1.5); line([side * 4, 2, side * 18, 5], '#e6dcc1', 1.5); }
      oval(0, -1, 2.5, 2, '#c88f8d');
    }
    if (id === 'horse') { oval(0, 13, 7, 5, '#d2a080'); oval(-3, 14, 1, 1.5, '#4a5346'); oval(3, 14, 1, 1.5, '#4a5346'); }
    if (id === 'duck') line([-9, 1, 0, 3, 10, 1], '#ae703d', 1.5);
    if (id === 'tiger') {
      line([-5, -19, -2, -15, -1, -12], '#584a36', 2.5); line([5, -19, 2, -15, 1, -12], '#584a36', 2.5);
      line([-11, -4, -8, -2], '#584a36', 2.5); line([11, -4, 8, -2], '#584a36', 2.5);
    }
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
