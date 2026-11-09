import type { SkillCollection } from './skill-quality';
import type { BattlePet } from '../pets/battle';
import { resizeCombatArena, releaseFrostBurst, reviveCompanion, summonSupportSoldier, attachCombatPet, applyCombatSkills, COMBAT_STEP_MS, rebindCombatGeneration, stepCombat } from './combat';
import type { CombatInput } from './combat';
import type { CombatEvent, CombatState, SkillLevels } from './types';

// Up to 100ms of simulation per frame. Extra elapsed time is dropped, not queued.
export const MAX_STEPS_PER_FRAME = 10;
export interface CombatFrame {
  readonly state: CombatState | null;
  readonly events: readonly CombatEvent[];
  readonly steps: number;
  readonly droppedMs: number;
}

// Caller owns requestAnimationFrame and feeds its timestamp. No global clock,
// timers, wx API or rendering; suitable for Canvas and deterministic replay.
export class CombatRunner {
  private current: CombatState | null;
  private previousTime: number | undefined;
  private remainderMs = 0;
  private paused = false;
  private speed = 1;
  constructor(initial: CombatState) { this.current = initial; }
  get snapshot(): CombatState | null { return this.current; }

  frame(nowMs: number, input: CombatInput = {}): CombatFrame {
    const idle = (): CombatFrame => ({ state: this.current, events: Object.freeze([]), steps: 0, droppedMs: 0 });
    if (!this.current || this.paused || this.current.status !== 'fighting') return idle();
    if (!Number.isFinite(nowMs) || nowMs < 0) throw new RangeError('帧时间必须为非负有限数');
    if (input.playerX !== undefined && !Number.isFinite(input.playerX)) throw new RangeError('playerX 必须是有限数值');
    if (this.previousTime === undefined) { this.previousTime = nowMs; return idle(); }
    if (nowMs < this.previousTime) throw new RangeError('帧时间不能倒退');
    const elapsed = nowMs - this.previousTime;
    this.previousTime = nowMs;
    const available = this.remainderMs + elapsed * this.speed;
    const completeSteps = Math.floor(available / COMBAT_STEP_MS);
    const count = Math.min(completeSteps, MAX_STEPS_PER_FRAME * this.speed);
    const droppedMs = Math.max(0, completeSteps - count) * COMBAT_STEP_MS;
    this.remainderMs = available % COMBAT_STEP_MS;
    const events: CombatEvent[] = [];
    let steps = 0;
    while (steps < count && this.current.status === 'fighting') {
      const next = stepCombat(this.current, input);
      this.current = next.state;
      events.push(...next.events);
      steps++;
    }
    if (this.current.status !== 'fighting') this.remainderMs = 0;
    return { state: this.current, events: Object.freeze(events), steps, droppedMs };
  }
  resizeArena(width: number): void { if (this.current) this.current = resizeCombatArena(this.current, width); }
  setSpeed(value: number): void {
    if (value !== 1 && value !== 1.5 && value !== 2 && value !== 2.5) throw new RangeError('无效战斗倍率');
    this.speed = value;
  }
  releaseFrost(): boolean {
    if (!this.current || this.paused) return false;
    const next = releaseFrostBurst(this.current);
    if (!next) return false;
    this.current = next; return true;
  }
  summonSoldier(id: string, debit: () => boolean): boolean {
    if (!this.current || this.paused) return false;
    const next = summonSupportSoldier(this.current, id);
    if (!next || !debit()) return false;
    // Everything that can reject the spawn runs before the debit. No async gap
    // exists between persisting the debit and installing the prepared snapshot.
    this.current = next;
    return true;
  }
  revive(kind: string, id: string, debit: () => boolean): boolean {
    if (!this.current || !this.paused) return false;
    const next = reviveCompanion(this.current, kind, id);
    if (!next || !debit()) return false;
    this.current = next; return true;
  }
  applyPet(pet: BattlePet): void { if (this.current) this.current = attachCombatPet(this.current, pet); }
  applySkills(skills: SkillLevels, collection?: SkillCollection): void {
    if (this.current) this.current = applyCombatSkills(this.current, skills, collection);
  }
  restoreBase(): void {
    if (!this.current || (this.current.status !== 'cleared' && !(this.current.skillCollection && this.paused && this.current.status === 'fighting')) || this.current.base.hp <= 0 || this.current.base.hp >= this.current.base.maxHp * .5) return;
    this.current = Object.freeze({ ...this.current, base: Object.freeze({ ...this.current.base, hp: this.current.base.maxHp }) });
  }
  pause(): void {
    this.paused = true; this.previousTime = undefined; this.remainderMs = 0;
  }
  resume(nowMs: number, generation: number): void {
    if (!this.current || !this.paused) return;
    if (!Number.isFinite(nowMs) || nowMs < 0) throw new RangeError('帧时间必须为非负有限数');
    this.current = rebindCombatGeneration(this.current, generation);
    this.previousTime = nowMs; this.remainderMs = 0; this.paused = false;
  }
  dispose(): void {
    this.current = null; this.previousTime = undefined; this.remainderMs = 0; this.paused = true;
  }
}
