# 关卡引擎接入约定（工单 #6）

`createSession(sessionId, level, rounds)` 建立冻结的初始状态；`reduceGame(state, event)` 返回 `{ state, effects }`，没有微信 API、计时器、随机数或隐式时钟调用。轮次由 #5 的 `createRounds` 每局生成一次，sessionId 由调用方生成唯一值。

调用方必须先保存返回的新 state，再执行 effects；不能使用旧快照重复处理后续事件，也不能按效果播放次数增加奖励。UI 读取 state 中的 energy、weaponStage、shields、hintUsed 和 feedback。引擎重放一次相同输入会得到相同结果，但只有在最新状态上提交事件才提供会话内的幂等防护。

## 事件与状态

| 状态 | 接受的轮次事件 | 结果 |
| --- | --- | --- |
| ready | start（会话事件） | presenting，发出 playPrompt |
| presenting | audioReady / audioFailed | awaitingAnswer / audioError |
| presenting / awaitingAnswer | replay | 新的 presenting 操作序号，重播计数加 1 |
| awaitingAnswer | choose | 有效选项判定并记录，进入 feedback；非法选项忽略 |
| audioError | retryAudio | 重试本题发音，不新增答题或错误记录 |
| feedback | feedbackFinished | 错误时同题重播；正确时升级或下一题，最后一题完成 |
| upgrade | upgradeFinished | 推进下一题，不再次结算奖励 |
| paused | resume（会话事件） | 恢复先前已提交状态，必要时重新呈现音频/反馈/升级 |
| completed | 无 | 不再发出完成命令或改变记录 |

start、pause、resume 带 sessionId。其余事件带 sessionId、roundId、revision；音频和动画回调必须使用 effects 中捕获的 context，不能到回调执行时重新读取最新 context，否则旧回调会被错误当成新事件。视图提交选择同样使用该次渲染的 context。

feedbackFinished 和 upgradeFinished 额外携带调用方时钟 `at`（非负有限毫秒时间戳），最终完成时写入 completedAt；引擎不读取 Date.now。无效时间或不适用于当前状态的事件被忽略。nextRound 是内部推进步骤，直接进入下一题 presenting，不要求额外 UI 回调。

## 效果适配器责任

| effect | 后续工单的处理 |
| --- | --- |
| playPrompt | #7 停止/替换已有播放后播当前题发音，以 context 回送 audioReady/audioFailed；成功完成播放才解锁答题 |
| showFeedback | #9/#11 按 attempt.correct 显示正确攻击或温和错误反馈；正确时揭示词和读音。完成后回送 feedbackFinished |
| showUpgrade | #11 仅呈现已经结算的武器阶段，再回送 upgradeFinished |
| stopPlaybackAndFeedback | #7/#13 停止音频并取消动画/定时器；迟到回调还会由 revision 防护 |
| sessionCompleted | #12/#14 以 result.sessionId 幂等保存并展示结果，保存失败不抹掉完成结果 |

反馈和升级的受控超时兜底由适配器实现，也必须携带同一 context。动画正常结束与兜底同时到达时只有一次能被当前状态接受。引擎本身不创建计时器；本工单未实现实际音频、动画、存储或页面生命周期绑定。

## 结算与记录

接受正确选择时就提交奖励：教学 0 点，辨词/守关每题最终正确 1 点（含重试/提示后），守关同时拆一层盾；3/7 点更新武器阶段。feedbackFinished/upgradeFinished 只推进，不结算。第一次错误重播，第二次错误后 state.hintUsed 为 true；第二次错误记录保留提交时尚未提示的事实，之后的选择记录 hintUsed=true。

Attempt.phase 区分教学与正式任务；attemptIndex 从 1 开始，只随有效选择增加。首次题目播放、答对后的揭示读音、发音失败重试和后台恢复重播不增加 replayCount；主动重播及错误反馈后的题目重播增加。错误重试保留原 Round 与选项位置。

pause 使旧操作序号失效，resume 在 presenting/feedback/upgrade 重发呈现命令，在 ready/awaitingAnswer/audioError 仅恢复状态。不会重新提交奖励或答题记录。进程终止后不恢复这个内存状态；新局重新 createSession，重置能量、武器及护盾。

## 验证范围

`npm run check` 与 `npm test` 覆盖非法输入、跨局/跨题/同题旧回调、连点、重播与音频失败、错误提示、奖励升级、护盾、完成幂等、暂停恢复及不可变快照。17 项引擎测试加既有测试共 28 项。页面尚未接入引擎，正式素材和真机验收仍待后续工单完成。
