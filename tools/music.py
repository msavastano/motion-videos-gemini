#!/usr/bin/env python3
"""Synthesize a seeded minimal-electronic bed on a fixed BPM grid.
python tools/music.py --bpm 120 --dur 22 --key 57 --out music.wav [--drop 16.0] [--end 20.0]"""
import argparse, numpy as np, soundfile as sf
ap = argparse.ArgumentParser()
ap.add_argument("--bpm", type=float, default=120); ap.add_argument("--dur", type=float, default=22)
ap.add_argument("--key", type=int, default=57, help="MIDI root (57=A3)")
ap.add_argument("--drop", type=float, default=None, help="time the full beat kicks in")
ap.add_argument("--end", type=float, default=None, help="time of final hit; beat stops after")
ap.add_argument("--offset", type=float, default=0.0, help="shift the grid so a downbeat lands here mod one bar")
ap.add_argument("--seed", type=int, default=7); ap.add_argument("--out", default="music.wav")
a = ap.parse_args()
SR = 48000; N = int(a.dur * SR); rng = np.random.default_rng(a.seed)
L = np.zeros(N); R = np.zeros(N); beat = 60 / a.bpm
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
def put(sig, t, pan=0.0, g=1.0):
    i = int(t * SR); n = min(len(sig), N - i)
    if n <= 0 or i < 0: return
    L[i:i+n] += sig[:n] * g * (1 - pan); R[i:i+n] += sig[:n] * g * (1 + pan)
def kick():
    t = np.arange(int(.35*SR))/SR; f = 45 + 90*np.exp(-t*30)
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*9)
def hat(open_=False):
    t = np.arange(int((.18 if open_ else .05)*SR))/SR; n = rng.standard_normal(len(t))
    n = np.diff(n, prepend=0); return n*np.exp(-t*(18 if open_ else 80))*0.18
def clap():
    t = np.arange(int(.25*SR))/SR; n = rng.standard_normal(len(t))
    env = np.exp(-t*25) + 0.6*np.exp(-np.maximum(t-.012,0)*40)*(t>.012)
    return np.convolve(n, [1,-1], 'same')*env*0.25
def pluck(m, length=.4):
    t = np.arange(int(length*SR))/SR; f = hz(m)
    s = sum(np.sin(2*np.pi*f*k*t + k)/k**1.4 for k in range(1,6))
    return s*np.exp(-t*7)*0.12
def pad(ms, length):
    t = np.arange(int(length*SR))/SR; s = np.zeros_like(t)
    for m in ms:
        for det in (-0.08, 0.0, 0.08):
            s += np.sin(2*np.pi*hz(m+det)*t + rng.uniform(0, 6))
    env = np.minimum(1, t/0.6) * np.minimum(1, (length - t)/0.8)
    return s*env*0.025
def sub(m, length):
    t = np.arange(int(length*SR))/SR
    return np.sin(2*np.pi*hz(m-12)*t)*np.minimum(1,t/.01)*np.exp(-t*3)*0.35
k = a.key; prog = [[k, k+3, k+7, k+10], [k-4, k, k+3, k+7], [k-2, k+2, k+5, k+9], [k-7, k-3, k, k+5]]
bar = 4*beat; drop = a.drop if a.drop is not None else 2*bar; end = a.end if a.end is not None else a.dur - 2
nb = int(a.dur / beat) + 1
b0 = -int(a.offset / beat) - 1
for b in range(b0, nb):
    t = a.offset % bar + b*beat
    if t < -1e-6: continue
    if t > end + 1e-6: break
    chord = prog[(b // 4) % 4]
    if b % 4 == 0: put(pad(chord, bar + .5), t, 0, 1.0)
    full = t >= drop - 1e-6
    if full or b % 2 == 0: put(kick(), t, 0, 0.9 if full else 0.6)
    if full and b % 4 in (1, 3): put(clap(), t, 0.1)
    for e in range(2):
        tt = t + e*beat/2
        put(hat(open_=(e == 1 and full)), tt, -0.3 if e else 0.3)
    if full: put(sub(chord[0], beat*.9), t + beat/2 if b % 2 else t, 0)
    arp = chord[(b*2) % 4] + 12
    put(pluck(arp), t + beat*.5, 0.4 if b % 2 else -0.4)
    if full: put(pluck(chord[(b*2+1) % 4] + 12, .3), t + beat*.75, -0.2)
# final hit
put(kick()*1.2, end); put(pad(prog[0], 2.2), end, 0, 1.3)
mix = np.stack([L, R], 1); mix /= max(1e-9, np.abs(mix).max()) / 0.8
sf.write(a.out, mix, SR); print(f"{a.out}: {a.dur}s @ {a.bpm} bpm")
