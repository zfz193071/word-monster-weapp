# #92 普通苹果僵尸材质接入

2026-11-10：按已确认的 style-study-01 与完整战场方向推进普通怪代表图。仅普通苹果僵尸使用新图，Boss、特殊兵种与其他词条仍用既有资源；这些剩余范围不视为完成。

## 来源与处理

内置 image_gen 参考 style-study-01 和旧苹果身体生成，准确提示词见 [prompt.txt](prompt.txt)，母版见 [apple-zombie-source.png](apple-zombie-source.png)，路径、字节与 SHA256 见 [manifest.json](manifest.json)。母版 1254×1254，包含真实 alpha；非零 alpha 在外围仍有残留，没有满足提示词的全透明边带要求。运行图按清单矩形裁切并重采样至 256×320，保留裁切内 alpha，外部残留被裁去，并非无损或原尺寸编码。母版保留在 docs，不进入运行包。

alpha≥16的主体边界为[196,66,1062,1169]，位于裁切范围内；未裁掉主体。运行图按原 128×160 逻辑框、40 逻辑像素宽度绘制，腿部在短裤下方分片交替摆动，上身轻微起伏，攻击继续使用既有前探位移。模拟时间驱动动作，暂停不单独播放动画；原受击光圈、词条、血条与退场流程继续共用。未改变位置、碰撞框、伤害或出怪规则。

资源使用现有 scene-images 分包并加入图片解码门控；无苹果的局不请求该图。RGBA 估算 327680 字节，不含纹理/画布副本。源码预算主包 1747.5 KiB、图片 2038.0 KiB，其他包不变；图片包距项目 2048 KiB 预算仅约10 KiB，后续扩展先拆包，不能继续直接堆入。非微信编译包体或真机峰值数据。

## 审查入口

- [手机/平板八关固定夹具](runtime/review.html)：共16张，正式 CanvasScene 绘制。使用苹果普通怪与两类旧Boss，固定变量检查各背景，不能冒充各关自然怪物。
- [自然首轮连续回放](opening-motion/review.html)：正式出怪工厂及帧循环，手机/平板、DPR2、30fps。没有注入位置、血量或命中特效，没有访问存档。
- [此前同条件回放](../../battlefield-overhaul/opening-motion/review.html)。

普通怪皮肤、衣料、光影已有细节，学习标识/血条可读；两类Boss、特殊兵种、其余词条、宠物和墙体遮挡仍存在明显风格差异，独立完整行走/攻击多帧美术仍待完善。不是微信模拟器或真机录屏，不标记完整战场视觉通过。#92/#98保持开放。

复现素材：`WM_CANVAS_MODULE=/tmp/wm-render-tools/node_modules/@napi-rs/canvas node --import tsx scripts/prepare-zombie-art.mts`。固定场景与回放分别使用 `render-background-review.mts` 的 `WM_SCENE_OUTPUT` 和 `render-opening-motion.mts` 的 `WM_OPENING_OUTPUT` 指向本目录对应子目录。

验证：`npm run check`通过，490项全量测试通过。新增普通怪图片解码等待、普通怪/Boss/特殊兵种分流及无苹果资源选择回归；修正此前一级主角已改用 textured 文件但武器伤害测试仍匹配旧路径的过时断言。项目检查仍保留历史V2十项素材待审提示，不代表这些素材已验收。
