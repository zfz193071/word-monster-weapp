import type { CombatEvent, Point } from './types';
export const DAMAGE_NUMBER_DURATION_MS = 800;
export const DAMAGE_NUMBER_FONT = 'bold 18px sans-serif';
type DamageEvent = Extract<CombatEvent, { type: 'monsterDamaged' }>;
interface NumberEffect { event: DamageEvent; started: number; origin: Point; width: number }
export interface DamageNumber { text: string; position: Point; color: string; opacity: number; scale: number }
const FLOAT_DISTANCE = 30, HEIGHT = 26, GAP = 4;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
// Each real hit keeps its own value. Placement happens once at admission (or
// resize), so later hits/expiry cannot make an existing number jump lanes.
export class DamageNumbers {
  private effects: NumberEffect[] = [];
  private now = 0;
  private arenaWidth = 360;
  add(events: readonly CombatEvent[], now: number, arenaWidth = this.arenaWidth, measure?: (text: string) => number): void {
    this.now = now; this.arenaWidth = arenaWidth; this.prune(now);
    for (const event of events) {
      if (event.type !== 'monsterDamaged') continue;
      const text = `-${event.damage}`;
      const measured = measure?.(text);
      const width = ((measured !== undefined && Number.isFinite(measured) && measured > 0 ? measured : text.length * 12) + 3) * 1.18;
      const effect: NumberEffect = {event, started: now, origin: event.position, width};
      effect.origin = this.place(effect, now);
      this.effects.push(effect);
    }
  }
  private progress(effect: NumberEffect, now: number) { return clamp((now - effect.started) / DAMAGE_NUMBER_DURATION_MS, 0, 1); }
  private position(effect: NumberEffect, now: number): Point {
    return {x: effect.origin.x, y: effect.origin.y - FLOAT_DISTANCE * this.progress(effect, now)};
  }
  private place(effect: NumberEffect, now: number): Point {
    const progress = this.progress(effect, now), remaining = FLOAT_DISTANCE * (1 - progress);
    const half = effect.width / 2;
    const anchor = {x: clamp(effect.event.position.x, half + 2, this.arenaWidth - half - 2),
      y: clamp(effect.event.position.y - 12 - FLOAT_DISTANCE * progress, HEIGHT / 2 + remaining + 2, 480 - HEIGHT / 2 - 2)};
    let best = anchor, bestScore = Infinity;
    // Bounded local search. Prefer nearby clear positions, but never suppress or
    // merge actual hits when density exceeds the available screen space.
    for (let row = 0; row < 9; row++) for (const column of [0, -1, 1, -2, 2]) {
      const offsetY = row === 0 ? 0 : Math.ceil(row / 2) * (HEIGHT + GAP) * (row % 2 ? -1 : 1);
      const candidate = {x: clamp(anchor.x + column * (effect.width + GAP), half + 2, this.arenaWidth - half - 2),
        y: clamp(anchor.y + offsetY, HEIGHT / 2 + remaining + 2, 480 - HEIGHT / 2 - 2)};
      let overlap = 0;
      for (const other of this.effects) {
        const p = this.position(other, now);
        const dx = Math.max(0, (effect.width + other.width) / 2 + GAP - Math.abs(candidate.x - p.x));
        const dy = Math.max(0, HEIGHT + GAP - Math.abs(candidate.y - p.y));
        overlap += dx * dy;
      }
      const score = overlap * 10000 + Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
      if (score < bestScore) { best = candidate; bestScore = score; }
      if (score === 0) break;
    }
    return {x: best.x, y: best.y + FLOAT_DISTANCE * progress};
  }
  private prune(now: number) { this.effects = this.effects.filter(effect => now - effect.started < DAMAGE_NUMBER_DURATION_MS); }
  get active(): boolean { return this.effects.length > 0; }
  clear(): void { this.effects = []; }
  resize(ratio: number): void {
    this.arenaWidth *= ratio;
    const pending = this.effects; this.effects = [];
    for (const effect of pending) {
      const resized = {...effect, event: {...effect.event, position: {...effect.event.position, x: effect.event.position.x * ratio}}};
      resized.origin = this.place(resized, this.now); this.effects.push(resized);
    }
  }
  sample(now: number, arenaWidth = this.arenaWidth): readonly DamageNumber[] {
    this.now = now; this.prune(now);
    if (arenaWidth !== this.arenaWidth) this.resize(arenaWidth / this.arenaWidth);
    return this.effects.map(effect => {
      const {event} = effect, progress = this.progress(effect, now);
      return {text: `-${event.damage}`, color: event.kind === 'flame' ? '#ffbc6b' : (event.kind === 'lightning' || event.kind === 'pet') ? '#d8bdff' : event.kind === 'soldier' ? '#b7f2d3' : '#fff8d6',
        position: this.position(effect, now), opacity: Math.min(1, (1 - progress) / .45),
        scale: 1 + .18 * Math.max(0, 1 - progress * 5)};
    });
  }
}
