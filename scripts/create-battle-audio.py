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
# Spooky comic chase: minor seconds, diminished harmony, tiptoeing plucks,
# low reeds and brief upward "wobbles" over a restrained marching beat.
from importlib import import_module
Score = import_module('music-synth').Score
score = Score(116, 16)
roots = [45, 45, 41, 40, 45, 48, 46, 40]
phrases = [
    [(69, 0, .45), (70, .75, .35), (69, 1.5, .45), (63, 2.5, .7)],
    [(64, .5, .4), (65, 1, .35), (64, 1.75, .4), (60, 3, .65)],
    [(65, 0, .4), (68, 1, .4), (71, 2, .4), (68, 3.25, .5)],
    [(64, 0, .6), (65, 1, .35), (62, 2, .45), (59, 3, .7)],
]
for bar in range(16):
    at = bar*4
    root = roots[bar % 8]
    # Low sustained tension, with dissonance used as a quiet accent.
    score.note(root, at, 3.95, .065, 'ghost')
    score.note(root+19, at+.5, 3.4, .028, 'strings')
    for beat in range(4):
        score.note(root+(12 if beat % 2 else 0), at+beat, .65, .19, 'bass')
        score.drum(at+beat, 'kick', .15 if beat % 2 else .22)
        score.drum(at+beat+.5, 'hat', .035)
        for pitch in (root+24, root+27, root+30):
            score.note(pitch, at+beat+.5, .3, .055, 'pluck')
    for beat in (1, 3):
        score.drum(at+beat, 'snare', .07)
    for pitch, offset, length in phrases[bar % 4]:
        score.note(pitch, at+offset, length, .12, 'reed')
        if bar >= 8:
            score.note(pitch+12, at+offset+.125, .45, .045, 'bell')
    if bar % 4 == 1:
        score.note(53, at+3.25, .7, .12, 'reed', slide=7)
    if bar % 4 == 3:
        score.note(82, at+2.5, 1.4, .045, 'ghost', slide=-13)
        score.drum(at+3.5, 'tom', .13)
score.save('battle-loop.mp3')
rng=random.Random(7)
impact=[(.38*rng.uniform(-1,1)+.28*sin(2*pi*(210*t-400*t*t)))*exp(-40*t)*min(1,t/.002) for t in (i/RATE for i in range(round(.14*RATE)))]
save('battle-hit.mp3',impact)
