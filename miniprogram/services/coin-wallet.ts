export const VICTORY_COINS = 100;
export const COIN_WALLET_KEY = 'word-monster:coin-wallet:v1';
interface Wallet { version: 1; balance: number; rewardedSessions: string[] }
interface Storage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export function createCoinWallet(storage: Storage) {
  function read(): Wallet {
    const raw = storage.getStorageSync(COIN_WALLET_KEY);
    if (raw === '' || raw === undefined || raw === null) return { version: 1, balance: 0, rewardedSessions: [] };
    const value = raw as Wallet;
    if (value.version !== 1 || !Number.isSafeInteger(value.balance) || value.balance < 0 || !Array.isArray(value.rewardedSessions)
      || value.rewardedSessions.some(id => typeof id !== 'string' || !id.trim()) || new Set(value.rewardedSessions).size !== value.rewardedSessions.length) throw new Error('金币记录暂时无法读取');
    return { version: 1, balance: value.balance, rewardedSessions: [...value.rewardedSessions] };
  }
  return {
    balance() { return read().balance; },
    rewardVictory(sessionId: string) {
      if (!sessionId.trim()) throw new Error('奖励缺少对局标识');
      const wallet = read();
      if (wallet.rewardedSessions.includes(sessionId)) return { balance: wallet.balance, added: 0 };
      const balance = wallet.balance + VICTORY_COINS;
      if (!Number.isSafeInteger(balance)) throw new Error('金币余额超出范围');
      // Balance and receipt are one synchronous storage write, so retries cannot double-credit.
      storage.setStorageSync(COIN_WALLET_KEY, { version: 1, balance, rewardedSessions: [...wallet.rewardedSessions, sessionId] });
      return { balance, added: VICTORY_COINS };
    },
  };
}
export const coinWallet = createCoinWallet({ getStorageSync: key => wx.getStorageSync(key), setStorageSync: (key, value) => wx.setStorageSync(key, value) });
