# 首关素材交付清单（工单 #4）

2026-10-30 已联网下载 5 张图片与 5 段英文发音并放入小程序包内，共 111,051 字节（约 108.4 KiB），运行时无需联网获取。图片逐张查看通过；音频源词条、作者、许可已核对，MP3 完整解码通过。当前会话无法直接听审，音频保持 pending，不能将机器解码当作真人逐条试听。

| 词条 | 图片（OpenMoji 17.0.0） | 发音原始文件 | 作者 / 许可 | 审校 |
| --- | --- | --- | --- | --- |
| apple 苹果 | 1F34E.png | En-us-apple.ogg | Dvortygirl / CC BY-SA 3.0 | 图片通过；发音待听审 |
| banana 香蕉 | 1F34C.png | En-us-banana.ogg | Dvortygirl / CC BY-SA 3.0 | 图片通过；发音待听审 |
| orange 橙子 | 1F34A.png | En-uk-orange.ogg | Association Shtooka, Judith Franck / CC BY 3.0 US | 图片通过；发音待听审 |
| grape 葡萄 | 1F347.png | En-us-grape.ogg | Dvortygirl / CC BY-SA 3.0 | 图片通过；发音待听审 |
| watermelon 西瓜 | 1F349.png | En-us-watermelon.ogg | Dvortygirl / CC BY-SA 3.0 | 图片通过；发音待听审 |

## 图片来源与使用说明

All emojis designed by OpenMoji – the open-source emoji and icon project. License: CC BY-SA 4.0.

来源：[OpenMoji 官方项目](https://github.com/hfg-gmuend/openmoji/tree/17.0.0/color/618x618)，[官方许可说明](https://github.com/hfg-gmuend/openmoji/blob/17.0.0/FAQ.md)，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。直接使用 618×618 PNG，不修改原图；仅重命名为 assets/images/<word>.png。1F34A 上游名称是 tangerine，本项目使用其无文字橙色柑橘图作为入门 orange 的示意图，儿童辨识效果仍需试玩核对。

已逐张检查：红苹果、黄香蕉、橙色柑橘、紫葡萄串、西瓜切片清晰区分，均无中英文答案文字。图片及其衍生物遵循原许可，不将第三方素材改标为本项目原创。

## 发音来源与转换

原始页面及录音作者：

- [apple — Dvortygirl](https://commons.wikimedia.org/wiki/File:En-us-apple.ogg)
- [banana — Dvortygirl](https://commons.wikimedia.org/wiki/File:En-us-banana.ogg)
- [orange — Association Shtooka, Judith Franck](https://commons.wikimedia.org/wiki/File:En-uk-orange.ogg)
- [grape — Dvortygirl](https://commons.wikimedia.org/wiki/File:En-us-grape.ogg)
- [watermelon — Dvortygirl](https://commons.wikimedia.org/wiki/File:En-us-watermelon.ogg)

四段美式录音选择其 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 许可；orange 为英式女声，采用 [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/)。本包目前混合英/美口音，不标为统一美式音源。

从 Wikimedia 原始 OGG 下载，经 FFmpeg 转换为单声道、44.1 kHz、96 kbps MP3，不裁切、不改语速或音高。派生 MP3 保持各自原许可。文件保存于 assets/audio/<word>.mp3；来源 URL、原始文件 SHA-256、包内文件 SHA-256、字节数和 ffprobe 结果见 [asset-manifest.json](asset-manifest.json)。

署名与许可入口已放入首页“素材署名”，可展开查看每个文件的作者、改动说明、许可和来源网址，不在答题页泄露单词。

## 验证与剩余工作

5 段 MP3 已用 ffmpeg 完整解码、ffprobe 核对格式、时长和非空文件。reviewStatus 只有实际完成对应审校才设为 approved；音频仍须真人逐条听审（词音匹配、清晰度、音量和截断），并进行真机播放验收。

微信模拟器实测按顺序进入 apple、banana、orange、grape、watermelon：每题均达到 awaitingAnswer、canChoose=true、imageFailed=false，证明五张图片均加载成功、五段题目音频均触发自然结束事件；已实际点击前四题并推进下一题。苹果题截图核对图片显示及内部返回按钮移除。此验证不替代听觉质量审校。

调试时曾出现模拟器运行旧代码（首页 credits 缺失）。官方 CLI reset-fileutils 重建本项目文件索引，再 simulator_refresh 后，credits=10 且新资源正常加载；仅刷新模拟器而不重建索引曾未生效。没有清除登录或业务存储。

npm run check:content 检查配置；npm run check:assets 目前应仅报告 5 项音频“尚未审校”，不再报告文件缺失或来源权限缺失。

主角、怪物、武器三个视觉阶段及音效仍待 #4/#11 完成；当前 CSS 角色是本项目代码图形。#4 继续保持进行中，不将词汇文件下载完成当作全部角色素材或儿童适龄验收完成。
