"""Generate original speech-like cartoon zombie mumbles; no external samples.

The voices use a small formant synthesizer so they sound like broken syllables
instead of an animal growl. Outputs are deterministic and can be rebuilt with
Python's standard library plus ffmpeg.
"""

from array import array
from math import exp, pi, sin
from pathlib import Path
import random
import subprocess
import tempfile
import wave


RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / "miniprogram/assets/audio"

# start, end, starting pitch, ending pitch, vowel formants
VOICES = {
    "zombie-mumble-1.mp3": (
        1.55,
        ((0.08, 0.72, 132, 112, (560, 1180, 2480)),
         (0.88, 1.45, 158, 126, (700, 1680, 2520))),
    ),
    "zombie-mumble-2.mp3": (
        1.82,
        ((0.06, 0.78, 148, 124, (680, 1080, 2420)),
         (0.98, 1.72, 162, 132, (470, 1260, 2500))),
    ),
    "zombie-mumble-3.mp3": (
        1.38,
        ((0.07, 0.58, 164, 142, (500, 1480, 2460)),
         (0.70, 1.28, 178, 152, (720, 1810, 2620))),
    ),
}


def syllable_sample(local, length, start_pitch, end_pitch, formants, rng):
    progress = max(0.0, min(1.0, local / length))
    attack = min(1.0, local / 0.045)
    release = min(1.0, (length - local) / 0.12)
    envelope = attack * release * (0.90 + 0.10 * sin(2 * pi * 3.7 * local))
    pitch = start_pitch + (end_pitch - start_pitch) * progress
    pitch *= 1 + 0.018 * sin(2 * pi * 5.2 * local) + 0.007 * sin(2 * pi * 11.3 * local)
    phase = 2 * pi * pitch * local
    voiced = 0.0
    for harmonic in range(1, 25):
        frequency = harmonic * pitch
        resonance = sum(exp(-((frequency - formant) / (95 + index * 65)) ** 2)
                        for index, formant in enumerate(formants))
        nasal = 0.65 * exp(-((frequency - 930) / 180) ** 2)
        voiced += (0.14 + resonance + nasal) * sin(harmonic * phase) / harmonic
    # A restrained aspirated edge gives the syllable a dry undead texture without
    # turning it into a bass-heavy monster roar.
    breath = rng.uniform(-1, 1) * (0.035 + 0.035 * sin(pi * progress) ** 2)
    return envelope * (0.31 * voiced + breath)


def synthesize(duration, syllables, seed):
    rng = random.Random(seed)
    samples = []
    for index in range(round(duration * RATE)):
        t = index / RATE
        value = 0.0
        for start, end, pitch_start, pitch_end, formants in syllables:
            if start <= t <= end:
                value += syllable_sample(t - start, end - start, pitch_start, pitch_end, formants, rng)
        # Very short room reflection keeps the voice present but not cavernous.
        if index >= round(0.055 * RATE):
            value += samples[index - round(0.055 * RATE)] * 0.12
        samples.append(value)
    peak = max(abs(value) for value in samples) or 1
    return array("h", (round(value / peak * 0.82 * 32767) for value in samples))


def write_mp3(name, duration, syllables, seed):
    pcm = synthesize(duration, syllables, seed)
    with tempfile.TemporaryDirectory() as temp:
        wav_path = Path(temp) / "voice.wav"
        with wave.open(str(wav_path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(pcm.tobytes())
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
            "-af", "highpass=f=105,lowpass=f=5000,acompressor=threshold=-18dB:ratio=2.2:attack=8:release=90,alimiter=limit=0.82",
            "-codec:a", "libmp3lame", "-b:a", "64k", str(ROOT / name),
        ], check=True)
    print(name, f"{duration:.2f}s", (ROOT / name).stat().st_size)


for voice_index, (filename, (voice_duration, voice_syllables)) in enumerate(VOICES.items(), start=1):
    write_mp3(filename, voice_duration, voice_syllables, 7100 + voice_index)
