export interface UpgradeCard {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: 'doubleShot' | 'fireRate' | 'bulletWidth';
}
export interface UpgradeOffer {
  readonly id: string;
  readonly level: number;
  readonly cards: readonly UpgradeCard[];
}

export function validateUpgradeOffer(offer: UpgradeOffer): void {
  if (!offer.id.trim() || !Number.isSafeInteger(offer.level) || offer.level < 2 || (offer.cards.length < 1 || offer.cards.length > 3)
    || new Set(offer.cards.map(card => card.id)).size !== offer.cards.length
    || offer.cards.some(card => !card.id.trim() || !card.label.trim() || !card.description.trim()
      || !['doubleShot', 'fireRate', 'bulletWidth'].includes(card.icon))) throw new Error('升级必须提供一至三个不同的有效技能候选');
}

// The coordinator supplies eligible cards after an actual level-up. No wave-based reward or implicit skill pool.
export function createUpgradeChoices() {
  const offers = new Map<string, UpgradeOffer>();
  const levels = new Set<number>();
  const selected = new Set<string>();
  let active: UpgradeOffer | null = null;
  let disposed = false;
  return {
    get current() { return active; },
    open(offer: UpgradeOffer): UpgradeOffer | null {
      if (disposed) return null;
      if (active) return active.id === offer.id ? active : null;
      if (offers.has(offer.id) || levels.has(offer.level)) return null;
      validateUpgradeOffer(offer);
      active = Object.freeze({ ...offer, cards: Object.freeze(offer.cards.map(card => Object.freeze({ ...card }))) });
      offers.set(offer.id, active); levels.add(offer.level);
      return active;
    },
    select(offerId: string, cardId: string): UpgradeCard | null {
      if (disposed || !active || active.id !== offerId || selected.has(offerId)) return null;
      const card = active.cards.find(card => card.id === cardId);
      if (!card) return null;
      selected.add(offerId); active = null;
      return card;
    },
    dispose() { disposed = true; active = null; offers.clear(); levels.clear(); selected.clear(); },
  };
}
