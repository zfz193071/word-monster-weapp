# 已批准猫动作向四足动物扩展

2026-11-10 用户明确回复“认可猫动作，可以扩展”。本次把猫样片的落脚支撑、平滑回摆、分关节弯曲和脊柱收展方式扩展到其余10种四足动物；保留物种比例、兔子成对蹬地、大象持续支撑和四肢统一配色。猫原动作保持，步幅表同步为实际20；大象缩短步幅以适应短腿重步。

[连续回放](review.html)包含11种动物×手机/平板，共22段，每段12秒、30fps、360帧，DPR2。使用正式开场计划和Canvas帧循环，未改战斗速度、碰撞、伤害或奖励。quadruped-poses.png 为11种×8相位放大诊断图。report.json 保留逐秒怪物位置和状态；video-validation.json 为编码尺寸、帧数及SHA256核对。

520项全量测试、npm run check 与diff检查通过；单包源码预算均低于2048KiB，主包1768.5KiB。历史V2十项素材待审提示仍存在。支撑脚回归逐种检查世界位移抵消、抬脚、落地和循环连续性。

这些是离屏证据，未完成微信模拟器、真机、儿童辨认或完整关卡验收。猫动作作为扩展基准获批准，不等于其余动物或精细立体材质最终通过。停止收脚过渡、僵尸手臂协调及精细动物素材继续由#99/#85/#88推进，#99保持开放。

重建：

```sh
WM_CANVAS_MODULE=/tmp/wm-render-tools/node_modules/@napi-rs/canvas WM_GAIT_OUTPUT=docs/visual-audit/locomotion/approved-cat-expansion node --import tsx scripts/render-quadruped-sheet.mts
WM_CANVAS_MODULE=/tmp/wm-render-tools/node_modules/@napi-rs/canvas WM_GAIT_OUTPUT=docs/visual-audit/locomotion/approved-cat-expansion WM_GAIT_ALL=1 node --import tsx scripts/render-monster-gait.mts
```
