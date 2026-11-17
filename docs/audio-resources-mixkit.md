# 工单#111 音频资源清单 (简化版)

## 资源来源
**网站**: https://mixkit.co  
**许可**: 音效与音乐许可不同；音效可用于电子游戏，Mixkit 免费音乐不可用于电子游戏。

---

## 必需音频

### 战斗音乐
| 文件 | 描述 | 下载链接 |
|------|------|----------|
| **battle-loop.mp3** | 项目原创战斗 BGM；加载页和战斗页共用 | 见 `scripts/create-battle-audio.py` |

### 僵尸音效
| 文件 | 描述 | 下载链接 |
|------|------|----------|
| **zombie-growl.mp3** | 僵尸低吼声，Mixkit 素材 1973 | [来源](https://mixkit.co/free-sound-effects/horror/) |

---

## 播放逻辑

### 战斗音乐
- 循环播放
- 音量：22% (可调节)

### 僵尸低吼
- **触发时机**: BGM 播放期间随机触发
- **间隔**: 3-11 秒随机
- **音量**: 25%
- **并发**: 单声道 (不会重叠)

### Ducking (语音优先)
- 语音播放时 BGM 自动压降至 20%
- 语音播放时僵尸低吼暂停

---

## 文件位置
```
miniprogram/assets/audio/
├── battle-loop.mp3      # 战斗 BGM
└── zombie-growl.mp3     # 僵尸低吼
```

---

## 许可证
低吼采用 [Mixkit Sound Effects Free License](https://mixkit.co/license/modal/sfxFree/)；战斗音乐为本项目原创。旧版推荐的 Mixkit Daredevil 属于 [Stock Music Free License](https://mixkit.co/license/modal/musicFree/)，该许可不允许电子游戏使用。
