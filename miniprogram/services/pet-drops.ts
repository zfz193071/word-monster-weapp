import type { CombatEvent } from '../fortress/types';
import type { createPetStore } from './pet-store';
export function createPetDrops(options: {
  sessionId: string; bossIds: readonly string[]; store: Pick<ReturnType<typeof createPetStore>, 'rewardBoss'>;
  onChange(message: string, error: boolean): void;
}) {
  const pending = new Set<string>(); const seen = new Set<string>(); let disposed = false;
  function retry() {
    if (disposed) return;
    for (const id of pending) {
      let message: string;
      try { message = options.store.rewardBoss(options.sessionId, id); }
      catch { options.onChange('宠物奖励未保存，点击重试', true); return; }
      pending.delete(id); seen.add(id); options.onChange(message, false);
    }
  }
  return {
    handle(events: readonly CombatEvent[]) {
      if (disposed) return;
      for (const e of events) if (e.type === 'monsterDefeated' && e.context.sessionId === options.sessionId && options.bossIds.includes(e.monsterId) && !seen.has(e.monsterId)) pending.add(e.monsterId);
      if (pending.size) retry();
    }, retry,
    dispose() { disposed = true; pending.clear(); seen.clear(); },
  };
}
