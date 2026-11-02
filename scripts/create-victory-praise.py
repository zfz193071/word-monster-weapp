"""Generate the one-shot Chinese victory praise with Kokoro v1.1-zh (Apache-2.0).
Usage: python scripts/create-victory-praise.py MODEL.onnx VOICES.bin CONFIG.json
Requires kokoro-onnx, misaki[zh], soundfile and ffmpeg; not shipped in the app.
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

phonemes, _ = zh.ZHG2P(version='1.1')('你真棒！')
model = Kokoro(sys.argv[1], sys.argv[2], vocab_config=sys.argv[3])
samples, rate = model.create(phonemes, voice='zf_001', speed=.95, is_phonemes=True)
target = Path('miniprogram/assets/audio/victory-praise.mp3')
with tempfile.TemporaryDirectory() as folder:
    wav = Path(folder) / 'praise.wav'
    sf.write(str(wav), samples, rate)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-af', 'loudnorm=I=-18:TP=-2:LRA=7', '-ar', '44100', '-ac', '1', '-b:a', '96k', str(target)], check=True)
Path('docs/victory-praise-manifest.json').write_text(json.dumps({
    'text': '你真棒！', 'voice': 'zf_001', 'speed': .95,
    'model': 'Kokoro-82M-v1.1-zh', 'license': 'Apache-2.0',
    'source': 'https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh',
    'runtime': 'kokoro-onnx', 'path': str(target),
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'review': 'pending human listening'
}, ensure_ascii=False, indent=2)+'\n')
print(target)
