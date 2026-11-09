"""Original energetic adventure theme; run with Python 3 and ffmpeg."""
from importlib import import_module

Score = import_module('music-synth').Score
score = Score(136, 16)
# C / G / Am / F: driving eighth-note bass, brass call-and-response, backbeat.
chords = [(48, 64, 67), (43, 59, 62), (45, 60, 64), (41, 57, 60)]
melodies = [
    [(72, 0, .65), (76, .75, .65), (79, 1.5, 1), (76, 3, .7)],
    [(74, 0, .7), (79, 1, .7), (83, 2, .7), (81, 3, .35), (79, 3.5, .35)],
    [(81, 0, 1.3), (79, 1.5, .4), (76, 2, .7), (72, 3, .7)],
    [(77, 0, .7), (76, 1, .4), (74, 1.5, .4), (72, 2, 1.5)],
]
for bar in range(16):
    at = bar*4
    root, third, fifth = chords[bar % 4]
    for pitch in (root+12, third, fifth):
        score.note(pitch, at, 3.9, .045, 'strings')
    for step in range(8):
        score.note(root + (12 if step % 4 == 3 else 0), at+step*.5, .42, .16, 'bass')
        score.drum(at+step*.5, 'hat', .055 if step % 2 else .075)
    for beat in (0, 2, 2.75):
        score.drum(at+beat, 'kick', .29)
    for beat in (1, 3):
        score.drum(at+beat, 'snare', .15)
        for pitch in (root+12, third, fifth):
            score.note(pitch, at+beat, .35, .055, 'brass')
    for pitch, offset, length in melodies[bar % 4]:
        score.note(pitch, at+offset, length, .17, 'brass')
        if bar >= 8:
            score.note(pitch+12, at+offset, length*.7, .045, 'bell')
    if bar % 4 == 3:
        for step in range(3):
            score.drum(at+3.25+step*.25, 'tom', .11)
score.save('home-garden.mp3')
