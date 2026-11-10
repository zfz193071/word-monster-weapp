# style-study-01 新角色代表图

2026-11-10 用户明确“以 style-study-01 为准，先制作代表图供审查”。本批新增蓝狐宠物和主角各两版，均使用内置 image_gen；首版仅引用已批准风格板，第二版编辑对应新图，没有使用旧程序角色。兔子复用此前按同一风格制作的毛绒战斗样张，不重复生成。

[审样页](review.html)提供浅深背景、48/96/160px宽度对照；[清单](manifest.json)保存原图/参考图SHA256、尺寸、字节、alpha及边距。生成图为项目AI素材，不作独占版权保证。准确提示词分别保存于pets/及hero/reference-studies/。

主角第二版已移除原图枪口火光，保留钢蓝头盔/红围巾/皮革背包与双手持枪。蓝狐保留四足、蓝白毛绒、白色闪电标记与单尾。Chrome后台检查25个图引用全部解码、页面无横向溢出，并目视核对浅深底；截图为browser-qa.png。生成工具预览中的大面积背景辉光不能直接视为PNG实际残留：采样外围alpha为0，浏览器按alpha合成后未见预览中的大片背景。未做像素修改或抠图。

仍未完成：各版alpha>8主体边距未全部达到提示词12%要求（兔子旧提示词为10%，本页统一以12%比较）；低alpha边缘和实际游戏尺寸仍需后续复核。当前48px宽度包含整张画布的留白，不等于主体48px，也不是已批准运行尺寸。主角枪口坐标、动作部件、首页正面、七级变体，宠物背面/成长和自然动作均未完成。代表图造型正提交用户审查；没有替换运行图或据此标记整场/设备验收通过。

重建（只读图片，输出HTML与JSON）：

```sh
WM_CANVAS_MODULE=/tmp/wm-render-tools/node_modules/@napi-rs/canvas node --import tsx scripts/review-reference-art.mts
```

马展示图沿用prompts.json#horse与新兔子展示参考重试，仍返回moderation_blocked/output/other，request ID 7a28a254-6eb0-4e99-b424-0a5a49610d20，无图片输出，未切换CLI/API。马继续保持缺项。
