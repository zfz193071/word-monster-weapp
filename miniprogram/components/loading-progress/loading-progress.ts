Component({
  properties: { progress: { type: Number, value: 0 } },
  data: { percent: 0 },
  observers: {
    progress(value: number) {
      const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
      this.setData({ percent });
    },
  },
});
