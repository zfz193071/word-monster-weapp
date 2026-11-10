import { soldierSpritePath } from '../../fortress/soldier-sprites';
import { SUMMON_TYPES, isSummonSkill } from '../../fortress/summon-skills';
import { SKILL_QUALITIES } from '../../fortress/skill-quality';
import { validateUpgradeOffer } from '../../fortress/upgrade-choice';
import type { UpgradeCard, UpgradeOffer } from '../../fortress/upgrade-choice';

const SHORT_DESCRIPTIONS: Record<UpgradeCard['icon'], string> = {
  rifleSupport:'步枪兵 · 对地对空', shieldLine:'盾牌兵 · 优先承伤', flameSquad:'喷火兵 · 扇区攻击',
  rocketSupport:'火箭兵 · 同层爆炸', airFormation:'喷气兵 · 空中支援', armorSupport:'坦克 · 地面爆炸',
  doubleShot: '一次发射多枚子弹', fireRate: '射击更快', bulletWidth: '子弹变大',
  flame: '火焰范围伤害', frost: '冰霜减速', lightning: '雷电追加攻击',
  firepower: '周期提升伤害', homing: '子弹自动追踪', repair: '堡垒生命回满',
};

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
        displayCards: cards.map(card => ({...card, ...value?.cards.find(candidate => candidate.id === card.id), shortDescription: SHORT_DESCRIPTIONS[card.icon], summon: isSummonSkill(card.icon), soldierImage: isSummonSkill(card.icon) ? soldierSpritePath(SUMMON_TYPES[card.icon]) : '', chosen: !value?.cards.some(candidate => candidate.id === card.id)})),
      });
    } },
    disabled: { type: Boolean, value: false },
  },
  data: { valid: false, selectedOfferId: '', guideCardId: '', groupId: '', displayCards: [] as (UpgradeCard & {chosen: boolean; shortDescription: string; summon?:boolean})[] },
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
