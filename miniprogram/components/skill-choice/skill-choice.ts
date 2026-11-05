import { validateUpgradeOffer } from '../../fortress/upgrade-choice';
import type { UpgradeOffer } from '../../fortress/upgrade-choice';

Component({
  properties: {
    ownedSkills: { type: Array, value: [] },
    offer: { type: Object, value: null, observer() {
      const value = this.properties.offer as UpgradeOffer | null;
      let valid = false;
      try { if (value) { validateUpgradeOffer(value); valid = true; } } catch { /* Invalid offers cannot be consumed. */ }
      this.setData({ valid });
    } },
    disabled: { type: Boolean, value: false },
  },
  data: { valid: false, selectedOfferId: '' },
  methods: {
    stopScroll() {},
    choose(event: WechatMiniprogram.BaseEvent) {
      const offer = this.properties.offer as UpgradeOffer | null;
      const { offerId, cardId } = event.currentTarget.dataset;
      if (!this.data.valid || this.properties.disabled || !offer || offerId !== offer.id || this.data.selectedOfferId === offer.id
        || !offer.cards.some(card => card.id === cardId)) return;
      this.setData({ selectedOfferId: offer.id });
      this.triggerEvent('selectskill', { offerId: offer.id, cardId });
    },
  },
});
