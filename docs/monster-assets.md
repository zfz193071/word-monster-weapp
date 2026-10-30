# 五种水果角色素材（#4）

2026-10-30 联网下载并接入五种独立拟人水果角色；普通水果教学图仍单独保留。逐张检查了透明背景、五官、可辨识水果轮廓和无答案文字；均无血腥。当前是偏友善的水果角色：三个像素风与两个插画风，画风尚不统一，也未宣称儿童试玩已证明足够可爱/有怪物感。

| 角色 | 作者与来源 | 许可 | 处理 |
| --- | --- | --- | --- |
| apple / orange / watermelon | [CazBee – Cute Fruit Character Sprites](https://caz-bee.itch.io/cute-fruit-characters) | CC0 1.0 | 下载原始 32×32 PNG，只重命名，像素绘制不平滑 |
| banana / grape | [gem – happy fruits](https://openclipart.org/detail/183203/happy-fruits) | CC0 1.0 | 从下载的 SVG 中分离完整角色，去掉背景和其他水果，保留原五官/路径，透明正方形视口转 256×256 PNG |

许可依据：CazBee 作者页标注 Creative Commons Zero；[Openclipart 官方许可说明](https://openclipart.org/share) 标明上传作品以 CC0 释放并允许修改和商业用途。未购买素材、未使用收费包截图、未生成替代图片。首页“素材署名”列出新文件的来源与改动。

包内路径为 `miniprogram/assets/images/monsters/<word>.png`；文件尺寸、哈希和改动说明见 [manifest](monster-asset-manifest.json)。原始 PNG 与 SVG、分离后的 SVG 保存于 `docs/assets/candidates/`。转换使用临时开发工具 `@resvg/resvg-js`，不引入小程序运行依赖。

SVG 分离依据：香蕉保留 path4723、path4733、path4747、g4887、g3530；葡萄移除香蕉、背景 rect4913/rect4893、苹果 path4721/path3195/path4757/path4759/layer1-4 及苹果高光 path4717/path4707，其他元素保留。图形边界外留 8 个源坐标单位，最大边扩为正方形后输出 PNG。派生物仍按 CC0 提供。

`FORTRESS_MONSTERS` 登记原图尺寸、中心锚点和保守的包围矩形 hitbox。碰撞是已确认的矩形/扫掠模拟，不是逐像素轮廓碰撞；香蕉斜向外形会有矩形内透明区域，须在儿童操作体验中核对。没有改变怪物血量、速度或子弹伤害。

开发预览提供五种角色切换，用真实图片加载与真实碰撞。基地/主角/武器仍为明确标注的开发占位；五段现有词音仍待人工听审。因此 #4、#21 继续打开；严格资源检查现只剩五段词音待审校，不把它当成全部美术已交付。
