# MVP V2 工单规划与迁移映射

规划及规则确认日期：2026-10-30。正常入口仍是 V1，V2 契约、纯战斗模拟与 Canvas 开发预览已在 `miniprogram/fortress/` 实现。本文与 [architecture.md](../architecture.md) 描述待实现的堡垒守卫版本。修改前工单快照见 [归档](archive/issues-before-v2.json)。

## 本轮确认

- 主角位于下方堡垒基地；怪物抵达后攻击基地，基地有血条，归零立即失败结束。
- 局内技能范围：双发、射速提升、子弹变宽；随机二选一，仅本局生效，细则已由用户接受 A1—C8 整份提案确认。
- 各种水果怪需联网下载，可爱优先；普通水果图片只用于教学/对照，不作为最终怪物形象。
- 金币掉落与武器/装备长期成长明确后置，不阻塞当前 MVP。

## 工单总表

已完成的 #1/#2/#3/#5/#6/#7 不重开，标明历史及复用边界；新增 #18—#23；重写 #4、#8—#16 与 #17 的当前范围和依赖。旧记录保留，不把原来的测试/代码直接标成新版完成。

| 工单 | 新版范围 / 历史标题 | 状态 | 前置 |
| --- | --- | --- | --- |
| [#1](https://github.com/zfz193071/word-monster-weapp/issues/1) | [MVP] 确认首关玩法、奖励与学习记录口径 | 保留已关闭（V1 历史完成） | — |
| [#2](https://github.com/zfz193071/word-monster-weapp/issues/2) | [MVP] 确认微信发布形态、AppID 与调试接入条件 | 保留已关闭（沿用基础设施） | — |
| [#3](https://github.com/zfz193071/word-monster-weapp/issues/3) | [MVP] 初始化原生微信小程序 TypeScript 工程 | 保留已关闭（沿用基础设施） | — |
| [#4](https://github.com/zfz193071/word-monster-weapp/issues/4) | [MVP V2] 联网下载可爱水果怪、堡垒与武器素材并审校 | 进行中，候选已下载、五怪未齐 | #18 |
| [#5](https://github.com/zfz193071/word-monster-weapp/issues/5) | [MVP] 实现数据契约、版本化内容配置与配置校验 | 保留已关闭（V1 历史完成） | — |
| [#6](https://github.com/zfz193071/word-monster-weapp/issues/6) | [MVP] 实现纯逻辑关卡状态机与幂等答题判定 | 保留已关闭（V1 历史完成） | — |
| [#7](https://github.com/zfz193071/word-monster-weapp/issues/7) | [MVP] 实现发音与音效适配器及音频失败重试 | 保留已关闭（V1 历史完成） | — |
| [#8](https://github.com/zfz193071/word-monster-weapp/issues/8) | [MVP V2] 调整首页说明、守堡新局入口与会话交接 | 待开发 | #19、#10 |
| [#9](https://github.com/zfz193071/word-monster-weapp/issues/9) | [MVP V2] 实现右侧听词选怪与战斗启动门控 | 待开发 | #18、#19、#4、#22 |
| [#10](https://github.com/zfz193071/word-monster-weapp/issues/10) | [MVP V2] 编排守堡波次、技能选择与胜败终局 | 待开发 | #18、#9、#20、#21、#22、#11 |
| [#11](https://github.com/zfz193071/word-monster-weapp/issues/11) | [MVP V2] 实现波间随机技能二选一与局内效果 | 待开发 | #18、#19、#20 |
| [#12](https://github.com/zfz193071/word-monster-weapp/issues/12) | [MVP V2] 实现波次结果本地存储、版本隔离与损坏回退 | 待开发 | #18、#19 |
| [#13](https://github.com/zfz193071/word-monster-weapp/issues/13) | [MVP V2] 完成 Canvas、基地攻防与音频生命周期清理 | 待开发 | #10、#21、#22 |
| [#14](https://github.com/zfz193071/word-monster-weapp/issues/14) | [MVP V2] 实现通关与基地失败面板、学习反馈及重玩 | 待开发 | #10、#11、#12 |
| [#15](https://github.com/zfz193071/word-monster-weapp/issues/15) | [MVP V2] 完成守堡动作游戏端到端、真机与体验版验收 | 待开发 | #4、#8、#10、#11、#12、#13、#14、#21、#22 |
| [#16](https://github.com/zfz193071/word-monster-weapp/issues/16) | [MVP V2] 开展儿童守堡试玩与听词效果观察 | 待开发 | #15 |
| [#17](https://github.com/zfz193071/word-monster-weapp/issues/17) | [MVP V2 总览] 堡垒守卫架构、工单依赖与交付验收 | 总览，持续更新 | 见下方阶段 |
| [#18](https://github.com/zfz193071/word-monster-weapp/issues/18) | [MVP V2] 冻结堡垒守卫玩法、数值与技能规则 | 已完成（A1—C8 已确认） | — |
| [#19](https://github.com/zfz193071/word-monster-weapp/issues/19) | [MVP V2] 定义波次、堡垒战斗、技能与结果契约 | 已完成（59 项测试通过） | #18 |
| [#20](https://github.com/zfz193071/word-monster-weapp/issues/20) | [MVP V2] 实现移动射击、真实碰撞与基地攻防模拟 | 已完成（73 项测试通过） | #18、#19 |
| [#21](https://github.com/zfz193071/word-monster-weapp/issues/21) | [MVP V2] 实现 Canvas 战场、堡垒血条与触摸控制 | 进行中：技术组件已实现，素材/真机待验收 | #19、#20、#4 |
| [#22](https://github.com/zfz193071/word-monster-weapp/issues/22) | [MVP V2] 实现怪物残影、退场读词与音效协调 | 待开发 | #18、#19、#4、#7 |
| [#23](https://github.com/zfz193071/word-monster-weapp/issues/23) | [后续·非 MVP] 金币掉落与武器装备长期成长设计 | 后续，不排入 MVP | #16 |

## 实施顺序

1. **先冻结规则与准备素材**：#18 冻结玩法和数值；#4 的联网检索、下载候选和许可核对可先推进，不依赖血量数值。
2. **建立可测技术基础**：#19 新契约 → #20 战斗模拟；#21 渲染/触摸、#22 音频退场可按明确接口推进，正式验收依赖已审校素材。
3. **做出一波可玩闭环**：#9 右侧听词选怪接入 #20/#21/#22；#11 实现三个技能；#10 汇总波次、基地胜败和技能阶段。
4. **完成产品接线**：#8 新首页会话，#12 结果存储，#13 生命周期，#14 通关/失败面板与重玩。
5. **交付与验证**：#15 真机/体验版 → #16 真实儿童试玩。
6. **后续**：#23 金币装备成长，在用户明确启动后再设计和实现。本次不写任何钱包/商店/永久装备代码。

各工单中的前置是最终验收依赖；独立技术验证可以先行，但业务待确认项不得擅自实现。#23 不允许成为 #4—#22 的反向依赖。

## 规则冻结结果（#18）

用户于 2026-10-30 明确答复：“接受整份提案，继续实现”。[A1—C8 已确认规则与十个验收例](mvp-v2-rules-proposal.md) 是实现依据，包含波次/教学、堡垒操作、攻防、同一步结算、技能叠加、退场故障和失败结果保存，原待确认项已解决。

#19 采用 mode=fortress、schemaVersion=2、contentVersion=2；V1 记录不得恢复新局或混入 V2 学习统计。五种水果怪尚未齐备，#4 保持打开；纯模拟 #20 已完成，接口与验证见 [接入说明](fortress-combat.md)。 #21 已提供明确标注占位的 Canvas 开发预览，见 [接入说明](fortress-canvas.md)；正式开战须等待资源与后续集成验收。

## 验收边界

第一版应同时证明：听词选择控制挑战对象、主角操作影响真实子弹命中、怪物能伤害堡垒并导致失败、退场词音对应正确、技能改变当局战斗、暂停/重玩无残留。学习表现只由 Attempt 计算，不能用射击/通关结果替代。

金币成长、其他主题关卡和复杂装备不进入该验收。正式素材许可、人工听审、真机帧时间与真实儿童试玩分别记录，不能用任一层通过替代另一层。
