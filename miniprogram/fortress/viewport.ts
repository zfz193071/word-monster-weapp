import { FORTRESS_RULES } from './rules';
import type { MonsterVisual, Rect } from './types';

export interface Viewport { readonly width: number; readonly height: number; readonly dpr: number; readonly scale: number; readonly left: number; readonly top: number }
export function createViewport(width: number, height: number, dpr: number): Viewport {
  if (![width, height, dpr].every(n => Number.isFinite(n) && n > 0)) throw new RangeError('Canvas 尺寸与 DPR 必须为正数');
  const scale = Math.min(width / 360, height / 560);
  return { width, height, dpr, scale, left: (width - 360 * scale) / 2, top: (height - 560 * scale) / 2 };
}
export function logicalHitbox(visual: MonsterVisual, drawWidth: number): Rect {
  if (!Number.isFinite(drawWidth) || drawWidth <= 0 || visual.sourceSize.width <= 0) throw new RangeError('绘制尺寸无效');
  const scale = drawWidth / visual.sourceSize.width;
  return { x: (visual.hitbox.x - visual.anchor.x) * scale, y: (visual.hitbox.y - visual.anchor.y) * scale,
    width: visual.hitbox.width * scale, height: visual.hitbox.height * scale };
}
export interface Finger { readonly identifier: number; readonly clientX: number }
// The separate control strip has the same CSS width as the canvas; its left
// edge is measured in client coordinates, so scrolling never mixes page/client X.
export class HorizontalControl {
  private active: number | undefined;
  private value: number | undefined;
  constructor(private viewport: Viewport, private clientLeft: number) {}
  resize(viewport: Viewport, clientLeft: number): void { this.clear(); this.viewport = viewport; this.clientLeft = clientLeft; }
  start(touches: readonly Finger[]): void {
    if (this.active !== undefined || !touches.length) return;
    this.active = touches[0].identifier; this.move(touches);
  }
  move(touches: readonly Finger[]): void {
    const finger = touches.find(touch => touch.identifier === this.active);
    if (!finger || !Number.isFinite(finger.clientX)) return;
    const x = (finger.clientX - this.clientLeft - this.viewport.left) / this.viewport.scale;
    this.value = Math.max(FORTRESS_RULES.arena.playerMinX, Math.min(FORTRESS_RULES.arena.playerMaxX, x));
  }
  end(changed: readonly Finger[]): void { if (changed.some(touch => touch.identifier === this.active)) this.clear(); }
  clear(): void { this.active = undefined; this.value = undefined; }
  get playerX(): number | undefined { return this.value; }
}
