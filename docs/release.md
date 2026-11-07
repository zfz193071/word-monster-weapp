# 小程序发布

本项目为原生微信小程序，AppID 从 `project.config.json` 读取，当前为 `wx4b19fe0c462a601b`。TypeScript 由微信开发者工具编译，无需额外构建 npm。

## 首次准备

1. 使用拥有该 AppID 开发权限的微信扫码登录微信开发者工具，导入仓库根目录。
2. 在工具的「设置 → 安全设置」开启服务端口；若配置了 CLI 访问 token，通过 `WECHAT_DEVTOOLS_CLI_TOKEN` 环境变量提供，不写入仓库。
3. 使用 Node.js 22 或以上版本，在仓库根目录执行 `npm ci`。
4. 登录 [微信公众平台](https://mp.weixin.qq.com)，根据当前账号后台提示完成小程序基本信息、服务类目、备案及隐私等审核要求。具体要求以该账号后台为准。
5. 使用开发者工具真机预览，确认首页、关卡资源分包下载、音频播放、战斗、结算与前后台切换正常。本地自动测试不替代真机验收。

## 一条命令检查并上传

```sh
npm run release:upload -- --version 1.0.0 --desc "首次发布"
```

命令会依次运行项目检查、全部自动测试，再调用本机微信开发者工具编译并上传开发版本；任一步失败立即停止。版本号和更新说明必须明确提供，不自动更改 `package.json`，也不会自动提交 Git。

默认 CLI 路径为 macOS 的 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`；其他安装位置可通过 `WECHAT_DEVTOOLS_CLI` 设置为可执行 CLI 的绝对路径。当前脚本按本项目 macOS 环境实现，未验证 Windows `.bat` 启动方式。

上传结果保存在已被 Git 忽略的 `artifacts/releases/<时间戳>-<进程号>/upload.json`。命令行不需要 AppSecret 或 CI 私钥。登录过期、端口未开启、账号无权限或包体超限时，按开发者工具返回信息处理后重试。

只运行本地检查、不编译上传：

```sh
npm run release:check
```

## 审核与正式上线

1. 上传成功后进入微信公众平台「管理 → 版本管理」（以当前后台菜单为准），核对开发版本号和说明。
2. 将开发版本设为体验版，添加体验成员并完成真机验收。
3. 提交审核，按后台要求填写功能、类目、隐私说明和测试说明；若被驳回，按审核意见修正后重新上传。
4. 审核通过后在后台执行发布，再用普通微信账号核验线上版本。

当前脚本自动完成检查和开发版本上传。提交审核及正式发布仍在后台操作，不能跳过微信审核。若需要自动提审和上线，须先确认账号可用接口及授权方式、提审资料和审核通过后的发布时间策略，再实施该部分。

本地资源审校记录见 `docs/content-assets.md`。`npm run check` 不证明素材人工听审或授权审校已完成，发布前需核实；历史 README 中的开发状态也不作为本次验收结论。

官方参考：[开发者工具命令行](https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html)、[微信官方 miniprogram-ci 说明](https://github.com/wechat-miniprogram/miniprogram-ci-dist)。后者可用于后续无人值守上传，但需要管理员配置代码上传密钥与 IP 白名单。
