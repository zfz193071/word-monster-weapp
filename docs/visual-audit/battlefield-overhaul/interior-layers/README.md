# 五级堡垒内部平台与前墙

运行审查入口：[手机/平板20张固定夹具](runtime/review.html)。这是正式Canvas离屏绘制，不是微信设备或最终视觉验收。

一级木制、二级加固木梁、三级石砌、四级双塔城堡、五级金属护板分别匹配已确认房屋等级。源图通过内置image_gen制作；提示词见各material-part-prompt.txt，来源/尺寸/SHA256见各manifest.json。原始alpha保留，全图等比重采样至1086×362，未基于旧程序图制作。四级修订前候选保留在candidates，不接入运行。

用户暂停制作新的摧毁图：三级至五级只打包interior/front，一二级已有ruin保留，其他失败显示沿用旧destroyedBase。没有制作新的摧毁素材。

生成图仍有低alpha边缘残留，不宣称完全达到透明留白规范。已检查实际尺寸完整构图；主角整身倾斜与旧Boss风格差异仍待整改。

重建运行编码：`WM_CANVAS_MODULE=<@napi-rs/canvas路径> node --import tsx scripts/prepare-interior-art.mts <wood|reinforced|stone|castle|armored>`。
重建固定场景：同一环境变量运行 `node --import tsx scripts/render-interior-scenes.mts`。只用现有运行素材，包含失败状态回归，不生成新的美术图片。
