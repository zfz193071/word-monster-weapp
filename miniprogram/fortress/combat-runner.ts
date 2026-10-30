import { COMBAT_STEP_MS, rebindCombatGeneration, stepCombat } from './combat';
import type { CombatInput } from './combat';
import type { CombatEvent, CombatState } from './types';

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
    const available = this.remainderMs + elapsed;
    const completeSteps = Math.floor(available / COMBAT_STEP_MS);
    const count = Math.min(completeSteps, MAX_STEPS_PER_FRAME);
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
