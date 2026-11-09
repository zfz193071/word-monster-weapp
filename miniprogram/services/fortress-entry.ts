import { difficultyStore } from './difficulty-store';
import type { DifficultyId } from '../fortress/difficulty';
import { coinWallet } from './coin-wallet';
import { createSeededRandom } from '../fortress/plans';
import { createOpeningPlan } from '../fortress/opening-plan';
import type { ListeningResult } from '../fortress/listening';
import type { SessionPlan } from '../fortress/types';

export interface FruitRequest {
  readonly plan: SessionPlan;
  readonly waveIndex: 0;
  readonly generation: number;
  readonly variant: 'fruit';
}
export interface FortressEntry { readonly request: FruitRequest; readonly result: ListeningResult }

// An entry is handed to the battle page once, only after the current prompt succeeds.
export function createFortressEntryStore(canEnter: (levelId: number) => boolean = levelId => levelId === 1, equippedLevel: () => number = () => 1, selectedDifficulty: () => DifficultyId = () => 'normal', houseLevel: () => number = () => 1) {
  let sequence = 0;
  let request: FruitRequest | undefined;
  let completed: FortressEntry | undefined;
  let claimed = false;
  return {
    start(now = Date.now(), levelId = 1): FruitRequest {
      if (!canEnter(levelId)) throw new Error('请先通关前面的关卡');
      sequence++;
      request = Object.freeze({ plan: createOpeningPlan(`fruit-${now}-${sequence}`, createSeededRandom((now + sequence) >>> 0), levelId, equippedLevel(), selectedDifficulty(), houseLevel()),
        waveIndex: 0, generation: sequence, variant: 'fruit' });
      completed = undefined; claimed = false;
      return request;
    },
    complete(result: ListeningResult): boolean {
      if (!request || completed || claimed) return false;
      const wave = request.plan.waves[0];
      const last = result.attempts[result.attempts.length - 1];
      if (result.context.sessionId !== request.plan.sessionId || result.context.waveId !== wave.waveId
        || result.context.generation !== request.generation || !last?.correct || last.selectedWordId !== wave.targetWordId
        || result.attempts.some(attempt => attempt.sessionId !== request!.plan.sessionId || attempt.waveId !== wave.waveId || attempt.targetWordId !== wave.targetWordId)) return false;
      completed = Object.freeze({ request, result });
      return true;
    },
    claim(sessionId: string): FortressEntry | undefined {
      if (!completed || claimed || completed.request.plan.sessionId !== sessionId) return undefined;
      claimed = true;
      return completed;
    },
    // Only an unclaimed entry can still belong to the home listening dialog.
    // Once battle claims or releases it, returning home must dismiss that dialog.
    isPending(sessionId: string): boolean {
      return request?.plan.sessionId === sessionId && !claimed;
    },
    release(sessionId: string) {
      if (request?.plan.sessionId !== sessionId) return;
      request = undefined; completed = undefined; claimed = false;
    },
  };
}
export const fortressEntryStore = createFortressEntryStore(levelId => coinWallet.canEnter(levelId), () => coinWallet.equipment().level, () => difficultyStore.read(), () => coinWallet.house().level);
