# 单词怪物

原生微信小程序 MVP，AppID 为 `wx4b19fe0c462a601b`。业务规则见 [architecture.md](architecture.md) 第 14 节。

已完成工单 #3 的工程骨架和 #5 的数据契约、首关配置、轮次生成与校验。页面尚未接入关卡引擎，战斗区域暂为空；发音、选图、奖励或保存尚未实现，不代表可玩版本。

## 安装与检查

使用 Node.js 22 或以上版本，在仓库根目录执行：

```sh
npm ci
npm run check
npm test
```

`check` 检查小程序 TypeScript、工程文件结构和首关内容配置；`test` 使用 Node 测试运行器及 tsx，支持后续不依赖微信运行时的纯逻辑测试。当前测试覆盖导航连点/返回/失败重试、100 个固定随机种子的出题约束、非法配置与资源引用拒绝，不替代微信编译与真机测试。依赖只用于开发，运行时无需构建 npm。

## 微信开发者工具导入

1. 使用有本项目开发权限的微信扫码登录开发者工具。
2. 导入本仓库根目录（不要只选 miniprogram 子目录），确认 AppID 与 project.config.json 一致，项目类型为小程序；无需云开发。
3. 工具读取 miniprogramRoot 和 TypeScript 编译插件，编译到 `pages/home/home`。
4. 点击“出发”进入 `pages/battle/battle`；点击“返回首页”回到首页。
5. 需要自动化验证时，在“设置 → 安全设置”开启服务端口，并在工具提示时授权 Codex 连接。

基础库已固定为开发者工具实际加载的 `3.17.5`（工具版本 `2.02.2609240`）。这是当前模拟器验证版本，不代表已完成真机兼容验收。`project.private.config.json` 是个人配置，不提交；若工具行为与共享配置不符，检查该文件有无覆盖。

真机预览：点击开发者工具“预览”，用有权限的微信扫码，检查两页导航。首次预览涉及微信服务器打包与二维码，请保留工具版本、实际基础库、手机系统、微信版本和结果记录。工程骨架通过不代表整关玩法已验收。

## 模块边界

| 目录 | 用途 |
| --- | --- |
| miniprogram/pages | home、battle 两页与完成面板（后续） |
| miniprogram/components | monster、weapon 视图组件（后续） |
| miniprogram/game | 已确认规则、数据/事件契约、每局轮次生成；状态机后续实现 |
| miniprogram/content | 已确认词表、首关配置、资源清单与语义校验；素材仍待审校 |
| miniprogram/services | 音频与本地进度适配器（后续） |
| miniprogram/assets | 原创或授权清晰的图片、预制发音（后续） |

尚未实现的模块使用 `.gitkeep` 保留目录，不提供伪实现。不要向仓库写入 AppSecret、登录信息或上传私钥。构建产物、二维码、截图放入已忽略的 `artifacts/`。

## 内容配置与资源交付

首关词表为 apple、banana、orange、grape、watermelon。`createRounds` 生成初遇/辨词/守关各 5 题，分别使用 1/2/3 个选项；初遇顺序固定，另外两阶段各自洗牌，选项唯一且随机排位。调用时可注入随机源用于复现测试；生成结果被冻结，同题重试不得重新生成。

`Attempt.phase` 显式记录教学/辨词/守关阶段；`hintUsed`、`replayCount`、`attemptIndex` 保留作答条件，避免把教学或提示后完成算作独立答对。异步事件带 sessionId、roundId、revision，供后续引擎丢弃过期回调。

`npm run check:content` 只验证配置，不检查素材已完成。`npm run check:assets` 是词汇资源交付检查：缺文件、未审校、来源或使用权限未确认均返回非零状态。目前 10 项图片/音频均尚未制作，因此资源检查**预期失败**；这不会被当作已通过上线验收。完整清单见 [docs/content-assets.md](docs/content-assets.md)。
