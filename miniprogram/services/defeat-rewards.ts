import { SOLDIER_TYPES } from '../fortress/army';
import type { SoldierType } from '../fortress/army';
import { stableBattleRandom } from '../fortress/battle-progression';
import { soldierSpritePath } from '../fortress/soldier-sprites';
import type { RewardCard } from './victory-rewards';

export const DEFEAT_REWARD_MINIMUM_MS = 3 * 60 * 1000;
export const DEFEAT_REWARD_COINS = 10;

export function defeatSoldierReward(sessionId: string): {type: SoldierType; amount: number} {
  if (!sessionId.trim()) throw new Error('战败奖励缺少对局标识');
  const type = SOLDIER_TYPES[Math.floor(stableBattleRandom(`defeat:${sessionId}:soldier-type`) * SOLDIER_TYPES.length)];
  const amount = 1 + Math.floor(stableBattleRandom(`defeat:${sessionId}:soldier-amount`) * 3);
  return {type, amount};
}

const SOLDIER_LABELS: Readonly<Record<SoldierType, string>> = Object.freeze({
  rifle: '步枪兵', shield: '盾兵', flamethrower: '喷火兵', rocket: '火箭兵', jetpack: '喷气兵', tank: '坦克兵',
});

export function defeatRewardCards(type: SoldierType, added: number, totalCoins: number): RewardCard[] {
  const cards: RewardCard[] = [{id: 'coins', name: '金币', amount: totalCoins, symbol: '●', icon: '/assets/images/checkin/coins.png'}];
  if (added > 0) cards.push({id: 'defeat-soldiers', name: SOLDIER_LABELS[type], amount: added, symbol: '♟', icon: soldierSpritePath(type)});
  return cards;
}
