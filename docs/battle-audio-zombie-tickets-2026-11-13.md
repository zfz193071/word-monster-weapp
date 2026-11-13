# 战斗音频与僵尸类型调整工单

## 工单 #109: 前期同类型僵尸连杀播报 (每 5 个)

**用户需求**: 前期怪物少的时候，每杀死 5 个同样类型的僵尸，播放一次这个事物名称 (如"apple"单词发音)

**范围**: 
- `miniprogram/fortress/combat.ts` - 击杀计数逻辑
- `miniprogram/fortress/battle-audio.ts` (需新建) - 播报控制器
- `miniprogram/fortress/enemy-types.ts` - 僵尸类型识别

**验收标准**:
- [ ] 按僵尸词条类型 (如 apple/banana/orange) 独立计数
- [ ] 每累计 5 个同类型击杀触发一次单词发音
- [ ] 使用清晰男声，播放速率 0.8
- [ ] 前期判定：当前关卡总僵尸数 < 500 只时启用此规则
- [ ] 语音播放不打断死亡画面，不延迟技能选择
- [ ] 暂停/后台停止声音，恢复重播未完成内容
- [ ] 退出清理计时器和音频资源

**技术建议**:
```typescript
// 新增 battle-audio.ts
interface KillCounter {
  readonly word: string;
  readonly count: number;
}

class BattleAudioController {
  private killCounters: Map<string, number> = new Map();
  private readonly threshold: number; // 前期=5
  
  onMonsterKill(word: string, totalMonstersInSession: number): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}
```

**优先级**: P1

---

## 工单 #110: 后期同类型僵尸连杀播报 (每 30 个)

**用户需求**: 后期战斗僵尸多的时候，每杀死 30 个同类型的僵尸，才播放一次名称

**范围**: 同 #109

**验收标准**:
- [ ] 当前关卡总僵尸数 ≥ 500 只时启用此规则
- [ ] 每累计 30 个同类型击杀触发一次单词发音
- [ ] 与 #109 共享同一套音频控制器
- [ ] 阈值切换在对局开始时冻结，战斗中不动态调整
- [ ] 所有音频行为与 #109 一致

**技术建议**:
```typescript
// battle-progression.ts 新增
export function getKillReportThreshold(totalMonsters: number): number {
  return totalMonsters >= 500 ? 30 : 5;
}

// combat.ts 开局时计算并传入
const reportThreshold = getKillReportThreshold(plan.totalMonsters);
```

**依赖**: #109
**优先级**: P2

---

## 工单 #111: 战斗音乐与僵尸音效升级

**用户需求**: 战斗场面的音乐要换得铿锵激昂，掺杂着僵尸的特殊声音 (参考丧尸低吼声等)

**范围**:
- `miniprogram/fortress/battle-music.ts` (需新建) - 战斗音乐控制器
- `miniprogram/fortress/zombie-sfx.ts` (需新建) - 僵尸音效库
- `miniprogram/assets/audio/` - 新增音频资源

**验收标准**:
- [ ] 新增激昂战斗 BGM (130-150 BPM，鼓点 + 弦乐)
- [ ] 动态混音：打击音效音量 > BGM 20%
- [ ] 音乐自动 ducking(压降) 当语音触发时
- [ ] 僵尸音效分层:
  - 移动：拖沓脚步声 + 低沉喘息
  - 攻击前摇：低吼/咆哮 (给玩家反应时间)
  - 命中：沉闷撞击声
  - 死亡：沉重倒地 + 尘土声
- [ ] 多僵尸时限制同时播放数量 (优先最近 3-5 只)
- [ ] 3D 定位：根据屏幕位置左右声道平衡
- [ ] 暂停/后台停止声音，恢复继续播放
- [ ] 退出清理音频资源

**音频资源清单**:
| 类型 | 文件名 | 说明 |
|------|--------|------|
| BGM | battle-urgent.mp3 | 激昂战斗音乐 (30 秒循环) |
| 移动 | zombie-step-grass.mp3 | 草地脚步声 |
| 移动 | zombie-step-concrete.mp3 | 水泥地脚步声 |
| 攻击前摇 | zombie-growl.mp3 | 低吼 |
| 命中 | zombie-hit.mp3 | 沉闷撞击 |
| 死亡 | zombie-fall.mp3 | 倒地声 |

**技术建议**:
```typescript
// battle-music.ts
class BattleMusicController {
  playBGM(): void;
  duckForVoice(): void;
  restoreAfterVoice(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

// zombie-sfx.ts
class ZombieSfxController {
  playFootstep(surface: 'grass' | 'concrete', distance: number): void;
  playAttackWarning(): void;
  playHit(distance: number): void;
  playDeath(distance: number): void;
  limitConcurrentSfx(max: number): void;
}
```

