"""Generate category voices with the same attributed LJSpeech model as fruit learning.
Usage: piper Python environment, this script, en_US-ljspeech-medium.onnx.
"""
import hashlib,json,subprocess,sys,tempfile,wave
from pathlib import Path
from piper import PiperVoice,SynthesisConfig
categories=json.loads(Path('docs/level-word-source.json').read_text())
words=sorted({w['id'] for c in categories for w in c['words']})
root=Path('miniprogram/learning-assets/audio');root.mkdir(parents=True,exist_ok=True)
voice=PiperVoice.load(sys.argv[1]);records=[]
filters='asetrate=33075,aresample=44100,atempo=1.14,highpass=f=85,lowpass=f=5200,tremolo=f=32:d=0.22,asoftclip=type=tanh:threshold=0.65:output=0.9,aecho=0.8:0.85:38:0.10,loudnorm=I=-19:TP=-2:LRA=7'
with tempfile.TemporaryDirectory() as d:
 for word in words:
  wav=Path(d)/f'{word}.wav'
  with wave.open(str(wav),'wb') as out: voice.synthesize_wav(word.capitalize()+'.',out,syn_config=SynthesisConfig(length_scale=1.05,noise_scale=.5,noise_w_scale=.6))
  for prefix,af in [('learn-','highpass=f=60,loudnorm=I=-18:TP=-2:LRA=7'),('zombie-',filters)]:
   dest=root/f'{prefix}{word}.mp3'
   subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(wav),'-af',af,'-ar','44100','-ac','1','-b:a','48k',str(dest)],check=True)
   records.append(dict(wordId=word,path='/learning-assets/audio/'+dest.name,kind='audio',sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source='https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium',rights='Piper LJSpeech synthetic US female; model MIT; LJSpeech recordings public domain; '+('lowered pitch/tremolo/echo' if prefix=='zombie-' else 'normalized'),reviewStatus='pending'))
  print(word,flush=True)
Path('docs/level-voice-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
