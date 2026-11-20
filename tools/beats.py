#!/usr/bin/env python3
"""beats.py music.wav -> beats.json   |   beats.py --bpm 120 --dur 20 -> beats.json"""
import argparse, json
ap = argparse.ArgumentParser()
ap.add_argument("audio", nargs="?")
ap.add_argument("--bpm", type=float)
ap.add_argument("--dur", type=float, default=20)
ap.add_argument("--offset", type=float, default=0.0)
ap.add_argument("--out", default="beats.json")
a = ap.parse_args()
if a.audio:
    import librosa, numpy as np
    y, sr = librosa.load(a.audio, sr=None, mono=True)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr)
    beats = librosa.frames_to_time(frames, sr=sr).tolist()
    env = librosa.onset.onset_strength(y=y, sr=sr)
    pk = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
    hits = librosa.frames_to_time(pk, sr=sr).tolist()
    bpm = float(np.atleast_1d(tempo)[0])
else:
    bpm = a.bpm; sp = 60 / bpm
    beats = [round(a.offset + i * sp, 4) for i in range(int(a.dur / sp) + 1)]
    hits = beats
json.dump({"bpm": round(bpm, 2), "beats": [round(b, 4) for b in beats],
           "downbeats": [round(b, 4) for b in beats[::4]], "hits": [round(h, 4) for h in hits]},
          open(a.out, "w"), indent=1)
print(f"{a.out}: {bpm:.1f} bpm, {len(beats)} beats")
