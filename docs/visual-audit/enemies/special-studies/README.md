# 五类特殊敌人代表图

2026-11-11 用户确认“按此方向制作代表图”。以已确认的新苹果僵尸脸部、皮肤、破旧服装为参考，使用内置 image_gen 制作；精确提示词见 [prompts.json](prompts.json)，来源、哈希及透明边界见 [manifest.json](manifest.json)。

| 类型 | 审样 | 区分特征 |
| --- | --- | --- |
| 疾行 | [runner-study-01.png](runner-study-01.png) | 修长四肢、轻装、跑姿 |
| 重甲 | [armored-study-01.png](armored-study-01.png) | 铁肩甲、胸甲、护胫 |
| 飞行 | [flying-study-01.png](flying-study-01.png) | 布翼、悬空垂腿 |
| 自爆 | [exploder-study-01.png](exploder-study-01.png) | 琥珀色发光背罐、警示灯 |
| 巨型 | [giant-study-01.png](giant-study-01.png) | 宽肩、粗臂、大手、相对小头 |

五张均已检查完整主体和透明通道；非零 alpha 边界触及画布边缘，正式部件还需检查低透明度残留，不可直接用整图边界作为裁切或碰撞依据。飞行翼尖及巨型手部留白偏紧，正式拆件时需扩大边距。当前统一用苹果帽展示词条身份；水果/动物词条机制不变，后续不能将所有词条都改成苹果。

为便于横向审样，新增 [apple-special-enemies-study-01.png](apple-special-enemies-study-01.png)：它将五个已提出的职责轮廓组合为一张透明候选板。该图由 `style-study-01` 与已批准苹果僵尸外观参考生成，来源哈希记录在清单中；它是审样对照，不是五张独立代表图的替代品，也未接入运行时。

状态：待用户审查；未制作正式动作部件，未接入游戏。布翼和背罐是本次造型提案，不代表新增玩法。当前图片不证明小尺寸识别、动画质量、碰撞或真机验收。
