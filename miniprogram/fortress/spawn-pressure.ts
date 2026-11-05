import type { DifficultyId } from './difficulty';

export const INVASION_BATCH_LIMITS: Readonly<Record<DifficultyId, number>> = Object.freeze({
  easy: 5, normal: 8, hard: 10, nightmare: 12,
});

// Only active simulation time counts; skill selection/background pauses do not age pressure.
export function invasionBatchSize(elapsedMs: number, limit: number): number {
  const size = elapsedMs < 20000 ? 1 : elapsedMs < 60000 ? 2 : elapsedMs < 120000 ? 3
    : elapsedMs < 180000 ? 5 : elapsedMs < 240000 ? 8 : elapsedMs < 300000 ? 10 : 12;
  return Math.min(size, limit);
}
