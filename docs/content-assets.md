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

## 战斗音频追加（2026-11-01）

`battle-loop.mp3`（17.78秒循环）与 `battle-hit.mp3`（0.14秒）由本项目合成，无外部采样；可用 `scripts/create-battle-audio.py` 重建。

`zombie-apple.mp3`、`zombie-banana.mp3`、`zombie-orange.mp3`、`zombie-grape.mp3`、`zombie-watermelon.mp3` 是上述原始水果录音的变声衍生物，非游戏音频采样。处理包括降低音高、轻微减速、喉音颤动、软饱和、短混响与响度调整；原始教学录音未修改。由 `scripts/create-zombie-voices.py` 重建。

四段 Dvortygirl 录音衍生物继续使用 CC BY-SA 3.0；orange 衍生物继续使用 Association Shtooka / Judith Franck 的 CC BY 3.0 US。来源网址沿用上方各词链接，包内署名清单已登记处理方式与原许可。五段衍生发音保持 pending，需真人确认词音清晰度和音色。

## 扩充至 11 种水果（2026-11-01）

新增梨 pear、草莓 strawberry、樱桃 cherry、菠萝 pineapple、猕猴桃 kiwi、桃子 peach。图片分别为 OpenMoji 17.0.0 的 1F350、1F353、1F352、1F34D、1F95D、1F351，沿用 CC BY-SA 4.0；原始618×618 PNG未改图，已逐张查看。来源为 https://github.com/hfg-gmuend/openmoji/tree/17.0.0/color/618x618 。

新增录音来自 Wikimedia Commons：pear、strawberry、cherry、pineapple、peach 为 `En-us-<word>.ogg`，作者 Dvortygirl，CC BY-SA 3.0；kiwi 为 `En-au-kiwi.ogg`，作者 Commander Keane，CC BY-SA 4.0。素材采用混合口音，不宣称统一美式。转换为44.1kHz单声道96kbps MP3，标准录音不变调；各有同许可的僵尸变声衍生物。原始词条、作者、许可、原录音/图片/衍生音频哈希详见 [扩充素材清单](expanded-fruit-manifest.json)。

新增12段MP3完整解码通过；新词kiwi在模拟器实际听词后进入混合战斗。音色、单词清晰度和真机播放仍须真人听审。标准词音与变声词音均在首页署名入口登记。

## 2026-11-02 学习女声与水果上衣

听词使用 `learn-*.mp3`，由 Piper en_US-ljspeech-medium 单女声模型生成。模型仓库标注MIT，训练录音LJSpeech为公有领域；来源：[模型卡](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD)、[仓库授权](https://huggingface.co/rhasspy/piper-voices/blob/main/README.md)、[训练录音](https://keithito.com/LJ-Speech-Dataset/)。使用独立临时环境生成，不在小程序中分发模型或Piper工具。响度归一化到-18 LUFS，44.1kHz单声道96kbps，清晰度待真人试听。每个文件哈希见 `learning-voice-manifest.json`。

`zombie-body-{水果}.svg/png` 是本项目原始僵尸上身的11种衣服配色版本，脸、手、轮廓和几何不变，全部由 `scripts/create-fruit-outfits.cjs` 生成。

2026-11-02：菠萝图片已替换为本项目通过内置 image_gen 生成的透明底插画（金黄色果身、绿色叶冠、清晰菱形纹理），当前文件不再使用上述 OpenMoji 菠萝。生成记录见 [菠萝素材记录](assets/original/pineapple-imagegen.md)。其他五种新增水果图片不变。

## 成功鼓励语音

`victory-praise.mp3` 为“你真棒！”中文合成语音，使用 [Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)（Apache-2.0）、女声zf_001和0.95语速生成，44.1kHz单声道96kbps。不分发模型及运行工具，只打包生成的音频。生成脚本 `scripts/create-victory-praise.py`，哈希及来源记录 `docs/victory-praise-manifest.json`；实际听感待真人试听。

## 八关分类资源（2026-11-02）

- 分类和中英文词汇来源：本机 `english-kids-site/lib/data.ts`、`lib/words.ts`；选取清单见 `level-word-source.json`。保留11种水果，新增82个词，总计93词。
- 新图片：OpenMoji 17.0.0 的54种图标（CC BY-SA 4.0）及本项目原创颜色/工具/家居/身体示意图，原SVG保存在 `docs/assets/levels/`。逐项来源见 `level-image-manifest.json`。已查看整张联系表确认图片内容；glass按原词库“玻璃”用玻璃板图，不画饮水杯。
- 8张封面使用原创底景嵌入对应选词图；含OpenMoji图的合成图沿用CC BY-SA 4.0。水果沿用原CC0苹果，颜色封面原创。
- 16种动物僵尸以Canvas原创几何绘制，不直接使用OpenMoji动物作战斗身体；包括耳朵、象鼻、鸟喙、翅膀、条纹等形态差异，四足交替行走，飞行/游动有对应运动。
- 新增164段音频：82段标准英语女声及82段低沉卡通退场声。复用已登记的Piper LJSpeech模型，清单/校验值见 `level-voice-manifest.json`。生成过程中ffmpeg逐项编码通过；真人听感仍待试听。
- 新分类媒体位于 `miniprogram/learning-assets` 普通分包，通过 `require.async('../learning-assets/ready')` 加载成功后才展示选词面板。失败允许重试；主包保留首页封面、原水果资源和通用战场图。资源路径校验仅允许登记的主包/学习分包目录。
- 生成脚本：`scripts/create-level-assets.cjs`（需要Resvg与OpenMoji SVG目录）、`scripts/create-level-voices.py`（需要Piper模型与ffmpeg），审校后运行 `scripts/sync-level-manifest.cjs` 同步首页署名清单。没有把模型文件放进小程序。

`base-hit.mp3` 为本项目原创合成的0.24秒堡垒敲击声，无外部采样；生成脚本为 `scripts/create-base-hit-audio.py`。与子弹命中音使用独立通道，读词时降音，暂停和卸载时停止。
