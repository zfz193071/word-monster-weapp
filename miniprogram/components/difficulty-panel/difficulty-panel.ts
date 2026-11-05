Component({
  properties: { selected: { type: String, value: '' }, error: { type: String, value: '' } },
  data: { choices: [
    { id: 'easy', label: '简单' }, { id: 'normal', label: '普通' },
    { id: 'hard', label: '困难' }, { id: 'nightmare', label: '噩梦' },
  ] },
  methods: {
    choose(event: WechatMiniprogram.BaseEvent) {
      const id = String(event.currentTarget.dataset.id);
      if (this.data.choices.some(choice => choice.id === id)) this.triggerEvent('select', { id });
    },
    close() { this.triggerEvent('close'); },
  },
});
