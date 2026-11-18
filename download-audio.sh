#!/bin/bash
# 批量下载 Mixkit 音频资源
# 使用方法：chmod +x download-audio.sh && ./download-audio.sh

set -e

OUTPUT_DIR="miniprogram/assets/audio"
mkdir -p "$OUTPUT_DIR"

echo "开始下载音频资源..."

# 战斗音乐
echo "下载战斗音乐..."
curl -L "https://cdn.mixkit.co/free-stock-music/daredevil.mp3" -o "$OUTPUT_DIR/battle-urgent.mp3" || \
curl -L "https://mixkit.co/free-stock-music/daredevil/" -o "$OUTPUT_DIR/battle-urgent.mp3" || \
echo "⚠️  battle-urgent.mp3 下载失败，请手动下载"

# 僵尸含混声由 scripts/create-zombie-mumbles.py 原创合成，不再下载怪物低吼。

# 脚步类
curl -L "https://mixkit.co/free-sound-effects/rock-golem-walking/" -o "$OUTPUT_DIR/zombie-step-grass.mp3" 2>/dev/null || \
echo "⚠️  zombie-step-grass.mp3 需手动下载"

curl -L "https://mixkit.co/free-sound-effects/giant-monster-footstep/" -o "$OUTPUT_DIR/zombie-step-concrete.mp3" 2>/dev/null || \
echo "⚠️  zombie-step-concrete.mp3 需手动下载"

# 呼吸类
curl -L "https://mixkit.co/free-sound-effects/single-zombie-breath/" -o "$OUTPUT_DIR/zombie-breath.mp3" 2>/dev/null || \
echo "⚠️  zombie-breath.mp3 需手动下载"

curl -L "https://mixkit.co/free-sound-effects/creepy-demon-heavy-breathing/" -o "$OUTPUT_DIR/zombie-breath-heavy.mp3" 2>/dev/null || \
echo "⚠️  zombie-breath-heavy.mp3 需手动下载"

# 命中/死亡
curl -L "https://mixkit.co/free-sound-effects/horror-impact/" -o "$OUTPUT_DIR/zombie-hit.mp3" 2>/dev/null || \
echo "⚠️  zombie-hit.mp3 需手动下载"

curl -L "https://mixkit.co/free-sound-effects/monster-dying-in-pain/" -o "$OUTPUT_DIR/zombie-fall.mp3" 2>/dev/null || \
echo "⚠️  zombie-fall.mp3 需手动下载"

curl -L "https://mixkit.co/free-sound-effects/enemy-death-voice/" -o "$OUTPUT_DIR/zombie-collapse.mp3" 2>/dev/null || \
echo "⚠️  zombie-collapse.mp3 需手动下载"

echo ""
echo "✅ 下载完成！请检查以下文件是否成功下载："
ls -lh "$OUTPUT_DIR"/*.mp3 2>/dev/null || echo "⚠️  部分文件下载失败"

echo ""
echo "📋 手动下载链接清单（复制粘贴到浏览器）："
echo "战斗音乐:"
echo "  https://mixkit.co/free-stock-music/daredevil/"
echo ""
echo "僵尸含混声: python3 scripts/create-zombie-mumbles.py"
echo "  https://mixkit.co/free-sound-effects/rock-golem-walking/"
echo "  https://mixkit.co/free-sound-effects/giant-monster-footstep/"
echo "  https://mixkit.co/free-sound-effects/single-zombie-breath/"
echo "  https://mixkit.co/free-sound-effects/creepy-demon-heavy-breathing/"
echo "  https://mixkit.co/free-sound-effects/horror-impact/"
echo "  https://mixkit.co/free-sound-effects/monster-dying-in-pain/"
echo "  https://mixkit.co/free-sound-effects/enemy-death-voice/"
