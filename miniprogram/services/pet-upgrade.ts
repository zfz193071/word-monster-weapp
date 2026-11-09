import { PET_MAX_LEVEL } from '../pets/catalog';
import { createCoinWallet } from './coin-wallet';
import { createPetStore } from './pet-store';
import { playerStorage } from './player-storage';
import type { createPlayerStorage } from './player-storage';
export function createPetUpgrade(storage: ReturnType<typeof createPlayerStorage>) {
  const coins = createCoinWallet(storage), pets = createPetStore(storage);
  return {
    upgrade(revision: number) {
      return storage.transaction(() => {
        const pet = pets.view();
        if (pet.revision !== revision || !pet.owned || pet.level === PET_MAX_LEVEL) return false;
        if (!coins.spendPetUpgrade(pet.level * 100)) return false;
        if (!pets.upgradeLevel(revision)) throw new Error('宠物状态已变化，请重试');
        return true;
      });
    },
  };
}
export const petUpgrade = createPetUpgrade(playerStorage);
