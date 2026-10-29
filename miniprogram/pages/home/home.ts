Page({
  data: { opening: false },

  onShow() {
    this.setData({ opening: false });
  },

  openBattle() {
    if (this.data.opening) return;
    this.setData({ opening: true });
    wx.navigateTo({
      url: '/pages/battle/battle',
      fail: () => {
        this.setData({ opening: false });
        wx.showToast({ title: '暂时没能出发，请再试一次', icon: 'none' });
      },
    });
  },
});
