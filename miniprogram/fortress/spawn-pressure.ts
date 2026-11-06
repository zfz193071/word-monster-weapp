import { createSeededRandom } from './plans';
import { FORTRESS_RULES } from './rules';
import type { Point } from './types';
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

// Randomise a batch inside the existing upper entry strip. Stable IDs make
// retries/replays deterministic without keeping mutable random state in combat.
export function invasionBatchPositions(ids: readonly string[], startY: number): readonly Point[] {
  let seed = 2166136261;
  for (const char of ids.join('|')) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = createSeededRandom(seed >>> 0);
  const {spawnMinX, spawnMaxX} = FORTRESS_RULES.monster;
  const positions: Point[] = [];
  // Wider batches need more offscreen depth. The old 64px strip squeezed
  // 10–12 full-size monsters into nearly one visible row despite random x.
  const depth = 64 + Math.max(0, ids.length - 6) * 20;
  const spacing = ids.length > 6 ? 42 : 36;
  for (const _id of ids) {
    let best: Point | undefined; let bestDistance = -1;
    // Avoid coincident centres without falling back to a visible grid.
    for (let attempt = 0; attempt < 64; attempt++) {
      const candidate = {x: spawnMinX + random() * (spawnMaxX - spawnMinX), y: startY - random() * depth};
      const distance = positions.reduce((nearest, point) => Math.min(nearest, Math.hypot(point.x - candidate.x, point.y - candidate.y)), Infinity);
      if (distance > bestDistance) { best = candidate; bestDistance = distance; }
      if (distance >= spacing) break;
    }
    positions.push(Object.freeze(best!));
  }
  return Object.freeze(positions);
}
