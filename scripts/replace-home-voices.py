"""Regenerate the two in-game `home` pronunciations with explicit US English voices.

This is a one-word corrective export. It uses macOS `say` because the prior
Piper/Kokoro exports for this word were unclear; it is not part of the app's
runtime or build pipeline.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = (
    ('Samantha', 155, ROOT / 'miniprogram/learning-assets/audio/learn-home.mp3', 'female listening voice'),
    ('Ralph', 145, ROOT / 'miniprogram/learning-assets/audio/zombie-home.mp3', 'male defeat narration voice'),
)
SOURCE = 'macOS built-in US English speech synthesis; corrective /hoʊm/ export'
RIGHTS = 'System speech synthesis output; regenerated solely for the in-game pronunciation correction; pending human listening review'


def update_record(records: list[dict], path: str, voice: str) -> None:
    record = next(item for item in records if item['path'] == path)
    target = ROOT / 'miniprogram' / path.removeprefix('/')
    record.update(sha256=hashlib.sha256(target.read_bytes()).hexdigest(), source=f'{SOURCE} ({voice})', rights=RIGHTS, reviewStatus='pending')


with tempfile.TemporaryDirectory() as directory:
    temporary = Path(directory)
    for voice, rate, target, _ in OUTPUTS:
        aiff = temporary / f'{target.stem}.aiff'
        subprocess.run(['say', '-v', voice, '-r', str(rate), '-o', str(aiff), 'home'], check=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(aiff), '-af', 'highpass=f=60,loudnorm=I=-18:TP=-2:LRA=7', '-ar', '44100', '-ac', '1', '-b:a', '48k', str(target)], check=True)

level_manifest = ROOT / 'docs/level-voice-manifest.json'
level_records = json.loads(level_manifest.read_text())
update_record(level_records, '/learning-assets/audio/learn-home.mp3', 'Samantha')
update_record(level_records, '/learning-assets/audio/zombie-home.mp3', 'Ralph')
level_manifest.write_text(json.dumps(level_records, ensure_ascii=False, indent=2) + '\n')

defeat_manifest = ROOT / 'docs/defeat-voice-manifest.json'
defeat = json.loads(defeat_manifest.read_text())
update_record(defeat['files'], '/learning-assets/audio/zombie-home.mp3', 'Ralph')
defeat['review'] = 'pending human listening; home regenerated with a corrective /hoʊm/ export'
defeat_manifest.write_text(json.dumps(defeat, ensure_ascii=False, indent=2) + '\n')

subprocess.run(['node', 'scripts/sync-level-manifest.cjs'], cwd=ROOT, check=True)
for _, _, target, label in OUTPUTS:
    print(f'{label}: {target.relative_to(ROOT)} {hashlib.sha256(target.read_bytes()).hexdigest()}')
