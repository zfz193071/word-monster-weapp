import { createOpeningPlan } from './opening-plan';
import { createSeededRandom } from './plans';
import type { SessionPlan } from './types';

export interface StageRequest { readonly plan: SessionPlan; readonly generation: number; readonly waveIndex: number; readonly variant?: 'fruit' }
// Each stage has its own reward receipts; replaying preparation keeps the same identity.
export function nextStageRequest(current: StageRequest): StageRequest {
  const level = current.plan.levelId ?? 1;
  if (level >= 8) throw new Error('已完成全部关卡');
  const sessionId = `${current.plan.sessionId}:next:${level + 1}`;
  const seed = [...sessionId].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 17);
  return Object.freeze({plan:createOpeningPlan(sessionId, createSeededRandom(seed >>> 0), level + 1, current.plan.weaponLevel, current.plan.difficulty, current.plan.houseLevel),
    generation:current.generation + 1, waveIndex:0, variant:'fruit'});
}
