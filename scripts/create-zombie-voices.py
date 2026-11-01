"""Derive cartoon zombie pronunciation from the attributed fruit recordings.
Original words remain untouched. Derivatives retain each source recording license.
"""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]/'miniprogram/assets/audio'
# Lower pitch ~5 semitones, only modestly slow articulation; add restrained
# throat tremolo, saturation, and a short room tail while keeping consonants.
filters='asetrate=33075,aresample=44100,atempo=1.14,highpass=f=85,lowpass=f=5200,tremolo=f=32:d=0.22,asoftclip=type=tanh:threshold=0.65:output=0.9,aecho=0.8:0.85:38:0.10,loudnorm=I=-19:TP=-2:LRA=7'
for word in ['apple','banana','orange','grape','watermelon','pear','strawberry','cherry','pineapple','kiwi','peach']:
    out=root/f'zombie-{word}.mp3'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(root/f'{word}.mp3'),'-af',filters,'-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','96k',str(out)],check=True)
    print(out.name, out.stat().st_size)
