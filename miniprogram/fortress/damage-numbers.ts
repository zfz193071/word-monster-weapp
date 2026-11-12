import type { CombatEvent, Point } from './types';
export const DAMAGE_NUMBER_DURATION_MS = 800;
export const DAMAGE_NUMBER_FONT = 'bold 18px sans-serif';
type DamageEvent = Extract<CombatEvent, { type: 'monsterDamaged' }>;
interface NumberEffect { event: DamageEvent; started: number; origin: Point; width: number }
export interface DamageNumber { text: string; position: Point; color: string; opacity: number; scale: number }
// A reserved strip of another on-screen unit's interface: its health bar, word
// badge or Boss warning mark. `top`/`bottom` are distances above/below the
// anchor (negative `top` means the strip sits below the anchor).
export interface UiReservation { id: string; position: Point; halfWidth: number; top: number; bottom: number }
const FLOAT_DISTANCE = 30, HEIGHT = 26, GAP = 4;
// A hit number is useful only while it does not hide the unit that was hit.
// This covers the ordinary body plus its learning badge and health bar; it is
// intentionally a visual reservation, not another hitbox or game rule.
const TARGET_HALF_WIDTH = 26, TARGET_TOP = 72, TARGET_BOTTOM = 46;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
// Each real hit keeps its own value. Placement happens once at admission (or
// resize), so later hits/expiry cannot make an existing number jump lanes.
export class DamageNumbers {
  private effects: NumberEffect[] = [];
  private reserved: readonly UiReservation[] = [];
  private now = 0;
  private arenaWidth = 360;
  add(events: readonly CombatEvent[], now: number, arenaWidth = this.arenaWidth, measure?: (text: string) => number,
    reserved?: readonly UiReservation[]): void {
    this.now = now; this.arenaWidth = arenaWidth; if (reserved) this.reserved = reserved; this.prune(now);
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
    for (let row = 0; row < 13; row++) for (const column of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
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
      const targetOverlap = this.targetOverlap(candidate, effect);
      // Other units' bars, badges and warning marks stay readable too, ranked
      // between the target's own interface and the spacing between numbers.
      const uiOverlap = this.otherUiOverlap(candidate, effect);
      // Keep labels, bars and the character readable before optimizing the
      // spacing between numbers. Dense fights still preserve every hit.
      const score = targetOverlap * 1000000 + uiOverlap * 100000 + overlap * 10000 + Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
      if (score < bestScore) { best = candidate; bestScore = score; }
      if (score === 0) break;
    }
    return {x: best.x, y: best.y + FLOAT_DISTANCE * progress};
  }
  private targetOverlap(candidate: Point, effect: NumberEffect): number {
    const half = effect.width / 2;
    const target = effect.event.position;
    const dx = Math.max(0, half + TARGET_HALF_WIDTH - Math.abs(candidate.x - target.x));
    const dy = Math.max(0, HEIGHT / 2 + (TARGET_TOP + TARGET_BOTTOM) / 2
      - Math.abs(candidate.y - (target.y + (TARGET_BOTTOM - TARGET_TOP) / 2)));
    return dx * dy;
  }
  // Own-target interface is already reserved by targetOverlap; skip it here so
  // the ranking between the two pass terms stays independent.
  private otherUiOverlap(candidate: Point, effect: NumberEffect): number {
    const half = effect.width / 2;
    let overlap = 0;
    for (const reservation of this.reserved) {
      if (reservation.id === effect.event.monsterId) continue;
      const dx = Math.max(0, half + reservation.halfWidth + GAP - Math.abs(candidate.x - reservation.position.x));
      const dy = Math.max(0, HEIGHT / 2 + (reservation.top + reservation.bottom) / 2 + GAP
        - Math.abs(candidate.y - (reservation.position.y + (reservation.bottom - reservation.top) / 2)));
      overlap += dx * dy;
    }
    return overlap;
  }
  private prune(now: number) { this.effects = this.effects.filter(effect => now - effect.started < DAMAGE_NUMBER_DURATION_MS); }
  get active(): boolean { return this.effects.length > 0; }
  clear(): void { this.effects = []; }
  resize(ratio: number): void {
    this.arenaWidth *= ratio;
    this.reserved = this.reserved.map(reservation =>
      ({...reservation, position: {x: reservation.position.x * ratio, y: reservation.position.y}}));
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
