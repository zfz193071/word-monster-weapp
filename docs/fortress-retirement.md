# 怪物退场与读词（#22）

`fortress/retirement.ts` 接收已提交的 `CombatState(status=cleared)`，检查唯一怪物血量为零、击败 ID 已登记及词条已知。每个实例只启动一次，输出携带 sessionId/waveId/combatId/monsterId/wordId/generation 的结果，不改血量、不创建 Attempt、不加奖励。

宿主沿用唯一 Canvas RAF：战斗结束后冻结模拟 tick，驱动残影累计前台时间；至少 800ms 且词音自然结束后，才开始 250ms 淡出。`onChange` 只发布阶段变化；淡出透明度由 Canvas 直接读取，不逐帧 setData。WXML 显示普通水果对照与单词。

读词复用 #7 的音频适配器，独占当前退场声音，不播放射击/命中音效。15 秒超时与平台播放失败均显示“再听一次 / 继续”，不会自动略过。重试以新 revision 淘汰旧音频完成/超时；继续结果标记 skippedAfterFailure，不计听词错误或 replayCount。

暂停清理音频上下文和看门狗，冻结残影/淡出；恢复时未结束的词音从头重播，已完成词音不重播。失败等待中的重试/继续在暂停时不接受。宿主在切波、重玩、退出时 dispose；基地失败不能创建退场。父控制器接收 retirementcomplete 时仍须核对整套上下文是否属于当前波，后续 #10 负责奖励和下一波。

该组件已经接入仅开发版可用的战场预览。完整五波编排、人工听审、真机后台音频行为还未验收，#22 保持进行中。

本轮验证：全项目 89 项自动测试与 npm run check 通过，含五词对应、重复 start/完成、800ms + 250ms 时序、超时/重试/继续、暂停恢复与销毁，以及真实模拟击败后只有一个 RAF 的集成测试。模拟器五种图片均 ready=true、error 为空；苹果实际自然播放后进入 done；香蕉在 playing 阶段暂停时保留残影和水果对照，恢复后进入 done，前后战斗 tick 均为 419。此为流程验证，不替代人工听审。
