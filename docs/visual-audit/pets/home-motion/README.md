# 首页蓝狐动作修复 · 2026-11-18

用户反馈：眨眼与耳动错位、重影。

当前母图为 `miniprogram/character-assets/home-blue-fox-front.png`（576×384）。本次未生成或替换素材。眼皮原先沿用不匹配当前站姿的局部坐标，实际落在脸侧；耳朵原先裁剪后旋转叠加到完整原图上，保留了原耳轮廓。

修复：眼睛锚定原图 (184,121)、(244,135)，随同一个身体变换绘制；耳朵通过上部原图条带位移，位移在眼睛上方归零，每个源像素只绘制一次。保留原有呼吸、动作周期与成长比例。

`contact-sheet.png` 为真实 HomeRoomScene 在六个固定时间点的离屏渲染。眨眼不再出现在脸侧，耳朵没有重复叠层；不代表真机动态验收。

验证：蓝狐相关 3 项测试通过，类型检查通过。首页与组件定向测试共 11 项，10 通过；房屋构图缩放断言失败，当前缩放公式与 HEAD 一致，本次未改动该公式，不将其记录为通过。

复现采样：

```sh
WM_CANVAS_MODULE=/tmp/wm-render-tools/node_modules/@napi-rs/canvas node --import tsx scripts/render-home-pet-motion.mts
node --import tsx --test --test-name-pattern='蓝狐|首页角色' tests/home-scene.test.ts
```

微信验证：通过 `wechatide -c Codex simulator_refresh --project <repo>` 触发重新编译；随后从模拟器加载的 `home/room-scene.js` 回读方法源码，确认耳动条带变形与新眼睛坐标均已生效，首页 `.home-room` 的 `error=false`。普通 `cli auto` 只启用自动化，不作为更新生效依据。未做真机验收。
