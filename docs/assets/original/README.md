# 原创首批战斗美术

2026-11-01 为本项目绘制的 SVG 源文件，未裁切或复用参考游戏截图。

- `hero.svg`：首页守卫正面。
- `hero-back.svg`：同一守卫的战斗背面，朝向上方目标；Canvas 按瞄准方向旋转。
- `zombie.svg`：无水果的卡通僵尸本体；头部水果由本局听词结果引用现有普通水果图叠加。
- `base.svg` / `destroyed-base.svg`：完整及损坏防线。
- `weapon.svg` / `bullet.svg`：武器和子弹。

PNG 由 SVG 以原尺寸通过 `@resvg/resvg-js` 渲染，位于 `miniprogram/assets/images/fortress/`。SVG 是后续美术编辑的源文件；运行包使用 PNG。水果及音频继续遵循 `docs/content-assets.md` 中的许可与署名。

本轮已查看守卫、僵尸单图及模拟器首页。已查看自动战斗与技能弹窗截图，路径见本轮需求文档；不代表真机验收。

2026-11-01：新增 `zombie-body.svg`、`zombie-leg-left.svg`、`zombie-leg-right.svg`，从原创僵尸拆分并重画独立裤腿。三张同尺寸透明PNG在Canvas按髋关节变换组合；行进时左右腿反相摆动、脚部交替前后位移，暂停与退场时停止。怪物逻辑宽度40，水果帽与碰撞区域同比缩放。
