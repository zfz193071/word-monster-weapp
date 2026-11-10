import { coinWallet, victoryCoinsForLevel } from './coin-wallet';
import { petStore } from './pet-store';
import { dailyCheckin } from './daily-checkin';
import { stableBattleRandom } from '../fortress/battle-progression';

export const VICTORY_REWARDS_KEY = 'word-monster:victory-rewards:v1';
export const PET_SKILL_UPGRADE_COSTS = [10, 20, 35, 55] as const;
export interface RewardCard { id: string; name: string; amount: number; symbol: string; icon: string; surprise?: boolean }
export function clearRewards(sessionId: string, levelId: number) {
  const coins = victoryCoinsForLevel(levelId);
  const tier = Math.floor((levelId - 1) / 2);
  const roll = stableBattleRandom(`clear:${sessionId}:${levelId}:surprise`);
  const bonus = roll < .4 ? {id:'food', name:'宠物粮', amount:2, symbol:'◆', icon:'/assets/images/checkin/food.png'}
    : roll < .7 ? {id:'stones', name:'技能星石', amount:2, symbol:'✦', icon:'/assets/images/pets/stone.png'}
    : roll < .85 ? {id:'soldier', name:'援军士兵', amount:1, symbol:'♟', icon:'/assets/images/checkin/soldier.png'}
    : roll < .95 ? {id:'flag', name:'复活旗帜', amount:1, symbol:'⚑', icon:'/assets/images/checkin/flag.png'}
    : {id:'egg', name:'宠物蛋', amount:1, symbol:'◉', icon:'/assets/images/pets/egg.png'};
  const cards: RewardCard[] = [
    {id:'coins', name:'金币', amount:coins, symbol:'●', icon:'/assets/images/checkin/coins.png'},
    {id:'food', name:'宠物粮', amount:3+tier, symbol:'◆', icon:'/assets/images/checkin/food.png'},
    {id:'stones', name:'技能星石', amount:2+tier, symbol:'✦', icon:'/assets/images/pets/stone.png'},
    {...bonus, id:'surprise', surprise:true},
  ];
  return {cards, food:3+tier+(bonus.id==='food'?2:0), stones:2+tier+(bonus.id==='stones'?2:0),
    eggs:bonus.id==='egg'?1:0, soldiers:bonus.id==='soldier'?1:0, flags:bonus.id==='flag'?1:0};
}
interface Entry { sessionId: string; levelId: number; settled: boolean }
interface Storage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export function createVictoryRewards(options: {storage: Storage; coins: Pick<typeof coinWallet, 'rewardVictory'|'balance'|'canEnter'>; pets: Pick<typeof petStore, 'rewardClear'>; supplies: Pick<typeof dailyCheckin, 'rewardClear'>}) {
  function read(): Entry[] {
    const raw = options.storage.getStorageSync(VICTORY_REWARDS_KEY);
    if (raw === '' || raw === null || raw === undefined) return [];
    if (!Array.isArray(raw) || raw.some(e => !e || typeof e.sessionId !== 'string' || !e.sessionId.trim() || !Number.isInteger(e.levelId) || e.levelId < 1 || e.levelId > 8 || typeof e.settled !== 'boolean') || new Set(raw.map(e => e.sessionId)).size !== raw.length) throw new Error('通关奖励记录暂时无法读取');
    return raw.map(e => ({...e}));
  }
  function settle(entries: Entry[], entry: Entry) {
    const reward = clearRewards(entry.sessionId, entry.levelId);
    if (!entry.settled) {
      options.coins.rewardVictory(entry.sessionId, entry.levelId);
      const receipt = `clear:${entry.sessionId}`;
      options.pets.rewardClear(receipt, reward.food, reward.stones, reward.eggs);
      options.supplies.rewardClear(receipt, reward.soldiers, reward.flags);
      entry.settled = true;
      options.storage.setStorageSync(VICTORY_REWARDS_KEY, entries);
    }
    return {cards:reward.cards, balance:options.coins.balance()};
  }
  return {
    recover() { const entries = read(); for (const entry of entries) if (!entry.settled) settle(entries, entry); },
    claim(sessionId: string, levelId: number) {
      if (!sessionId.trim()) throw new Error('通关缺少对局标识');
      victoryCoinsForLevel(levelId);
      if (!options.coins.canEnter(levelId)) throw new Error('关卡尚未解锁');
      const entries = read(); let entry = entries.find(e => e.sessionId === sessionId);
      if (entry && entry.levelId !== levelId) throw new Error('通关奖励关卡不匹配');
      if (!entry) {
        entry = {sessionId, levelId, settled:false}; entries.push(entry);
        options.storage.setStorageSync(VICTORY_REWARDS_KEY, entries);
      }
      return settle(entries, entry);
    },
  };
}
export const victoryRewards = createVictoryRewards({storage:{getStorageSync:key=>wx.getStorageSync(key),setStorageSync:(key,value)=>wx.setStorageSync(key,value)}, coins:coinWallet, pets:petStore, supplies:dailyCheckin});
