# 主角固定站姿与关节瞄准

2026-11-11：沿用户已批准主角02及七级新武器变体制作，不引用旧粗糙图。原guardian-parts-01左侧身体已接入，右侧整块双臂未采用；直接旋转整块双臂会肩部脱节，现改为身体、上臂袖子和持枪前臂三层。

一至七级已接入。身体双脚保持水平，面向左右时镜像；前臂与装备按原真实出弹点旋转，上臂连接固定肩部和前臂根部。没有改弹道起点、瞄准算法、伤害、射速或碰撞。后坐力与进一步过渡仍待完成。

2026-11-11：四、七级的首次生成请求被服务拒绝，后续以一级关节图集的布局和已批准各级外观为唯一参考重新生成，获得透明 `guardian-joints-04.png` 与 `guardian-joints-07.png`，并纳入运行图集。两图均为候选运行部件，仍待实际尺寸与用户视觉验收；准确请求、原参考、输出哈希和首次失败记录见 [generation-status.json](generation-status.json) 及各 `guardian-joints-NN-prompt.txt`。仅使用内置 image_gen，没有 CLI 替代。

[五套×九方向浅底](runtime/joint-poses-light.png) · [深底](runtime/joint-poses-dark.png) · [七级手机/平板实际场景](runtime/review.html) · [一级首轮自然回放](motion/review.html)。

这些是正式Canvas离屏证据：14张场景、90个浅深底姿态、一级手机/平板30fps DPR2自然首轮。不是微信模拟器、真机性能或用户最终视觉验收，也没有覆盖五个等级全部自然混战。左上照明会随镜像翻转，快速左右切换的观感、肢体更细致遮挡及后坐力仍需完善；低alpha边缘未宣称全部清零。旧Boss画风未整改。

531项全量测试、66项定向回归与npm run check通过。独立矩阵测试覆盖35种等级/宽屏目标组合，核对脚底不动、身体不倾斜、枪口与真实首发及弹道方向一致。身体/前臂解码失败与重试、主角/宠物分包独立缓存均有回归。新guardian-assets源码预算759.8KiB；每局解码身体和当前等级图共约1.98MiB RGBA，不包含Canvas/纹理副本，也不是设备峰值。

重建：设置WM_CANVAS_MODULE指向@napi-rs/canvas，依次运行scripts/prepare-guardian-rig.mts、scripts/render-guardian-joints.mts、scripts/render-guardian-scenes.mts。自然回放通过WM_OPENING_OUTPUT=docs/visual-audit/hero/parts-study/motion运行scripts/render-opening-motion.mts。原始图完整等比重采样至720×360，alpha保留；编码/枪口测量见[rig-manifest.json](rig-manifest.json)。
