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
// Spacing cells keep dense fights near-linear instead of comparing every new
// label against every live label. Cell width exceeds any realistic label.
const CELL_X = 128, CELL_Y = HEIGHT + GAP;
interface Occupied { x: number; y: number; width: number }
interface UiBox { id: string; x: number; y: number; halfWidth: number; halfHeight: number }
interface OccupiedIndex { cells: Map<string, Occupied[]>; wide: boolean }
const cellKey = (x: number, y: number) => `${Math.floor(x / CELL_X)},${Math.floor(y / CELL_Y)}`;
function indexOccupied(occupied: readonly Occupied[]): OccupiedIndex {
  const cells = new Map<string, Occupied[]>(); let wide = false;
  for (const item of occupied) {
    if (item.width > CELL_X) wide = true;
    const key = cellKey(item.x, item.y);
    const bucket = cells.get(key); if (bucket) bucket.push(item); else cells.set(key, [item]);
  }
  return { cells, wide };
}
function insertOccupied(index: OccupiedIndex, item: Occupied): void {
  if (item.width > CELL_X) index.wide = true;
  const key = cellKey(item.x, item.y);
  const bucket = index.cells.get(key); if (bucket) bucket.push(item); else index.cells.set(key, [item]);
}
// Precompute reservation geometry once per frame instead of per candidate.
const toBox = (reservation: UiReservation): UiBox => ({
  id: reservation.id,
  x: reservation.position.x,
  y: reservation.position.y + (reservation.bottom - reservation.top) / 2,
  halfWidth: reservation.halfWidth + GAP,
  halfHeight: (reservation.top + reservation.bottom) / 2 + GAP,
});

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
    // Frames without a new hit need no placement work at all.
    if (!events.some(event => event.type === 'monsterDamaged')) return;
    // Existing labels move on a fixed trajectory; cache their positions once
    // so the candidate search does not re-run progress math per comparison.
    const occupied = this.effects.map(effect => ({x: effect.origin.x, y: this.position(effect, now).y, width: effect.width}));
    const index = indexOccupied(occupied);
    const ui = this.reserved.map(reservation => toBox(reservation));
    for (const event of events) {
      if (event.type !== 'monsterDamaged') continue;
      const text = `-${event.damage}`;
      const measured = measure?.(text);
      const width = ((measured !== undefined && Number.isFinite(measured) && measured > 0 ? measured : text.length * 12) + 3) * 1.18;
      const effect: NumberEffect = {event, started: now, origin: event.position, width};
      effect.origin = this.place(effect, now, occupied, index, ui);
      this.effects.push(effect);
      const placed = {x: effect.origin.x, y: this.position(effect, now).y, width};
      occupied.push(placed); insertOccupied(index, placed);
    }
  }
  private progress(effect: NumberEffect, now: number) { return clamp((now - effect.started) / DAMAGE_NUMBER_DURATION_MS, 0, 1); }
  private position(effect: NumberEffect, now: number): Point {
    return {x: effect.origin.x, y: effect.origin.y - FLOAT_DISTANCE * this.progress(effect, now)};
  }
  private place(effect: NumberEffect, now: number,
    occupied: readonly Occupied[], index: OccupiedIndex, ui: readonly UiBox[]): Point {
    const progress = this.progress(effect, now), remaining = FLOAT_DISTANCE * (1 - progress);
    const half = effect.width / 2;
    const anchor = {x: clamp(effect.event.position.x, half + 2, this.arenaWidth - half - 2),
      y: clamp(effect.event.position.y - 12 - FLOAT_DISTANCE * progress, HEIGHT / 2 + remaining + 2, 480 - HEIGHT / 2 - 2)};
    // Only very wide labels can reach beyond the neighbouring cells; those
    // fall back to a full scan so narrow labels keep the fast path.
    const useIndex = !index.wide && effect.width <= CELL_X;
    let best = anchor, bestScore = Infinity;
    // Bounded local search. Prefer nearby clear positions, but never suppress or
    // merge actual hits when density exceeds the available screen space.
    for (let row = 0; row < 13; row++) for (const column of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      const offsetY = row === 0 ? 0 : Math.ceil(row / 2) * (HEIGHT + GAP) * (row % 2 ? -1 : 1);
      const candidate = {x: clamp(anchor.x + column * (effect.width + GAP), half + 2, this.arenaWidth - half - 2),
        y: clamp(anchor.y + offsetY, HEIGHT / 2 + remaining + 2, 480 - HEIGHT / 2 - 2)};
      let overlap = 0;
      if (useIndex) {
        const gx = Math.floor(candidate.x / CELL_X), gy = Math.floor(candidate.y / CELL_Y);
        // ±2 columns covers the label half-width plus GAP even for full cells.
        for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
          const bucket = index.cells.get(`${gx + dx},${gy + dy}`);
          if (!bucket) continue;
          for (const other of bucket) {
            const ox = Math.max(0, (effect.width + other.width) / 2 + GAP - Math.abs(candidate.x - other.x));
            const oy = Math.max(0, HEIGHT + GAP - Math.abs(candidate.y - other.y));
            overlap += ox * oy;
          }
        }
      } else {
        for (const other of occupied) {
          const dx = Math.max(0, (effect.width + other.width) / 2 + GAP - Math.abs(candidate.x - other.x));
          const dy = Math.max(0, HEIGHT + GAP - Math.abs(candidate.y - other.y));
          overlap += dx * dy;
        }
      }
      const targetOverlap = this.targetOverlap(candidate, effect);
      // Other units' bars, badges and warning marks stay readable too, ranked
      // between the target's own interface and the spacing between numbers.
      const uiOverlap = this.otherUiOverlap(candidate, effect, ui);
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
  private otherUiOverlap(candidate: Point, effect: NumberEffect, ui: readonly UiBox[]): number {
    const half = effect.width / 2;
    let overlap = 0;
    for (const reservation of ui) {
      if (reservation.id === effect.event.monsterId) continue;
      const dx = Math.max(0, half + reservation.halfWidth - Math.abs(candidate.x - reservation.x));
      const dy = Math.max(0, HEIGHT / 2 + reservation.halfHeight - Math.abs(candidate.y - reservation.y));
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
    const ui = this.reserved.map(reservation => toBox(reservation));
    const occupied: Occupied[] = [];
    const index = indexOccupied(occupied);
    for (const effect of pending) {
      const resized = {...effect, event: {...effect.event, position: {...effect.event.position, x: effect.event.position.x * ratio}}};
      resized.origin = this.place(resized, this.now, occupied, index, ui); this.effects.push(resized);
      const placed = {x: resized.origin.x, y: this.position(resized, this.now).y, width: resized.width};
      occupied.push(placed); insertOccupied(index, placed);
    }
  }
  sample(now: number, arenaWidth = this.arenaWidth): readonly DamageNumber[] {
    this.now = now;
    if (!this.effects.length) return [];
    this.prune(now);
    if (arenaWidth !== this.arenaWidth) this.resize(arenaWidth / this.arenaWidth);
    return this.effects.map(effect => {
      const {event} = effect, progress = this.progress(effect, now);
      return {text: `-${event.damage}`, color: event.kind === 'flame' ? '#ffbc6b' : (event.kind === 'lightning' || event.kind === 'pet') ? '#d8bdff' : event.kind === 'soldier' ? '#b7f2d3' : '#fff8d6',
        position: this.position(effect, now), opacity: Math.min(1, (1 - progress) / .45),
        scale: 1 + .18 * Math.max(0, 1 - progress * 5)};
    });
  }
}
