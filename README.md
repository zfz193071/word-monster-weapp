# 单词怪物

原生微信小程序 MVP，AppID 为 `wx4b19fe0c462a601b`。业务规则见 [architecture.md](architecture.md) 第 14 节。

当前实现工单 #3 的工程骨架：首页、战斗页与往返导航。战斗区域暂为空，未实现发音、选图、奖励或保存，不代表可玩版本。

## 安装与检查

使用 Node.js 22 或以上版本，在仓库根目录执行：

```sh
npm ci
npm run check
npm test
```

`check` 检查小程序 TypeScript 和工程文件结构；`test` 使用 Node 测试运行器及 tsx，支持后续不依赖微信运行时的纯逻辑测试。当前测试覆盖导航连点、返回重进和失败重试，不替代微信编译与真机测试。依赖只用于开发，运行时无需构建 npm。

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
| miniprogram/game | 纯逻辑状态机、规则、数据契约（后续） |
| miniprogram/content | 经审校的词汇和关卡配置（后续） |
| miniprogram/services | 音频与本地进度适配器（后续） |
| miniprogram/assets | 原创或授权清晰的图片、预制发音（后续） |

当前空模块使用 `.gitkeep` 保留目录，不提供伪实现。不要向仓库写入 AppSecret、登录信息或上传私钥。构建产物、二维码、截图放入已忽略的 `artifacts/`。
