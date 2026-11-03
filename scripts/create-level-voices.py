"""Generate female category listening voices. Combat voices use create-zombie-voices.py.
Usage: piper Python environment, this script, en_US-ljspeech-medium.onnx.
"""
import hashlib,json,subprocess,sys,tempfile,wave
from pathlib import Path
from piper import PiperVoice,SynthesisConfig
categories=json.loads(Path('docs/level-word-source.json').read_text())
words=sorted({w['id'] for c in categories for w in c['words']})
root=Path('miniprogram/learning-assets/audio');root.mkdir(parents=True,exist_ok=True)
voice=PiperVoice.load(sys.argv[1]);records=[r for r in json.loads(Path('docs/level-voice-manifest.json').read_text()) if '/zombie-' in r['path']]
with tempfile.TemporaryDirectory() as d:
 for word in words:
  wav=Path(d)/f'{word}.wav'
  with wave.open(str(wav),'wb') as out: voice.synthesize_wav(word.capitalize()+'.',out,syn_config=SynthesisConfig(length_scale=1.05,noise_scale=.5,noise_w_scale=.6))
  for prefix,af in [('learn-','highpass=f=60,loudnorm=I=-18:TP=-2:LRA=7')]:
   dest=root/f'{prefix}{word}.mp3'
   subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(wav),'-af',af,'-ar','44100','-ac','1','-b:a','48k',str(dest)],check=True)
   records.append(dict(wordId=word,path='/learning-assets/audio/'+dest.name,kind='audio',sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),source='https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium',rights='Piper LJSpeech synthetic US female; model MIT; LJSpeech recordings public domain; '+'normalized',reviewStatus='pending'))
  print(word,flush=True)
Path('docs/level-voice-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
