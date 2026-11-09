import type { CombatEvent, Point } from './types';
export const DAMAGE_NUMBER_DURATION_MS = 800;
type DamageEvent = Extract<CombatEvent, { type: 'monsterDamaged' }>;
interface NumberEffect { event: DamageEvent; started: number; lane: number }
export interface DamageNumber { text: string; position: Point; color: string; opacity: number; scale: number }
// Pure visual timeline; each actual damage event gets its own number (including overkill).
export class DamageNumbers {
  private effects: NumberEffect[] = [];
  add(events: readonly CombatEvent[], now: number): void {
    this.prune(now);
    for (const event of events) {
      if (event.type !== 'monsterDamaged') continue;
      const occupied = new Set(this.effects.filter(effect => effect.event.monsterId === event.monsterId).map(effect => effect.lane));
      let lane = 0; while (occupied.has(lane)) lane++;
      this.effects.push({ event, started: now, lane });
    }
  }
  private prune(now: number) { this.effects = this.effects.filter(effect => now - effect.started < DAMAGE_NUMBER_DURATION_MS); }
  get active(): boolean { return this.effects.length > 0; }
  clear(): void { this.effects = []; }
  resize(ratio: number): void { this.effects = this.effects.map(effect => ({...effect, event: {...effect.event, position: {...effect.event.position, x: effect.event.position.x * ratio}}})); }
  sample(now: number, arenaWidth = 360): readonly DamageNumber[] {
    this.prune(now);
    return this.effects.map(({ event, started, lane }) => {
      const progress = Math.max(0, (now - started) / DAMAGE_NUMBER_DURATION_MS);
      return { text: `-${event.damage}`, color: event.kind === 'flame' ? '#ffbc6b' : (event.kind === 'lightning' || event.kind === 'pet') ? '#d8bdff' : event.kind === 'soldier' ? '#b7f2d3' : '#fff8d6',
        position: { x: Math.max(22, Math.min(arenaWidth - 22, event.position.x + [0, -22, 22][lane % 3])), y: Math.max(24, event.position.y - 12) - 30 * progress - Math.floor(lane / 3) * 20 },
        opacity: Math.min(1, (1 - progress) / .45), scale: 1 + .18 * Math.max(0, 1 - progress * 5) };
    });
  }
}
