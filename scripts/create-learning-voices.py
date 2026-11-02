"""Generate learning-only female speech; keep combat voices unchanged.
Requires piper-tts, ffmpeg and the en_US-ljspeech-medium model passed as argv[1].
Model: rhasspy/piper-voices (MIT); LJSpeech training recordings: public domain.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import wave
from piper import PiperVoice, SynthesisConfig

words = ['apple', 'banana', 'orange', 'grape', 'watermelon', 'pear', 'strawberry', 'cherry', 'pineapple', 'kiwi', 'peach']
voice = PiperVoice.load(sys.argv[1])
records = []
with tempfile.TemporaryDirectory() as directory:
    for word in words:
        wav = Path(directory) / f'{word}.wav'
        with wave.open(str(wav), 'wb') as output:
            voice.synthesize_wav(word.capitalize() + '.', output, syn_config=SynthesisConfig(length_scale=1.05, noise_scale=.5, noise_w_scale=.6))
        target = Path(f'miniprogram/assets/audio/learn-{word}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-af', 'highpass=f=60,loudnorm=I=-18:TP=-2:LRA=7', '-ar', '44100', '-ac', '1', '-b:a', '96k', str(target)], check=True)
        records.append({'word': word, 'path': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        print(word, flush=True)
Path('docs/learning-voice-manifest.json').write_text(json.dumps({'model': 'en_US-ljspeech-medium', 'modelSource': 'https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium', 'modelLicense': 'MIT', 'dataset': 'https://keithito.com/LJ-Speech-Dataset/', 'datasetLicense': 'public domain', 'voice': 'US English female, synthetic', 'lengthScale': 1.05, 'defaultPlaybackRate': .8, 'review': 'pending human listening', 'files': records}, ensure_ascii=False, indent=2)+'\n')
