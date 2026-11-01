"""Generate original battle loop and a soft arcade impact; no external samples."""
from array import array
from math import sin, pi, exp
from pathlib import Path
import random, subprocess, tempfile, wave
RATE=22050
ROOT=Path(__file__).resolve().parents[1]/'miniprogram/assets/audio'
def save(name, values):
    peak=max(abs(x) for x in values) or 1
    pcm=array('h',(round(x/max(1,peak/.75)*32767) for x in values))
    with tempfile.TemporaryDirectory() as temp:
        wav=Path(temp)/'audio.wav'
        with wave.open(str(wav),'wb') as out:
            out.setnchannels(1);out.setsampwidth(2);out.setframerate(RATE);out.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-codec:a','libmp3lame','-b:a','64k',str(ROOT/name)],check=True)
    print(name, len(values)/RATE, (ROOT/name).stat().st_size)
beat=60/108
samples=array('d',[0])*round(32*beat*RATE)
def tone(midi,start,length,gain):
    freq=440*2**((midi-69)/12)
    for i in range(round(length*RATE)):
        t=i/RATE;env=min(1,t/.008)*exp(-4*t/length)*min(1,(length-t)/.03)
        samples[(round(start*RATE)+i)%len(samples)]+=gain*env*(sin(2*pi*freq*t)+.18*sin(4*pi*freq*t))
for bar,root in enumerate([45,41,48,43]):
    for step in range(16):
        at=(bar*8+step*.5)*beat
        tone(root+(12 if step%4==2 else 0),at,.35,.16)
        if step%2==0:tone(root+24+[0,3,7,10][step//2%4],at,.22,.085)
    for kick in range(8):
        start=round((bar*8+kick)*beat*RATE)
        for i in range(round(.12*RATE)):
            t=i/RATE;samples[(start+i)%len(samples)]+=.17*sin(2*pi*(65*t+4*(1-exp(-30*t))))*exp(-32*t)
save('battle-loop.mp3',samples)
rng=random.Random(7)
impact=[(.38*rng.uniform(-1,1)+.28*sin(2*pi*(210*t-400*t*t)))*exp(-40*t)*min(1,t/.002) for t in (i/RATE for i in range(round(.14*RATE)))]
save('battle-hit.mp3',impact)
