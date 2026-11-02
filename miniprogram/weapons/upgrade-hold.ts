import { weaponForLevel } from './catalog';
interface Equipment { balance: number; level: number }
export interface UpgradeView extends Equipment { progress: number; holding: boolean; error: string }
interface Wallet {
  equipment(): Equipment;
  upgradeWeapon(expectedLevel: number): Equipment & { upgraded: boolean };
}
export function createUpgradeHold(options: {
  wallet: Wallet; onChange(view: UpgradeView): void;
  now?: () => number;
  schedule?: (callback: () => void) => unknown;
  cancel?: (timer: unknown) => void;
}) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? (callback => setTimeout(callback, 50));
  const cancel = options.cancel ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  let view: UpgradeView = { balance: 0, level: 1, progress: 0, holding: false, error: '' };
  let timer: unknown; let revision = 0; let disposed = false; let started = 0;
  const publish = () => { if (!disposed) options.onChange({ ...view }); };
  const affordable = () => { const cost = weaponForLevel(view.level).nextCost; return cost !== null && view.balance >= cost; };
  function stop(notify = true) {
    revision++;
    if (timer !== undefined) cancel(timer);
    timer = undefined; view = { ...view, progress: 0, holding: false }; if (notify) publish();
  }
  function refresh() {
    stop(false);
    try { view = { ...view, ...options.wallet.equipment(), error: '' }; }
    catch { view = { ...view, error: '武器记录暂时无法读取，请重试' }; }
    publish();
  }
  function tick(epoch: number) {
    if (disposed || epoch !== revision || !view.holding) return;
    timer = undefined;
    const elapsed = now() - started;
    if (elapsed >= 1000) {
      try {
        const result = options.wallet.upgradeWeapon(view.level);
        view = { ...view, balance: result.balance, level: result.level, progress: 0 };
        if (!result.upgraded || !affordable()) { stop(); return; }
        // Never catch up missed seconds with several charges at once.
        started = now();
      } catch { view = { ...view, error: '升级未完成，请重试' }; stop(); return; }
    } else { view = { ...view, progress: Math.max(0, Math.min(100, elapsed / 10)) }; }
    publish();
    timer = schedule(() => tick(epoch));
  }
  return {
    refresh,
    start() {
      if (disposed || view.holding) return;
      refresh();
      if (view.error || !affordable()) return;
      started = now(); view = { ...view, holding: true }; const epoch = ++revision;
      publish(); timer = schedule(() => tick(epoch));
    },
    stop,
    dispose() { disposed = true; stop(); },
  };
}
