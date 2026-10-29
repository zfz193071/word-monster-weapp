# 首关素材交付清单（工单 #4）

词表已由用户确认，面向小学 1—2 年级英语入门儿童。当前只完成词条与资源引用登记，以下文件尚未制作；所有资源在 `content/assets.ts` 中均为 `pending`，不可当作正式内容包交付。

| 词条 | 释义 | 图片路径（相对 miniprogram） | 发音路径（相对 miniprogram） | 状态 |
| --- | --- | --- | --- | --- |
| apple | 苹果 | assets/images/apple.png | assets/audio/apple.mp3 | 待制作、图音词审校 |
| banana | 香蕉 | assets/images/banana.png | assets/audio/banana.mp3 | 待制作、图音词审校 |
| orange | 橙子 | assets/images/orange.png | assets/audio/orange.mp3 | 待制作、图音词审校 |
| grape | 葡萄 | assets/images/grape.png | assets/audio/grape.mp3 | 待制作、图音词审校 |
| watermelon | 西瓜 | assets/images/watermelon.png | assets/audio/watermelon.mp3 | 待制作、图音词审校 |

每项交付时核对：图片没有英文/中文答案；物品清晰、无歧义；发音与词条匹配、音量清楚；记录来源与使用权限。将 `reviewStatus` 改为 approved 之前须完成实际图像检查与逐条审听，不能仅依据文件存在或生成工具执行成功。

主角、怪物、武器的三个视觉阶段及音效仍待 #4/#11 制作整合。首页当前使用本项目编写的 CSS 小怪物造型，不引用旧项目奥特曼素材；它不是已经交付的完整角色/武器素材包。不直接复制未核对权利的同级项目图片或音频。

`npm run check:content` 只验证配置语义；`npm run check:assets` 检查词汇资源是否存在、是否审校及来源/使用权限字段。在本阶段后者应失败，以明确阻止未审校资源交付。资源包仍需在后续微信打包中测量，主包上限 2M，不能以本清单推断已通过包体验收。

当前 #4 保持进行中，未声称已完成素材制作或儿童适龄审校。
