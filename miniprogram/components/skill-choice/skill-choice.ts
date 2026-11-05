import { SKILL_QUALITIES } from '../../fortress/skill-quality';
import { validateUpgradeOffer } from '../../fortress/upgrade-choice';
import type { UpgradeCard, UpgradeOffer } from '../../fortress/upgrade-choice';

Component({
  properties: {
    quizIncorrect: { type: Boolean, value: false },
    remaining: { type: Number, value: 0 },
    showGuide: { type: Boolean, value: false },
    offer: { type: Object, value: null, observer() {
      const value = this.properties.offer as UpgradeOffer | null;
      let valid = false;
      try { if (value) { validateUpgradeOffer(value); valid = true; } } catch { /* Invalid offers cannot be consumed. */ }
      const sameGroup = value && (value.id === this.data.groupId || value.id === `${this.data.groupId}:second`);
      const cards = sameGroup ? this.data.displayCards : value?.cards ?? [];
      const rank = (card: UpgradeCard) => SKILL_QUALITIES.findIndex(quality => quality.id === card.resultingQuality);
      const guideCard = valid ? value?.cards.reduce<UpgradeCard | undefined>((best, card) => !best || rank(card) > rank(best) ? card : best, undefined) : undefined;
      this.setData({ valid, guideCardId: guideCard?.id ?? '', groupId: sameGroup ? this.data.groupId : value?.id ?? '',
        displayCards: cards.map(card => ({...card, chosen: !value?.cards.some(candidate => candidate.id === card.id)})),
      });
    } },
    disabled: { type: Boolean, value: false },
  },
  data: { valid: false, selectedOfferId: '', guideCardId: '', groupId: '', displayCards: [] as (UpgradeCard & {chosen: boolean})[] },
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
