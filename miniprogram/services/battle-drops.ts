import type { CombatEvent, Point } from '../fortress/types';
import type { createCoinWallet } from './coin-wallet';

type Drop = Extract<CombatEvent, { type: 'coinsDropped' }>;
export function createBattleDrops(options: {
  sessionId: string; levelId: number;
  wallet: Pick<ReturnType<typeof createCoinWallet>, 'rewardDrop'>;
  onChange(view: { total: number; error: boolean }): void;
  onAward(position: Point, amount: number): void;
}) {
  const pending = new Map<string, Drop>();
  const seen = new Set<string>();
  let total = 0; let error = false; let disposed = false;
  function flush() {
    if (disposed) return;
    error = false;
    const awarded: { position: Point; amount: number }[] = [];
    for (const [id, event] of pending) {
      try {
        const result = options.wallet.rewardDrop(options.sessionId, options.levelId, event.monsterId, event.amount);
        total = result.total; pending.delete(id);
        if (result.added) awarded.push({ position: event.position, amount: result.added });
      } catch { error = true; break; }
    }
    options.onChange({ total, error });
    // Only successfully persisted awards produce collection feedback.
    for (const award of awarded) options.onAward(award.position, award.amount);
  }
  return {
    handle(events: readonly CombatEvent[]) {
      if (disposed) return;
      for (const event of events) {
        if (event.type !== 'coinsDropped' || event.context.sessionId !== options.sessionId || seen.has(event.monsterId)) continue;
        seen.add(event.monsterId); pending.set(event.monsterId, event);
      }
      if (pending.size && !error) flush();
    },
    retry: flush,
    dispose() { disposed = true; pending.clear(); seen.clear(); },
  };
}