**依赖**: #109/#110 (音频触发时机)
**优先级**: P2

---

## 工单 #112: 苹果僵尸改为奔跑型

**用户需求**: 苹果僵尸改为奔跑类型僵尸，双臂挥动需协调

**范围**:
- `miniprogram/fortress/enemy-types.ts` - 苹果僵尸类型定义
- `miniprogram/character-assets/` 或 `miniprogram/enemy-assets/` - 新奔跑姿势素材
- `miniprogram/fortress/canvas-scene.ts` - 渲染逻辑

**验收标准**:
- [ ] 苹果僵尸速度从 20 提升至 28 (参考动物僵尸速度)
- [ ] 攻击间隔保持 2 秒不变
- [ ] 新奔跑姿势素材:
  - 参考 `docs/visual-audit/reference-studies/manifest.json` 中 style-study-01 风格
  - 需要：站立/奔跑/攻击/受伤/死亡 5 种状态
  - 保持苹果主题色和可辨认轮廓
  - 双臂挥动协调，符合奔跑动作
- [ ] 奔跑动画帧率 12fps，循环流畅
- [ ] 碰撞框适配新姿势
- [ ] 其他类型僵尸不受影响

**美术资源需求**:
```
zombie-apple-run-01.png  (奔跑姿势代表图)
zombie-apple-run-02.png  (奔跑姿势修订)
zombie-apple-attack.png  (攻击姿势)
zombie-apple-hit.png     (受伤姿势)
zombie-apple-dead.png    (死亡姿势)
```

**技术建议**:
```typescript
// enemy-types.ts
export const APPLE_ZOMBIE: EnemyDefinition = {
  word: 'apple',
  speed: 28,  // 从 20 提升
  attackIntervalMs: 2000,
  poses: {
    run: 'character-assets/zombie-apple-run.png',
    attack: 'character-assets/zombie-apple-attack.png',
    // ...
  }
};
```

**依赖**: 美术资源确认 (参考 style-study-01)
**优先级**: P1

---

## 工单 #113: 其他僵尸保持原样

**用户需求**: 其他类型的僵尸维持它的图片原样，即若没有改为新图，则不用更改

**范围**: 全局僵尸类型定义

**验收标准**:
- [ ] 除苹果僵尸外，所有其他僵尸类型保持当前速度/攻击间隔/姿势
- [ ] 香蕉/葡萄/橙子等水果僵尸维持现有配置
- [ ] 16 种动物僵尸维持现有配置
- [ ] 铁桶队长 Boss 维持现有配置
- [ ] 代码中明确注释：仅苹果僵尸为奔跑型，其他类型待后续确认
- [ ] 新增僵尸类型默认不启用奔跑属性，需显式配置

**技术建议**:
```typescript
// enemy-types.ts 添加注释
/**
 * 仅苹果僵尸为奔跑型 (速度 28)。
 * 其他类型维持原样，待美术资源确认后再调整。
 * 新增类型默认速度 20，攻击间隔 2000ms。
 */
export const ALL_ENEMY_TYPES: readonly EnemyDefinition[] = [
  APPLE_ZOMBIE,  // 奔跑型
  BANANA_ZOMBIE, // 维持原样
  // ...
];
```

**依赖**: #112 (明确区分范围)
**优先级**: P3

---

## 实施顺序

1. **#109** - 前期播报基础功能 (优先级 P1)
2. **#110** - 后期播报扩展 (优先级 P2，依赖#109)
3. **#112** - 苹果僵尸奔跑型改造 (优先级 P1，需美术资源)
4. **#111** - 战斗音频升级 (优先级 P2，依赖#109/#110)
5. **#113** - 范围限制保护 (优先级 P3，最后实施)

## 资源需求

### 音频资源 (工单#109/#110/#111)
- 93 个水果单词男声发音 (Kokoro v1.0 am_michael 音色)
- 激昂战斗 BGM (30 秒循环，需原创或 CC0 素材)
- 僵尸移动/攻击/死亡音效 (需原创或 CC0 素材)

### 美术资源 (工单#112)
- 苹果僵尸奔跑姿势系列 (参考 style-study-01)
- 代表图审查通过后制作正式部件

## 验证计划

- 单元测试：击杀计数逻辑、音频触发时机、速度/攻击间隔数值
- 集成测试：8 关 19 波完整流程，验证播报频率和音频播放
- 真机验收：音频听感、奔跑动画流畅度、战斗节奏
- 性能测试：多僵尸场景下音频并发限制效果

## 风险记录

- 音频资源制作周期可能影响整体进度
- 奔跑型苹果僵尸可能增加早期通关难度，需试玩验证
- 多音频并发可能影响低端设备性能
