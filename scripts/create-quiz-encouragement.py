"""Generate the Chinese quiz encouragement with Kokoro v1.1-zh (Apache-2.0).
Usage: python scripts/create-quiz-encouragement.py MODEL.onnx VOICES.npz CONFIG.json
Requires kokoro-onnx 0.6.1, misaki[zh], soundfile and ffmpeg; not shipped in the app.
Use the hexgrad v1.1-zh config.json vocabulary. Convert the ONNX repository
voices/zf_001.bin with numpy.fromfile(dtype=float32).reshape(-1,1,256), then
numpy.savez("voices.npz", zf_001=voice) before running.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import soundfile as sf
from misaki import zh
from kokoro_onnx import Kokoro

phonemes, _ = zh.ZHG2P(version='1.1')('小朋友下次加油哦！')
model = Kokoro(sys.argv[1], sys.argv[2], vocab_config=sys.argv[3])
samples, rate = model.create(phonemes, voice='zf_001', speed=.95, is_phonemes=True)
target = Path('miniprogram/assets/audio/quiz-encouragement.mp3')
with tempfile.TemporaryDirectory() as folder:
    wav = Path(folder) / 'encouragement.wav'
    sf.write(str(wav), samples, rate)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-af', 'loudnorm=I=-18:TP=-2:LRA=7', '-ar', '44100', '-ac', '1', '-b:a', '96k', str(target)], check=True)
Path('docs/quiz-encouragement-manifest.json').write_text(json.dumps({
    'text': '小朋友下次加油哦！', 'voice': 'zf_001', 'speed': .95,
    'model': 'Kokoro-82M-v1.1-zh', 'license': 'Apache-2.0',
    'source': 'https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh',
    'runtime': 'kokoro-onnx 0.6.1', 'path': str(target),
    'onnxSource': 'https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX',
    'modelFile': 'onnx/model_quantized.onnx',
    'modelSha256': hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest(),
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'review': 'pending human listening'
}, ensure_ascii=False, indent=2)+'\n')
print(target)
