# 音频适配器

`miniprogram/services/audio.ts` 导出 `createAudioAdapter`，每局创建一个实例，传入 sessionId 与 emit。默认使用微信 InnerAudioContext；测试注入音频工厂及计时器，不在模块加载时访问 wx。

## 接入约定

- 引擎 `playPrompt` 效果：按 wordId 查找 Word.audioPath，调用 `playPrompt(path, effect.context)`。只在自然播放结束后发出 audioReady，错误/异常/中断/超时发出 audioFailed。emit 将原 context 交给 reduceGame，先保存新状态再执行新效果。
- 主动重播和失败重试先向引擎发送 replay/retryAudio，再执行返回的 playPrompt；不要直接重用旧 context。引擎负责 replayCount，适配器不计数。
- `playReveal` 用于答对揭示发音，`playEffect` 用于音效，可传完成回调，参数为成功与否；二者不发送题目解锁事件。失败详情经 onFailure 报告，调用方按 context 核对当前状态后展示。
- 一个实例只有一个播放通道，每次播放新建 context，替换前停止并销毁旧 context；发音抢占音效，发音期间音效请求返回 suppressed，不排队。不要等待被抑制或取消的音效回调来推进玩法。
- 同一 session/round/revision 的同类命令只执行一次；旧版本、其他会话和同版本不同题号均忽略。回调捕获请求上下文，不读取最新题号。
- 暂停时调用 stop；恢复用引擎产生的新 context 播放。离开/卸载时调用 dispose，取消计时器、解绑监听、停止并销毁资源。dispose 幂等，后续请求返回 disposed。主动取消不报告播放失败或调用完成回调。
- 音频路径使用包内 `/assets/audio/<小写字母、数字或连字符>.mp3` 或 `.wav`。默认 15 秒技术超时用于缺失终止回调的故障兜底，可配置；这不是游戏答题倒计时。不覆盖系统静音设置。

## 验证范围

tests/audio.test.ts 使用可控音频对象验证结束门控、失败/重试、连续重播、旧回调、优先级、资源释放、超时、平台异常及与引擎的暂停恢复联动。停止异常时仍尝试销毁资源。

本单交付服务接口；页面执行效果和生命周期接线分别由 #9、#13 完成。#4 正式媒体尚未交付，模拟测试不证明真实发音质量、设备静音行为或真机资源释放；这些需在 #4/#15 补充验收。

API 依据：[创建 InnerAudioContext](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/wx.createInnerAudioContext.html)、[onEnded 自然播放结束](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/InnerAudioContext.onEnded.html)、[destroy](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/InnerAudioContext.destroy.html) 及锁定的微信类型声明。
