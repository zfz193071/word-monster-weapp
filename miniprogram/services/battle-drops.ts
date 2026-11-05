import { grandBossCoins } from './coin-wallet';
import type { DifficultyId } from '../fortress/difficulty';
import type { CombatEvent, Point } from '../fortress/types';
import type { createCoinWallet } from './coin-wallet';

type Drop = Extract<CombatEvent, { type: 'coinsDropped' }>;
export function createBattleDrops(options: {
  sessionId: string; levelId: number; difficulty?: DifficultyId;
  monsterPosition?(id: string): Point | undefined;
  grandBosses?: Readonly<Record<string, Point>>;
  wallet: Pick<ReturnType<typeof createCoinWallet>, 'rewardDrop' | 'rewardGrandBoss'>;
  onChange(view: { total: number; error: boolean }): void;
  onAward(position: Point, amount: number): void;
}) {
  const pending = new Map<string, {event: Drop; grand: boolean}>();
  const seen = new Set<string>();
  let total = 0; let ordinaryTotal = 0; let bossTotal = 0; let error = false; let disposed = false;
  function flush() {
    if (disposed) return;
    error = false;
    const awarded: { position: Point; amount: number }[] = [];
    for (const [id, {event, grand}] of pending) {
      try {
        const result = grand ? options.wallet.rewardGrandBoss(options.sessionId, options.levelId, options.difficulty) : options.wallet.rewardDrop(options.sessionId, options.levelId, event.monsterId, event.amount, options.difficulty);
        if (grand) bossTotal = result.total; else ordinaryTotal = result.total;
        total = ordinaryTotal + bossTotal; pending.delete(id);
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
      for (const source of events) {
        const position = 'monsterId' in source ? options.grandBosses?.[source.monsterId] : undefined;
        const grand = source.type === 'monsterDefeated' && !!position;
        const event: CombatEvent = grand && source.type === 'monsterDefeated' ? {...source, type:'coinsDropped', position:options.monsterPosition?.(source.monsterId) ?? position!, amount:grandBossCoins(options.difficulty)} : source;
        if (event.type !== 'coinsDropped' || event.context.sessionId !== options.sessionId || seen.has(event.monsterId)) continue;
        seen.add(event.monsterId); pending.set(event.monsterId, {event, grand});
      }
      if (pending.size && !error) flush();
    },
    retry: flush,
    dispose() { disposed = true; pending.clear(); seen.clear(); },
  };
}
