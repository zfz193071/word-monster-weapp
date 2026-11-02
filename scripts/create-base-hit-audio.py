"""Original short wooden/stone impact, synthesized without external samples."""
from array import array
from math import sin, pi, exp
from pathlib import Path
import random, subprocess, tempfile, wave
rate = 22050
rng = random.Random(42)
values = []
for i in range(round(.24 * rate)):
    t = i / rate
    value = min(1, t / .002) * (.48*sin(2*pi*110*t)*exp(-22*t) + .24*sin(2*pi*267*t)*exp(-35*t) + .24*rng.uniform(-1,1)*exp(-50*t))
    values.append(round(value * 32767))
with tempfile.TemporaryDirectory() as folder:
    source = Path(folder)/'hit.wav'
    with wave.open(str(source),'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(rate); out.writeframes(array('h',values).tobytes())
    target = Path(__file__).resolve().parents[1]/'miniprogram/assets/audio/base-hit.mp3'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-codec:a','libmp3lame','-b:a','64k',str(target)],check=True)
