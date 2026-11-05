import { weaponForLevel } from '../weapons/catalog';
import { coinRulesFor } from '../fortress/difficulty';
import type { DifficultyId } from '../fortress/difficulty';
export const LEVEL_VICTORY_COINS: readonly number[] = Object.freeze([100, 120, 150, 170, 190, 210, 230, 250]);
export function victoryCoinsForLevel(levelId: number): number {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_VICTORY_COINS.length) throw new Error('无效奖励关卡');
  return LEVEL_VICTORY_COINS[levelId - 1];
}
export function grandBossCoins(difficulty: DifficultyId = 'normal'): number {
  coinRulesFor(difficulty); return {easy:10,normal:20,hard:40,nightmare:60}[difficulty];
}
export const COIN_WALLET_KEY = 'word-monster:coin-wallet:v1';
interface DropReceipt { monsterId: string; amount: number }
interface DropSession { difficulty?: DifficultyId; sessionId: string; levelId: number; receipts: DropReceipt[] }
interface BossReceipt { sessionId: string; levelId: number; difficulty: DifficultyId; amount: number }
interface Wallet { checkinReceipts?: string[]; bossDrops?: BossReceipt[]; version: 1; balance: number; rewardedSessions: string[]; completedLevels?: number[]; weaponLevel?: number; drops?: DropSession[] }
interface Storage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export function createCoinWallet(storage: Storage) {
  function read(): Wallet {
    const raw = storage.getStorageSync(COIN_WALLET_KEY);
    if (raw === '' || raw === undefined || raw === null) return { version: 1, balance: 0, rewardedSessions: [] };
    const value = raw as Wallet;
    if (value.version !== 1 || !Number.isSafeInteger(value.balance) || value.balance < 0 || !Array.isArray(value.rewardedSessions)
      || value.rewardedSessions.some(id => typeof id !== 'string' || !id.trim()) || new Set(value.rewardedSessions).size !== value.rewardedSessions.length) throw new Error('金币记录暂时无法读取');
    const checkinReceipts = value.checkinReceipts ?? [];
    if (!Array.isArray(checkinReceipts) || checkinReceipts.some(id => typeof id !== 'string' || !/^checkin:\d{4}-\d{2}-\d{2}$/.test(id)) || new Set(checkinReceipts).size !== checkinReceipts.length) throw new Error('签到金币记录暂时无法读取');
    const completedLevels = value.completedLevels ?? [];
    if (!Array.isArray(completedLevels) || completedLevels.some((id, index) => id !== index + 1) || completedLevels.length > 8) throw new Error('关卡记录暂时无法读取');
    const weaponLevel = value.weaponLevel === undefined ? 1 : value.weaponLevel;
    weaponForLevel(weaponLevel);
    const bossDrops = value.bossDrops;
    if (bossDrops !== undefined && (!Array.isArray(bossDrops) || bossDrops.some(entry => !entry || typeof entry.sessionId !== 'string' || !entry.sessionId.trim()
      || !Number.isInteger(entry.levelId) || entry.levelId < 1 || entry.levelId > 8 || !['easy','normal','hard','nightmare'].includes(entry.difficulty) || entry.amount !== grandBossCoins(entry.difficulty))
      || new Set(bossDrops.map(entry => `${entry.sessionId}:${entry.levelId}`)).size !== bossDrops.length)) throw new Error('大Boss奖励记录暂时无法读取');
    const drops = value.drops;
    if (drops !== undefined && (!Array.isArray(drops) || drops.some(entry => !entry || typeof entry.sessionId !== 'string' || !entry.sessionId.trim()
      || !Number.isInteger(entry.levelId) || entry.levelId < 1 || entry.levelId > 8 || !Array.isArray(entry.receipts)
      || entry.receipts.some(receipt => !receipt || typeof receipt.monsterId !== 'string' || !receipt.monsterId.startsWith(`${entry.sessionId}:wave:`)
        || !Number.isInteger(receipt.amount) || receipt.amount < 1 || receipt.amount > coinRulesFor(entry.difficulty).bossMax)
      || new Set(entry.receipts.map(receipt => receipt.monsterId)).size !== entry.receipts.length
      || entry.receipts.reduce((sum, receipt) => sum + receipt.amount, 0) > coinRulesFor(entry.difficulty).limit)
      || new Set(drops.map(entry => entry.sessionId)).size !== drops.length)) throw new Error('掉落金币记录暂时无法读取');
    return { version: 1, checkinReceipts: [...checkinReceipts], weaponLevel, balance: value.balance, rewardedSessions: [...value.rewardedSessions], completedLevels: [...completedLevels],
      ...(bossDrops ? { bossDrops: bossDrops.map(entry => ({...entry})) } : {}),
      ...(drops ? { drops: drops.map(entry => ({ ...entry, receipts: entry.receipts.map(receipt => ({ ...receipt })) })) } : {}) };
  }
  return {
    rewardCheckin(receipt: string) {
      if (!/^checkin:\d{4}-\d{2}-\d{2}$/.test(receipt)) throw new Error('签到标识无效');
      const wallet = read();
      if (wallet.checkinReceipts?.includes(receipt)) return;
      const balance = wallet.balance + 100;
      if (!Number.isSafeInteger(balance)) throw new Error('金币余额超出范围');
      storage.setStorageSync(COIN_WALLET_KEY, {...wallet, balance, checkinReceipts: [...(wallet.checkinReceipts ?? []), receipt]});
    },
    balance() { return read().balance; },
    equipment() { const wallet = read(); return { balance: wallet.balance, level: wallet.weaponLevel ?? 1 }; },
    upgradeWeapon(expectedLevel: number) {
      weaponForLevel(expectedLevel);
      const wallet = read();
      const level = wallet.weaponLevel ?? 1;
      const current = weaponForLevel(level);
      // Compare-and-upgrade makes duplicate / stale requests harmless.
      if (expectedLevel !== level || current.nextCost === null || wallet.balance < current.nextCost) {
        return { balance: wallet.balance, level, upgraded: false };
      }
      const balance = wallet.balance - current.nextCost;
      storage.setStorageSync(COIN_WALLET_KEY, { ...wallet, balance, weaponLevel: level + 1 });
      return { balance, level: level + 1, upgraded: true };
    },
    completedLevels() { return read().completedLevels ?? []; },
    canEnter(levelId: number) { return Number.isInteger(levelId) && levelId >= 1 && levelId <= Math.min(8, (read().completedLevels?.length ?? 0) + 1); },
    defaultLevel() { return Math.min(8, (read().completedLevels?.length ?? 0) + 1); },
    rewardDrop(sessionId: string, levelId: number, monsterId: string, amount: number, difficulty: DifficultyId = 'normal') {
      const coins = coinRulesFor(difficulty);
      if (!sessionId.trim() || !monsterId.startsWith(`${sessionId}:wave:`)
        || !Number.isInteger(amount) || (amount !== coins.normal && (amount < coins.bossMin || amount > coins.bossMax))) throw new Error('掉落奖励无效');
      const wallet = read();
      if (!Number.isInteger(levelId) || levelId < 1 || levelId > Math.min(8, (wallet.completedLevels?.length ?? 0) + 1)) throw new Error('关卡尚未解锁');
      const drops = wallet.drops ?? [];
      const previous = drops.find(entry => entry.sessionId === sessionId);
      if (previous && (previous.levelId !== levelId || (previous.difficulty ?? 'normal') !== difficulty)) throw new Error('掉落关卡或难度不匹配');
      const receipts = previous?.receipts ?? [];
      const total = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
      if (receipts.some(receipt => receipt.monsterId === monsterId) || total >= coins.limit) return { balance: wallet.balance, added: 0, total };
      const added = Math.min(amount, coins.limit - total);
      const balance = wallet.balance + added;
      if (!Number.isSafeInteger(balance)) throw new Error('金币余额超出范围');
      const entry = { sessionId, levelId, difficulty, receipts: [...receipts, { monsterId, amount: added }] };
      storage.setStorageSync(COIN_WALLET_KEY, { ...wallet, balance, drops: [...drops.filter(item => item.sessionId !== sessionId), entry] });
      return { balance, added, total: total + added };
    },
    rewardGrandBoss(sessionId: string, levelId: number, difficulty: DifficultyId = 'normal') {
      const amount = grandBossCoins(difficulty); const wallet = read();
      if (!sessionId.trim() || !Number.isInteger(levelId) || levelId < 1 || levelId > Math.min(8, (wallet.completedLevels?.length ?? 0) + 1)) throw new Error('大Boss奖励关卡无效');
      const receipts = wallet.bossDrops ?? [];
      const previous = receipts.find(entry => entry.sessionId === sessionId && entry.levelId === levelId);
      if (previous && previous.difficulty !== difficulty) throw new Error('大Boss奖励难度不匹配');
      if (previous) return { balance: wallet.balance, added: 0, total: previous.amount };
      const balance = wallet.balance + amount;
      if (!Number.isSafeInteger(balance)) throw new Error('金币余额超出范围');
      storage.setStorageSync(COIN_WALLET_KEY, {...wallet, balance, bossDrops: [...receipts, {sessionId, levelId, difficulty, amount}]});
      return {balance, added: amount, total: amount};
    },
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
      storage.setStorageSync(COIN_WALLET_KEY, { ...wallet, version: 1, ...(wallet.bossDrops ? {bossDrops: wallet.bossDrops} : {}), ...(wallet.drops ? { drops: wallet.drops } : {}), ...(wallet.weaponLevel !== undefined ? { weaponLevel: wallet.weaponLevel } : {}), balance, rewardedSessions: [...wallet.rewardedSessions, sessionId], ...(levelId !== undefined || completed.length ? { completedLevels: levelId === completed.length + 1 ? [...completed, levelId] : completed } : {}) });
      return { balance, added: coins };
    },
  };
}
export const coinWallet = createCoinWallet({ getStorageSync: key => wx.getStorageSync(key), setStorageSync: (key, value) => wx.setStorageSync(key, value) });
