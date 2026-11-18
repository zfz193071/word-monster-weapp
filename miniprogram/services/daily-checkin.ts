import { coinWallet } from './coin-wallet';
import { petStore } from './pet-store';
import { SOLDIER_TYPES } from '../fortress/army';
import type { SoldierType } from '../fortress/army';

export const CHECKIN_KEY = 'word-monster:daily-checkin:v1';
export const MAX_SOLDIER_INVENTORY = 100;
export const SEVENTH_DAY_MULTIPLIER = 3;
export const CHECKIN_REWARDS = {
  coins: { label: '金币', amount: 100, symbol: '●' },
  food: { label: '宠物粮', amount: 3, symbol: '◆' },
  soldier: { label: '出战士兵', amount: 1, symbol: '♟' },
  flag: { label: '复活旗帜', amount: 1, symbol: '⚑' },
} as const;
type Kind = keyof typeof CHECKIN_REWARDS;
interface Entry { date: string; kind: Kind; status: 'offered' | 'pending' | 'claimed' }
interface DefeatSoldierReceipt { sessionId: string; type: SoldierType; amount: number; added: number }
interface Save { clearReceipts?: string[]; defeatSoldierReceipts?: DefeatSoldierReceipt[]; soldierTypes?: Partial<Record<SoldierType, number>>; flagRevision?: number; soldierRevision?: number; version: 1; entries: Entry[]; soldiers: number; flags: number }
interface Storage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export function beijingDate(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function createDailyCheckin(options: {
  storage: Storage; now?: () => number; random?: () => number;
  coins: { rewardCheckin(receipt: string): void };
  pets: { rewardCheckin(receipt: string): void };
}) {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const rolls = new Map<string, Kind>();
  function read(): Save {
    const raw = options.storage.getStorageSync(CHECKIN_KEY);
    if (raw === '' || raw === null || raw === undefined) return {version: 1, entries: [], soldiers: 0, soldierTypes: {rifle:0}, defeatSoldierReceipts: [], flags: 0};
    const value = raw as Save;
    if (!value || (value.clearReceipts !== undefined && (!Array.isArray(value.clearReceipts) || value.clearReceipts.some(r => typeof r !== 'string' || !r.startsWith('clear:')) || new Set(value.clearReceipts).size !== value.clearReceipts.length)) || value.version !== 1 || (value.flagRevision !== undefined && (!Number.isSafeInteger(value.flagRevision) || value.flagRevision < 0)) || (value.soldierRevision !== undefined && (!Number.isSafeInteger(value.soldierRevision) || value.soldierRevision < 0)) || !Number.isSafeInteger(value.soldiers) || value.soldiers < 0
      || !Number.isSafeInteger(value.flags) || value.flags < 0 || !Array.isArray(value.entries)
      || value.entries.some((e, i) => !e || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)
        || !Object.prototype.hasOwnProperty.call(CHECKIN_REWARDS, e.kind) || !['offered', 'pending', 'claimed'].includes(e.status)
        || (i > 0 && e.date <= value.entries[i - 1].date))
      || value.entries.filter(e => e.status === 'pending').length > 1) throw new Error('签到记录暂时无法读取，请重试');
    const soldierTypes = value.soldierTypes ?? {rifle: value.soldiers};
    if (!soldierTypes || Object.entries(soldierTypes).some(([type, count]) => !SOLDIER_TYPES.includes(type as SoldierType) || !Number.isSafeInteger(count) || (count as number) < 0)
      || SOLDIER_TYPES.reduce((sum, type) => sum + (soldierTypes[type] ?? 0), 0) !== value.soldiers) throw new Error('士兵兵种库存暂时无法读取');
    const defeatSoldierReceipts = value.defeatSoldierReceipts ?? [];
    if (!Array.isArray(defeatSoldierReceipts) || defeatSoldierReceipts.some(receipt => !receipt || typeof receipt.sessionId !== 'string' || !receipt.sessionId.trim()
      || !SOLDIER_TYPES.includes(receipt.type) || !Number.isSafeInteger(receipt.amount) || receipt.amount < 1 || receipt.amount > 3
      || !Number.isSafeInteger(receipt.added) || receipt.added < 0 || receipt.added > receipt.amount)
      || new Set(defeatSoldierReceipts.map(receipt => receipt.sessionId)).size !== defeatSoldierReceipts.length) throw new Error('战败士兵奖励记录暂时无法读取');
    let remainingSoldiers = Math.min(value.soldiers, MAX_SOLDIER_INVENTORY);
    const boundedSoldierTypes: Partial<Record<SoldierType, number>> = {};
    for (const type of SOLDIER_TYPES) {
      const bounded = Math.min(soldierTypes[type] ?? 0, remainingSoldiers);
      if (bounded) boundedSoldierTypes[type] = bounded;
      remainingSoldiers -= bounded;
    }
    return {...value, soldierTypes: boundedSoldierTypes, defeatSoldierReceipts: defeatSoldierReceipts.map(receipt => ({...receipt})), soldiers: Math.min(value.soldiers, MAX_SOLDIER_INVENTORY), entries: value.entries.map(e => ({...e}))};
  }
  function save(value: Save) { options.storage.setStorageSync(CHECKIN_KEY, value); }
  function settle(value: Save, day: number): Save {
    const pending = value.entries.find(e => e.status === 'pending');
    if (!pending) return value;
    const receipt = `checkin:${pending.date}`;
    const multiplier = day === 7 ? SEVENTH_DAY_MULTIPLIER : 1;
    if (pending.kind === 'coins') options.coins.rewardCheckin(receipt);
    if (pending.kind === 'food') options.pets.rewardCheckin(receipt);
    if (pending.kind === 'soldier' && value.soldiers < MAX_SOLDIER_INVENTORY) {
      const added = Math.min(multiplier, MAX_SOLDIER_INVENTORY - value.soldiers);
      value.soldiers += added;
      value.soldierTypes!.rifle = (value.soldierTypes!.rifle ?? 0) + added;
      value.soldierRevision = (value.soldierRevision ?? 0) + 1;
    }
    if (pending.kind === 'flag') { value.flags += multiplier; value.flagRevision = (value.flagRevision ?? 0) + 1; }
    if (!Number.isSafeInteger(value.flagRevision ?? 0) || !Number.isSafeInteger(value.soldiers) || !Number.isSafeInteger(value.flags) || !Number.isSafeInteger(value.soldierRevision ?? 0)) throw new Error('奖励库存超出范围');
    pending.status = 'claimed'; save(value); return value;
  }
  function prepare(): Save {
    const value = read();
    const today = beijingDate(now());
    if (value.entries.some(e => e.date > today)) throw new Error('请检查设备日期后重试');
    const pending = value.entries.find(e => e.status === 'pending');
    if (pending && pending.date < today) {
      const claimedCount = value.entries.filter(e => e.status === 'claimed' && e.date < today).length;
      const day = claimedCount % 7 + 1;
      settle(value, day);
    }
    if (!value.entries.some(e => e.date === today)) {
      let kind = rolls.get(today);
      if (!kind) {
        const roll = random();
        if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('奖励生成失败，请重试');
        kind = roll < .4 ? 'coins' : roll < .7 ? 'food' : roll < .9 ? 'soldier' : 'flag';
        rolls.set(today, kind);
      }
      value.entries.push({date: today, kind, status: 'offered'}); save(value);
      rolls.clear();
    }
    return value;
  }
  function view(value: Save) {
    const date = beijingDate(now());
    const today = value.entries.find(e => e.date === date)!;
    const claimed = value.entries.filter(e => e.status === 'claimed');
    const countBeforeToday = claimed.length - (today.status === 'claimed' ? 1 : 0);
    const day = countBeforeToday % 7 + 1;
    const cycleClaims = claimed.slice(Math.floor(countBeforeToday / 7) * 7);
    return {
      date, day, claimed: today.status === 'claimed', soldiers: value.soldiers, flags: value.flags,
      cards: Array.from({length: 7}, (_, i) => {
        const entry = i === day - 1 ? today : i < day - 1 ? cycleClaims[i] : undefined;
        const reward = entry ? CHECKIN_REWARDS[entry.kind] : undefined;
        const multiplier = (i + 1) === 7 ? SEVENTH_DAY_MULTIPLIER : 1;
        const amount = reward ? reward.amount * multiplier : 0;
        const label = (i + 1) === 7 ? `${CHECKIN_REWARDS[entry?.kind || 'coins'].label}×3` : (reward?.label ?? '神秘奖励');
        return {day: i + 1, kind: entry?.kind ?? '', label, amount,
          symbol: reward?.symbol ?? '?', date: entry?.date ?? '',
          status: entry?.status === 'claimed' ? 'claimed' : i === day - 1 ? 'available' : 'future'};
      }),
    };
  }
  return {
    rewardClear(receipt: string, soldiers: number, flags: number) {
      if (!receipt.startsWith('clear:') || ![soldiers, flags].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('通关补给无效');
      const value = read(); if (value.clearReceipts?.includes(receipt)) return;
      const addedSoldiers = Math.min(soldiers, MAX_SOLDIER_INVENTORY - value.soldiers);
      value.soldiers += addedSoldiers; value.soldierTypes!.rifle = (value.soldierTypes!.rifle ?? 0) + addedSoldiers; value.flags += flags;
      value.soldierRevision = (value.soldierRevision ?? 0) + (addedSoldiers ? 1 : 0);
      value.flagRevision = (value.flagRevision ?? 0) + (flags ? 1 : 0);
      if (![value.soldiers, value.flags, value.soldierRevision, value.flagRevision].every(Number.isSafeInteger)) throw new Error('补给库存超出范围');
      value.clearReceipts = [...(value.clearReceipts ?? []), receipt]; save(value);
    },
    flagInventory() {
      const value = read(); return {count: value.flags, revision: value.flagRevision ?? 0};
    },
    consumeFlag(expectedRevision: number): boolean {
      const value = read(), revision = value.flagRevision ?? 0;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== revision || value.flags === 0) return false;
      if (!Number.isSafeInteger(revision + 1)) throw new Error('旗帜库存记录超出范围');
      save({...value, flags: value.flags - 1, flagRevision: revision + 1}); return true;
    },
    soldierInventory() {
      const value = read();
      return {count: value.soldiers, revision: value.soldierRevision ?? 0};
    },
    soldierTypeForRevision(expectedRevision: number): SoldierType | null {
      const value = read();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== (value.soldierRevision ?? 0) || value.soldiers === 0) return null;
      return SOLDIER_TYPES.find(type => (value.soldierTypes![type] ?? 0) > 0) ?? null;
    },
    consumeSoldier(expectedRevision: number, type?: SoldierType): boolean {
      const value = read(); const revision = value.soldierRevision ?? 0;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== revision || value.soldiers === 0) return false;
      const selected = type ?? SOLDIER_TYPES.find(kind => (value.soldierTypes![kind] ?? 0) > 0);
      if (!selected || !SOLDIER_TYPES.includes(selected) || !(value.soldierTypes![selected]! > 0)) return false;
      if (!Number.isSafeInteger(revision + 1)) throw new Error('士兵库存记录超出范围');
      save({...value, soldiers: value.soldiers - 1, soldierTypes: {...value.soldierTypes, [selected]: value.soldierTypes![selected]! - 1}, soldierRevision: revision + 1});
      return true;
    },
    rewardDefeatSoldiers(sessionId: string, type: SoldierType, amount: number) {
      if (!sessionId.trim() || !SOLDIER_TYPES.includes(type) || !Number.isSafeInteger(amount) || amount < 1 || amount > 3) throw new Error('战败士兵奖励无效');
      const value = read(), previous = value.defeatSoldierReceipts!.find(receipt => receipt.sessionId === sessionId);
      if (previous) {
        if (previous.type !== type || previous.amount !== amount) throw new Error('战败士兵奖励与已保存结果不一致');
        return {added: previous.added};
      }
      const added = Math.min(amount, MAX_SOLDIER_INVENTORY - value.soldiers);
      value.soldiers += added; value.soldierTypes![type] = (value.soldierTypes![type] ?? 0) + added;
      if (added && !Number.isSafeInteger((value.soldierRevision ?? 0) + 1)) throw new Error('士兵库存记录超出范围');
      value.soldierRevision = (value.soldierRevision ?? 0) + (added ? 1 : 0);
      value.defeatSoldierReceipts!.push({sessionId, type, amount, added});
      save(value);
      return {added};
    },
    open() { return view(prepare()); },
    claim(expectedDate: string) {
      const value = prepare();
      const today = beijingDate(now());
      if (expectedDate !== today) return {claimed: false, view: view(value)};
      const entry = value.entries.find(e => e.date === today)!;
      if (entry.status === 'claimed') return {claimed: false, view: view(value)};
      const claimedCount = value.entries.filter(e => e.status === 'claimed').length;
      const day = claimedCount + 1;
      entry.status = 'pending'; save(value);
      return {claimed: true, view: view(settle(value, day))};
    },
  };
}
export type CheckinView = ReturnType<ReturnType<typeof createDailyCheckin>['open']>;
export const dailyCheckin = createDailyCheckin({
  storage: {getStorageSync: key => wx.getStorageSync(key), setStorageSync: (key, value) => wx.setStorageSync(key, value)},
  coins: coinWallet, pets: petStore,
});
