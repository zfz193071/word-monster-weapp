"""Small deterministic score renderer for original, sample-free game music.

Python standard library + ffmpeg. Notes and reverb wrap at the loop boundary.
"""
from array import array
from math import exp, pi, sin, tanh
from pathlib import Path
import random
import subprocess
import tempfile
import wave

RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / 'miniprogram/assets/audio'


class Score:
    def __init__(self, bpm, bars):
        self.beat = 60 / bpm
        self.samples = array('d', [0]) * round(bars * 4 * self.beat * RATE)
        self.rng = random.Random(20261108)

    def note(self, midi, at, beats, gain, voice='pluck', slide=0):
        frequency = 440 * 2 ** ((midi - 69) / 12)
        duration = beats * self.beat
        start = round(at * self.beat * RATE)
        phase = 0
        for i in range(round(duration * RATE)):
            t = i / RATE
            phase += 2 * pi * frequency * 2 ** ((slide * t / duration) / 12) / RATE
            release = min(1, max(0, (duration - t) / .045))
            attack = min(1, t / .012)
            if voice == 'brass':
                tone = (sin(phase) + .4*sin(2*phase) + .2*sin(3*phase)) / 1.6
                envelope = attack * release * (.65 + .35*exp(-9*t))
            elif voice == 'strings':
                tone = sin(phase) + .2*sin(phase*1.003) + .12*sin(2*phase)
                envelope = min(1, t/.14) * min(1, (duration-t)/.18) * .65
            elif voice == 'ghost':
                tone = sin(phase + .025*sin(2*pi*5*t)) + .16*sin(2*phase)
                envelope = min(1, t/.1) * min(1, (duration-t)/.12)
            elif voice == 'reed':
                tone = sin(phase) + .4*sin(3*phase) + .12*sin(5*phase)
                envelope = attack * release * exp(-3*t/duration)
            elif voice == 'bell':
                tone = sin(phase) + .32*sin(phase*2.76)*exp(-7*t)
                envelope = attack * release * exp(-5*t/duration)
            elif voice == 'bass':
                tone = sin(phase) + .25*sin(2*phase)
                envelope = attack * release * exp(-1.5*t/duration)
            else:
                tone = sin(phase) + .32*sin(2*phase) + .13*sin(3*phase)
                envelope = attack * release * exp(-5*t/duration)
            self.samples[(start+i) % len(self.samples)] += gain * tone * envelope

    def drum(self, at, kind, gain):
        duration = {'kick': .22, 'snare': .15, 'hat': .055, 'tom': .19}[kind]
        start = round(at*self.beat*RATE)
        previous = 0
        for i in range(round(duration*RATE)):
            t = i/RATE
            noise = self.rng.uniform(-1, 1)
            if kind == 'kick':
                tone = sin(2*pi*(52*t + 2.5*(1-exp(-35*t)))) * exp(-22*t)
            elif kind == 'snare':
                tone = (.7*noise + .3*sin(2*pi*180*t))*exp(-30*t)
            elif kind == 'tom':
                tone = sin(2*pi*(95*t + 2*(1-exp(-22*t))))*exp(-23*t)
            else:
                tone = (noise-previous)*.5*exp(-65*t)
            previous = noise
            self.samples[(start+i) % len(self.samples)] += gain*tone*min(1,t/.002)

    def save(self, name):
        dry = array('d', self.samples)
        for seconds, gain in [(.105, .09), (.21, .045)]:
            offset = round(seconds*RATE)
            for i, value in enumerate(dry):
                self.samples[(i+offset) % len(dry)] += value*gain
        # Soft saturation controls drum peaks; keep headroom for speech/effects.
        shaped = array('d', (tanh(value*1.25) for value in self.samples))
        peak = max(map(abs, shaped)) or 1
        pcm = array('h', (round(value/peak*.74*32767) for value in shaped))
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp)/'loop.wav'
            with wave.open(str(source), 'wb') as out:
                out.setnchannels(1)
                out.setsampwidth(2)
                out.setframerate(RATE)
                out.writeframes(pcm.tobytes())
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                            '-i', str(source), '-codec:a', 'libmp3lame', '-b:a', '64k',
                            str(ROOT/name)], check=True)
        print(f'{name}: {len(pcm)/RATE:.2f}s, {(ROOT/name).stat().st_size} bytes')
