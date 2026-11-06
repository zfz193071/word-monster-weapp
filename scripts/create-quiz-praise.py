"""Generate the bilingual correct-answer praise with Kokoro v1.1-zh.

Usage: python scripts/create-quiz-praise.py MODEL.onnx VOICES.npz VOCAB.json
Requires kokoro-onnx, misaki[zh], soundfile and ffmpeg outside the app.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import zh


TEXT = '你真棒！Great job!'
# ZHG2P drops English without an English backend. Preserve the short English
# phrase as IPA so both languages are present in the same female voice clip.
chinese, _ = zh.ZHG2P(version='1.1')('你真棒！')
phonemes = f'{chinese} ɡɹˈeɪt dʒˈɑb!'
model = Kokoro(sys.argv[1], sys.argv[2], vocab_config=sys.argv[3])
samples, rate = model.create(phonemes, voice='zf_001', speed=.95, is_phonemes=True)
target = Path('miniprogram/assets/audio/quiz-praise-bilingual.mp3')
with tempfile.TemporaryDirectory() as folder:
    wav = Path(folder) / 'quiz-praise.wav'
    sf.write(str(wav), samples, rate)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-af', 'loudnorm=I=-16:TP=-2:LRA=7', '-ar', '44100', '-ac', '1', '-b:a', '96k', str(target)], check=True)
Path('docs/quiz-praise-bilingual-manifest.json').write_text(json.dumps({
    'text': TEXT, 'phonemes': phonemes, 'voice': 'zf_001', 'speed': .95,
    'model': 'Kokoro-82M-v1.1-zh', 'license': 'Apache-2.0',
    'source': 'https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh',
    'runtime': 'kokoro-onnx 0.6.1', 'path': str(target),
    'onnxSource': 'https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX',
    'modelSha256': hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest(),
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'review': 'pending human listening',
}, ensure_ascii=False, indent=2) + '\n')
print(target)
