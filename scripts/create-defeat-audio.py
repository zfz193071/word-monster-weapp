"""Original quiet descending minor-key defeat cue; no third-party samples."""
from array import array
from math import sin, pi, exp
from pathlib import Path
import hashlib, json, subprocess, tempfile, wave
root = Path(__file__).resolve().parents[1]
rate = 24000
values = []
for i in range(int(2.6 * rate)):
    t = i / rate
    value = 0
    for start, frequency in [(0, 392), (.42, 311.13), (.84, 261.63), (1.26, 196)]:
        age = t - start
        if age >= 0:
            value += .18 * min(1, age / .025) * exp(-3.4 * age) * (sin(2*pi*frequency*age) + .12*sin(4*pi*frequency*age))
    value *= min(1, (2.6-t)/.15)
    values.append(round(value * 32767))
with tempfile.TemporaryDirectory() as folder:
    source = Path(folder) / 'sad.wav'
    with wave.open(str(source), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(rate)
        output.writeframes(array('h', values).tobytes())
    target = root / 'miniprogram/assets/audio/defeat-sad.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-b:a', '48k', str(target)], check=True)
    (root / 'docs/defeat-sound-manifest.json').write_text(json.dumps({
        'source': 'scripts/create-defeat-audio.py', 'rights': '本项目原创合成，无第三方采样',
        'path': str(target.relative_to(root)), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'review': 'pending human listening', 'description': '2.6秒轻柔小调下行音效，失败时播放一次'
    }, ensure_ascii=False, indent=2)+'\n')
