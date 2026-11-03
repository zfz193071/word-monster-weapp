"""Generate clear male defeat speech for all 93 words (#40).

Usage: python scripts/create-zombie-voices.py MODEL.onnx VOICES.bin [CACHE_DIR]
Requires kokoro-onnx, soundfile, ffmpeg. Models stay outside the app.
Download links: https://github.com/thewh1teagle/kokoro-onnx#setup
The historical zombie- filenames are retained to avoid duplicate package assets.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import shutil
import tempfile
from contextlib import nullcontext
from concurrent.futures import ThreadPoolExecutor
import soundfile as sf
import onnxruntime as ort
from kokoro_onnx import Kokoro

fruit = ['apple', 'banana', 'orange', 'grape', 'watermelon', 'pear', 'strawberry', 'cherry', 'pineapple', 'kiwi', 'peach']
categories = json.loads(Path('docs/level-word-source.json').read_text())
other = sorted({w['id'] for c in categories for w in c['words']})
source = 'https://huggingface.co/hexgrad/Kokoro-82M'
rights = 'Kokoro v1.0 synthetic US English male am_michael; model Apache-2.0; normalized; runtime playback 0.8; docs/defeat-voice-manifest.json'
session_options = ort.SessionOptions()
session_options.intra_op_num_threads = 1
session_options.inter_op_num_threads = 1
model = Kokoro.from_session(ort.InferenceSession(sys.argv[1], sess_options=session_options, providers=['CPUExecutionProvider']), sys.argv[2])
model_hash = hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest()
voices_hash = hashlib.sha256(Path(sys.argv[2]).read_bytes()).hexdigest()
cache_key = dict(model=model_hash, voices=voices_hash, voice='am_michael', speed=1, filters='highpass=f=60,loudnorm=I=-18:TP=-2:LRA=7', fruitBitrate='96k', otherBitrate='48k')
with (nullcontext(sys.argv[3]) if len(sys.argv) > 3 else tempfile.TemporaryDirectory()) as folder:
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    metadata = folder / 'cache.json'
    if metadata.exists():
        if json.loads(metadata.read_text()) != cache_key:
            raise ValueError('Cache belongs to a different model/voice/processing setup')
    elif any(folder.glob('zombie-*.mp3')):
        raise ValueError('Existing cache audio has no provenance')
    metadata.write_text(json.dumps(cache_key))

    def generate(word):
        path = f'/{"assets" if word in fruit else "learning-assets"}/audio/zombie-{word}.mp3'
        target = folder / f'zombie-{word}.mp3'
        if not target.exists():
            samples, rate = model.create(word.capitalize() + '.', voice='am_michael', speed=1, lang='en-us')
            wav = folder / f'{word}.wav'
            sf.write(str(wav), samples, rate)
            temporary = folder / f'zombie-{word}.partial.mp3'
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-af', cache_key['filters'],
                            '-ar', '44100', '-ac', '1', '-b:a', '96k' if word in fruit else '48k', str(temporary)], check=True)
            temporary.replace(target)
        print(word, flush=True)
        return dict(wordId=word, path=path, kind='audio', sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                    source=source, rights=rights, reviewStatus='pending')

    # ONNX inference is thread-safe; kokoro-onnx serializes its espeak phonemizer.
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(generate, fruit + other))
    # Publish only after synthesis succeeds, avoiding a compile for every generated word.
    for record in records:
        shutil.copyfile(folder / Path(record['path']).name, Path('miniprogram' + record['path']))
Path('docs/defeat-voice-manifest.json').write_text(json.dumps(dict(
    model='Kokoro-82M v1.0', modelSource=source, modelLicense='Apache-2.0', voice='am_michael', gender='male',
    voicesSource=source + '/blob/main/VOICES.md', exportSource='https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX',
    modelSha256=model_hash,
    voicesSha256=voices_hash,
    synthesisSpeed=1, playbackRate=.8, review='pending human listening', files=records
), ensure_ascii=False, indent=2) + '\n')
# Preserve female listening records; refresh the combat assets in the existing manifest.
manifest = Path('docs/level-voice-manifest.json')
learning = [r for r in json.loads(manifest.read_text()) if '/zombie-' not in r['path']]
manifest.write_text(json.dumps(learning + [r for r in records if r['wordId'] in other], ensure_ascii=False, indent=2) + '\n')
subprocess.run(['node', 'scripts/sync-level-manifest.cjs'], check=True)
