import type { CombatEvent, Point } from '../fortress/types';
import type { createPetStore } from './pet-store';
import { PET_EQUIPMENT } from '../pets/catalog';
export interface PetDropAward { monsterId: string; message: string; position: Point; equipmentId?: string; amount?: number; icon?: string; name?: string; symbol?: string; symbolColor?: string; }
export function createPetDrops(options: {
  sessionId: string; bossIds: readonly string[]; store: Pick<ReturnType<typeof createPetStore>, 'rewardBoss'>;
  monsterPosition?(id: string): Point | undefined;
  onChange(message: string, error: boolean): void;
  onAward?(award: PetDropAward): void;
}) {
  const pending = new Map<string, Point | undefined>(); const seen = new Set<string>(); let disposed = false;
  function retry() {
    if (disposed) return;
    for (const [id, defeatedPosition] of pending) {
      let message: string;
      try { 
        const result = options.store.rewardBoss(options.sessionId, id);
        message = result;
        if (result && options.onAward) {
          const position = defeatedPosition ?? options.monsterPosition?.(id) ?? { x: 50, y: 300 };
          const equipmentId = result.match(/获得 (.+)/)?.[1];
          let equipmentIdFromResult: string | undefined;
          if (equipmentId) {
            const catalog = PET_EQUIPMENT.find(e => e.name === equipmentId);
            equipmentIdFromResult = catalog?.id;
          }
          options.onAward({ 
            monsterId: id, 
            message: result, 
            position,
            equipmentId: equipmentIdFromResult,
            amount: result.includes('×') ? parseInt(result.match(/(\d+)/)?.[1] ?? '1') : 1,
            icon: equipmentIdFromResult ? `/assets/images/pets/${equipmentIdFromResult}.png` : undefined,
            name: equipmentIdFromResult ? PET_EQUIPMENT.find(e => e.id === equipmentIdFromResult)?.name : undefined,
            symbol: equipmentIdFromResult ? PET_EQUIPMENT.find(e => e.id === equipmentIdFromResult)?.symbol : undefined,
            symbolColor: equipmentIdFromResult === 'collar' ? '#9b83c1' : undefined,
          });
        }
      }
      catch { options.onChange('宠物奖励未保存，点击重试', true); return; }
      pending.delete(id); seen.add(id); options.onChange(message, false);
    }
  }
  return {
    handle(events: readonly CombatEvent[]) {
      if (disposed) return;
      for (const e of events) if (e.type === 'monsterDefeated' && e.context.sessionId === options.sessionId && options.bossIds.includes(e.monsterId) && !seen.has(e.monsterId)) pending.set(e.monsterId, e.position);
      if (pending.size) retry();
    }, retry,
    dispose() { disposed = true; pending.clear(); seen.clear(); },
  };
}
