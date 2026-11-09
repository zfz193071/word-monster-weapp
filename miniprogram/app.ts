import { previewSave } from './preview/save-seed';
import { importPreviewSave } from './preview/save-transfer';

App({
  onLaunch() {
    if (!previewSave) return;
    try {
      importPreviewSave(wx, previewSave, wx.getSystemInfoSync().platform, wx.getAccountInfoSync().miniProgram.envVersion);
    } catch (error) {
      console.error('预览存档导入失败', error);
      wx.showModal({ title: '存档导入失败', content: '请关闭小程序后重新扫码重试。', showCancel: false });
    }
  },
});
