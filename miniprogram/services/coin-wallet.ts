export const LEVEL_VICTORY_COINS: readonly number[] = Object.freeze([100, 120, 150, 170, 190, 210, 230, 250]);
export function victoryCoinsForLevel(levelId: number): number {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_VICTORY_COINS.length) throw new Error('无效奖励关卡');
  return LEVEL_VICTORY_COINS[levelId - 1];
}
export const COIN_WALLET_KEY = 'word-monster:coin-wallet:v1';
interface Wallet { version: 1; balance: number; rewardedSessions: string[]; completedLevels?: number[] }
interface Storage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export function createCoinWallet(storage: Storage) {
  function read(): Wallet {
    const raw = storage.getStorageSync(COIN_WALLET_KEY);
    if (raw === '' || raw === undefined || raw === null) return { version: 1, balance: 0, rewardedSessions: [] };
    const value = raw as Wallet;
    if (value.version !== 1 || !Number.isSafeInteger(value.balance) || value.balance < 0 || !Array.isArray(value.rewardedSessions)
      || value.rewardedSessions.some(id => typeof id !== 'string' || !id.trim()) || new Set(value.rewardedSessions).size !== value.rewardedSessions.length) throw new Error('金币记录暂时无法读取');
    const completedLevels = value.completedLevels ?? [];
    if (!Array.isArray(completedLevels) || completedLevels.some((id, index) => id !== index + 1) || completedLevels.length > 8) throw new Error('关卡记录暂时无法读取');
    return { version: 1, balance: value.balance, rewardedSessions: [...value.rewardedSessions], completedLevels: [...completedLevels] };
  }
  return {
    balance() { return read().balance; },
    completedLevels() { return read().completedLevels ?? []; },
    canEnter(levelId: number) { return Number.isInteger(levelId) && levelId >= 1 && levelId <= Math.min(8, (read().completedLevels?.length ?? 0) + 1); },
    defaultLevel() { return Math.min(8, (read().completedLevels?.length ?? 0) + 1); },
    rewardVictory(sessionId: string, levelId?: number) {
      if (!sessionId.trim()) throw new Error('奖励缺少对局标识');
      const coins = victoryCoinsForLevel(levelId ?? 1);
      const wallet = read();
      const completed = wallet.completedLevels ?? [];
      if (levelId !== undefined && (!Number.isInteger(levelId) || levelId < 1 || levelId > Math.min(8, completed.length + 1))) throw new Error('关卡尚未解锁');
      if (wallet.rewardedSessions.includes(sessionId)) return { balance: wallet.balance, added: 0 };
      const balance = wallet.balance + coins;
      if (!Number.isSafeInteger(balance)) throw new Error('金币余额超出范围');
      // Balance and receipt are one synchronous storage write, so retries cannot double-credit.
      storage.setStorageSync(COIN_WALLET_KEY, { version: 1, balance, rewardedSessions: [...wallet.rewardedSessions, sessionId], ...(levelId !== undefined || completed.length ? { completedLevels: levelId === completed.length + 1 ? [...completed, levelId] : completed } : {}) });
      return { balance, added: coins };
    },
  };
}
export const coinWallet = createCoinWallet({ getStorageSync: key => wx.getStorageSync(key), setStorageSync: (key, value) => wx.setStorageSync(key, value) });
