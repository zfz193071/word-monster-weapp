# 工单#111 音频资源清单 (简化版)

## 资源来源
**网站**: https://mixkit.co  
**许可**: Mixkit License - 免费商用，无需署名  

---

## 必需音频

### 战斗音乐
| 文件 | 描述 | 下载链接 |
|------|------|----------|
| **battle-urgent.mp3** | 激昂战斗 BGM (推荐 Daredevil) | [下载](https://mixkit.co/free-stock-music/daredevil/) |

### 僵尸音效
| 文件 | 描述 | 下载链接 |
|------|------|----------|
| **zombie-growl.mp3** | 僵尸低吼声 | [下载](https://mixkit.co/free-sound-effects/zombie-monster-growl/) |

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
├── battle-urgent.mp3    # 战斗 BGM
└── zombie-growl.mp3     # 僵尸低吼
```

---

## 许可证
**Mixkit License**: 免费商用，无需署名，详见 https://mixkit.co/license/
