"""Original ambient loop, synthesized from a short pentatonic score. No samples.
Run: python3 scripts/create-home-music.py
Requires ffmpeg. Only replaces the project's generated home-garden.mp3 asset.
"""
from array import array
from math import exp, pi, sin
from pathlib import Path
import subprocess
import tempfile
import wave

RATE = 22050
BEAT = 60 / 88
DURATION = 32 * BEAT
COUNT = round(DURATION * RATE)
samples = array('d', [0]) * COUNT

def note(midi, beat, beats, gain, kind='bell'):
    frequency = 440 * 2 ** ((midi - 69) / 12)
    length = beats * BEAT
    start = round(beat * BEAT * RATE)
    for i in range(round(length * RATE)):
        t = i / RATE
        attack = min(1, t / .015)
        release = min(1, max(0, (length - t) / .15))
        if kind == 'bell':
            tone = sin(2*pi*frequency*t) + .22*sin(2*pi*frequency*2*t)*exp(-4*t) + .08*sin(2*pi*frequency*3*t)*exp(-6*t)
            envelope = attack * release * exp(-2.7*t)
        else:
            tone = sin(2*pi*frequency*t) + .12*sin(2*pi*frequency*2*t)
            envelope = min(1, t/.16) * min(1, max(0, (length-t)/.3)) * .7
        samples[(start+i) % COUNT] += gain * envelope * tone

# C / Am / F / G, with spacious soft mallet notes and a quiet sustained root.
chords = [(48,60,64,67),(45,57,60,64),(41,53,57,60),(43,55,59,62)]
melody = [[72,76,79,76],[72,69,76,72],[69,72,77,76],[74,79,76,72]]
for bar, chord in enumerate(chords):
    base = bar * 8
    note(chord[0],base,7.8,.055,'pad')
    for j, beat in enumerate([0,1.5,3,4.5,6]):
        note(chord[1+j%3],base+beat,1.8,.12)
    for pitch, beat in zip(melody[bar],[.5,2.5,4,6.5]):
        note(pitch,base+beat,2,.095)
# Tiny cyclic room echo, wrapped to preserve the loop's tail at its beginning.
original = array('d', samples)
for delay, gain in [(.17,.12),(.31,.07)]:
    offset=round(delay*RATE)
    for i,value in enumerate(original): samples[(i+offset)%COUNT]+=value*gain
peak=max(abs(value) for value in samples)
pcm=array('h',(round(value / max(1,peak/.6) * 32767) for value in samples))
output=Path(__file__).resolve().parents[1]/'miniprogram/assets/audio/home-garden.mp3'
with tempfile.TemporaryDirectory() as directory:
    source=Path(directory)/'home.wav'
    with wave.open(str(source),'wb') as target:
        target.setnchannels(1); target.setsampwidth(2); target.setframerate(RATE); target.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-codec:a','libmp3lame','-b:a','64k',str(output)],check=True)
print(f'{output.name}: {DURATION:.2f}s, {output.stat().st_size} bytes, peak {peak:.3f}')
