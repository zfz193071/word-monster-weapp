"""Original two-note coin chime. No external recordings or samples."""
from array import array
from math import sin, pi, exp
from pathlib import Path
import subprocess, tempfile, wave

rate = 22050
values = []
for i in range(round(.32 * rate)):
    t = i / rate
    value = 0
    for start, frequency in [(0, 1174.66), (.09, 1567.98)]:
        age = t - start
        if age >= 0:
            value += .22 * min(1, age / .004) * exp(-22 * age) * (sin(2*pi*frequency*age) + .25*sin(2*pi*frequency*2*age))
    values.append(round(value * 32767))
with tempfile.TemporaryDirectory() as folder:
    source = Path(folder) / 'coin.wav'
    with wave.open(str(source), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(rate)
        output.writeframes(array('h', values).tobytes())
    target = Path(__file__).resolve().parents[1] / 'miniprogram/assets/audio/coin-collect.mp3'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source), '-codec:a', 'libmp3lame', '-b:a', '64k', str(target)], check=True)
