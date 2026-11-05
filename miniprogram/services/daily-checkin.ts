import { coinWallet } from './coin-wallet';
import { petStore } from './pet-store';

export const CHECKIN_KEY = 'word-monster:daily-checkin:v1';
export const CHECKIN_REWARDS = {
  coins: { label: '金币', amount: 100, symbol: '●' },
  food: { label: '宠物粮', amount: 3, symbol: '◆' },
  soldier: { label: '出战士兵', amount: 1, symbol: '♟' },
  flag: { label: '复活旗帜', amount: 1, symbol: '⚑' },
} as const;
type Kind = keyof typeof CHECKIN_REWARDS;
interface Entry { date: string; kind: Kind; status: 'offered' | 'pending' | 'claimed' }
interface Save { version: 1; entries: Entry[]; soldiers: number; flags: number }
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
  // Keep an unsaved roll stable across retries within this process.
  const rolls = new Map<string, Kind>();
  function read(): Save {
    const raw = options.storage.getStorageSync(CHECKIN_KEY);
    if (raw === '' || raw === null || raw === undefined) return {version: 1, entries: [], soldiers: 0, flags: 0};
    const value = raw as Save;
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.soldiers) || value.soldiers < 0
      || !Number.isSafeInteger(value.flags) || value.flags < 0 || !Array.isArray(value.entries)
      || value.entries.some((e, i) => !e || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)
        || !Object.prototype.hasOwnProperty.call(CHECKIN_REWARDS, e.kind) || !['offered', 'pending', 'claimed'].includes(e.status)
        || (i > 0 && e.date <= value.entries[i - 1].date))
      || value.entries.filter(e => e.status === 'pending').length > 1) throw new Error('签到记录暂时无法读取，请重试');
    return {...value, entries: value.entries.map(e => ({...e}))};
  }
  function save(value: Save) { options.storage.setStorageSync(CHECKIN_KEY, value); }
  function settle(value: Save): Save {
    const pending = value.entries.find(e => e.status === 'pending');
    if (!pending) return value;
    const receipt = `checkin:${pending.date}`;
    // External stores persist reward + receipt atomically. A crash between writes
    // can resume this journal without double-crediting coins or pet food.
    if (pending.kind === 'coins') options.coins.rewardCheckin(receipt);
    if (pending.kind === 'food') options.pets.rewardCheckin(receipt);
    if (pending.kind === 'soldier') value.soldiers++;
    if (pending.kind === 'flag') value.flags++;
    if (!Number.isSafeInteger(value.soldiers) || !Number.isSafeInteger(value.flags)) throw new Error('奖励库存超出范围');
    pending.status = 'claimed'; save(value); return value;
  }
  function prepare(): Save {
    const value = settle(read());
    const today = beijingDate(now());
    if (value.entries.some(e => e.date > today)) throw new Error('请检查设备日期后重试');
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
        return {day: i + 1, kind: entry?.kind ?? '', label: reward?.label ?? '神秘奖励', amount: reward?.amount ?? 0,
          symbol: reward?.symbol ?? '?', date: entry?.date ?? '',
          status: entry?.status === 'claimed' ? 'claimed' : i === day - 1 ? 'available' : 'future'};
      }),
    };
  }
  return {
    open() { return view(prepare()); },
    claim(expectedDate: string) {
      const value = prepare();
      const today = beijingDate(now());
      // Reject a card left open across midnight; refresh it before accepting a tap.
      if (expectedDate !== today) return {claimed: false, view: view(value)};
      const entry = value.entries.find(e => e.date === today)!;
      if (entry.status === 'claimed') return {claimed: false, view: view(value)};
      entry.status = 'pending'; save(value);
      return {claimed: true, view: view(settle(value))};
    },
  };
}
export type CheckinView = ReturnType<ReturnType<typeof createDailyCheckin>['open']>;
export const dailyCheckin = createDailyCheckin({
  storage: {getStorageSync: key => wx.getStorageSync(key), setStorageSync: (key, value) => wx.setStorageSync(key, value)},
  coins: coinWallet, pets: petStore,
});
