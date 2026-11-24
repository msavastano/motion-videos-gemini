#!/usr/bin/env python3
"""Synthesize synced whiteboard foley for From Neuron to Transformer -> audio/sfx.wav.

Reads vo.json (cue timestamps) and beats.json (music grid) so every marker squeak,
cap click, felt eraser swipe, and living animation whoosh/blip lands on the picture.
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
SR = 48000


def add_stereo(buf, start_idx, sig, pan=0.0):
    if start_idx >= len(buf):
        return
    if start_idx < 0:
        sig = sig[-start_idx:]
        start_idx = 0
    end_idx = min(len(buf), start_idx + len(sig))
    n = end_idx - start_idx
    if n <= 0:
        return
    l_gain = float(np.clip(1.0 - pan * 0.5, 0.2, 1.4))
    r_gain = float(np.clip(1.0 + pan * 0.5, 0.2, 1.4))
    buf[start_idx:end_idx, 0] += sig[:n] * l_gain
    buf[start_idx:end_idx, 1] += sig[:n] * r_gain


def add_cap_click(buf, t, off=True, gain=0.38):
    rng = np.random.default_rng(101 if off else 102)
    n = int(0.08 * SR)
    tt = np.arange(n) / SR
    # Double plastic snap transient
    f1 = 1950.0 if off else 1650.0
    f2 = 3850.0 if off else 3200.0
    snap1 = (
        0.55 * np.sin(2 * np.pi * f1 * tt) * np.exp(-tt * 140)
        + 0.35 * np.sin(2 * np.pi * f2 * tt) * np.exp(-tt * 220)
        + 0.45 * rng.uniform(-1, 1, n) * np.exp(-tt * 420)
    )
    delay = int((0.022 if off else 0.014) * SR)
    snap2 = np.zeros(n)
    if delay < n:
        m = n - delay
        t2 = np.arange(m) / SR
        snap2[delay:] = (
            0.40 * np.sin(2 * np.pi * (f1 * 1.25) * t2) * np.exp(-t2 * 180)
            + 0.25 * rng.uniform(-1, 1, m) * np.exp(-t2 * 500)
        )
    add_stereo(buf, int(t * SR), gain * (snap1 + snap2), pan=0.05)


def add_marker_stroke(buf, t0, t1, seed, pan=0.0, gain=0.14):
    dur = max(0.18, t1 - t0)
    n = int(dur * SR)
    tt = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 1.0, n)

    # Felt-tip friction band-pass (~900-2600 Hz via two-pole IIR difference)
    lp1 = np.zeros(n)
    lp2 = np.zeros(n)
    a1, a2 = 0.28, 0.11
    x1 = x2 = 0.0
    for i in range(n):
        x1 += a1 * (noise[i] - x1)
        x2 += a2 * (x1 - x2)
        lp1[i] = x1 - x2

    # Cadence envelope: 2-4 sub-strokes per drawing phrase
    pulses = max(2, int(round(dur / 0.38)))
    env = np.sin(np.pi * tt / dur) ** 0.5 * (0.45 + 0.55 * np.abs(np.sin(np.pi * pulses * tt / dur)) ** 0.7)
    sig = lp1 * env * 0.65

    # Subtle dry-erase squeak harmonic on 1 or 2 crisp turns
    for k in range(min(2, pulses)):
        sq_t = dur * (0.22 + 0.52 * k) + rng.uniform(-0.04, 0.04)
        sq_len = int(0.11 * SR)
        sq_idx = int(sq_t * SR)
        if 0 <= sq_idx and sq_idx + sq_len < n:
            ts = np.arange(sq_len) / SR
            f0 = rng.uniform(2350.0, 2950.0)
            f_glide = f0 + 260.0 * np.sin(np.pi * ts / 0.11)
            phase = np.cumsum(2 * np.pi * f_glide / SR)
            sq_env = np.sin(np.pi * ts / 0.11) ** 1.6
            sig[sq_idx:sq_idx + sq_len] += 0.14 * sq_env * np.sin(phase)

    add_stereo(buf, int(t0 * SR), gain * sig, pan=pan)


def add_eraser_wipe(buf, t0, t1, seed, gain=0.28):
    dur = max(0.8, t1 - t0)
    n = int(dur * SR)
    tt = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 1.0, n)

    # Felt pad broad brush (350-1500 Hz)
    bp = np.zeros(n)
    x1 = x2 = 0.0
    for i in range(n):
        x1 += 0.18 * (noise[i] - x1)
        x2 += 0.04 * (x1 - x2)
        bp[i] = x1 - x2

    # 3 sweeps across the board
    swipes = np.abs(np.sin(3.0 * np.pi * tt / dur)) ** 1.2
    env = np.sin(np.pi * tt / dur) ** 0.4 * swipes
    sig = bp * env * gain

    # Stereo pan glides with each swipe
    s_idx = int(t0 * SR)
    end_idx = min(len(buf), s_idx + n)
    m = end_idx - s_idx
    if m > 0:
        pan_curve = 0.55 * np.cos(3.0 * np.pi * tt[:m] / dur)
        buf[s_idx:end_idx, 0] += sig[:m] * (1.0 - pan_curve * 0.5)
        buf[s_idx:end_idx, 1] += sig[:m] * (1.0 + pan_curve * 0.5)


def add_whoosh(buf, t, dur=0.45, gain=0.22, pan=0.0, seed=500):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 1.0, n)
    lp = np.zeros(n)
    x = 0.0
    for i in range(n):
        frac = i / n
        alpha = 0.015 + 0.14 * np.sin(np.pi * frac)
        x += alpha * (noise[i] - x)
        lp[i] = x
    env = np.sin(np.pi * tt / dur) ** 2.0
    add_stereo(buf, int((t - dur * 0.45) * SR), gain * env * lp, pan=pan)


def add_blip(buf, t, freq=660.0, gain=0.16, pan=0.0):
    n = int(0.32 * SR)
    tt = np.arange(n) / SR
    env = np.minimum(1.0, tt / 0.006) * np.exp(-tt * 11.0)
    sig = env * (0.75 * np.sin(2 * np.pi * freq * tt) + 0.25 * np.sin(2 * np.pi * freq * 2.0 * tt) * np.exp(-tt * 14.0))
    add_stereo(buf, int(t * SR), gain * sig, pan=pan)


def main():
    vo = json.loads((HERE / "vo.json").read_text(encoding="utf-8"))
    cues = vo["cues"]
    dur = float(vo["duration"])
    buf = np.zeros((int(np.ceil((dur + 1.0) * SR)), 2), dtype=np.float32)

    # Cap clicks: open + close
    add_cap_click(buf, 0.25, off=True, gain=0.42)
    add_cap_click(buf, cues["cap_on"], off=False, gain=0.42)

    # Stroke windows synced to vo.json cues
    strokes = [
        (0.70, cues["inputs"] + 1.4, -0.35),
        (cues["inputs"] + 1.6, cues["weights"] - 0.15, -0.25),
        (cues["weights"], cues["sum"] - 0.1, -0.10),
        (cues["sum"], cues["activation"] - 0.1, 0.05),
        (cues["activation"], cues["neuron_alive"] - 0.15, 0.25),
        (cues["layers"], cues["forward"] - 0.15, -0.10),
        (cues["error"], cues["training_alive"] - 0.15, 0.15),
        (cues["wipe_tokens"] + 1.45, cues["tokens"] + 1.3, -0.15),
        (cues["vectors"], cues["vectors_alive"] - 0.15, 0.20),
        (cues["llm_box"], cues["probs"] - 0.15, -0.10),
        (cues["probs"], cues["pick_mat"] - 0.15, 0.20),
        (cues["wipe_attn"] + 1.45, cues["attn_arcs"] - 0.15, -0.15),
        (cues["attn_arcs"], cues["attn_alive"] - 0.15, 0.05),
        (cues["stack_layers"], cues["wipe_wrap"] - 0.5, 0.25),
        (cues["pipeline_draw"], cues["cap_on"] - 0.25, 0.0),
    ]
    for idx, (t0, t1, pan) in enumerate(strokes):
        if t1 > t0 + 0.15:
            add_marker_stroke(buf, t0, t1, seed=200 + idx, pan=pan, gain=0.14)

    # Felt eraser wipes between scenes
    wipes = [
        (cues["wipe_tokens"], cues["wipe_tokens"] + 1.25),
        (cues["wipe_attn"], cues["wipe_attn"] + 1.25),
        (cues["wipe_wrap"], cues["wipe_wrap"] + 1.05),
    ]
    for idx, (t0, t1) in enumerate(wipes):
        add_eraser_wipe(buf, t0, t1, seed=400 + idx, gain=0.28)

    # Soft whooshes & harmonic blips when sketches come alive
    alive_hits = [
        (cues["neuron_alive"], 587.3, 0.15),
        (cues["forward"], 659.3, -0.10),
        (cues["training_alive"], 784.0, 0.10),
        (cues["vectors_alive"], 659.3, 0.15),
        (cues["pick_mat"], 880.0, 0.20),
        (cues["loop_alive"], 784.0, -0.15),
        (cues["attn_alive"], 880.0, 0.0),
        (cues["stack_layers"] + 0.6, 987.8, 0.20),
        (cues["pipeline_alive"], 1046.5, 0.0),
    ]
    for idx, (t, freq, pan) in enumerate(alive_hits):
        add_whoosh(buf, t, dur=0.45, gain=0.20, pan=pan, seed=600 + idx)
        add_blip(buf, t, freq=freq, gain=0.15, pan=pan)

    out_path = HERE / "audio" / "sfx.wav"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    peak = float(np.max(np.abs(buf)))
    if peak > 0.92:
        buf *= 0.92 / peak
    sf.write(str(out_path), buf, SR, subtype="PCM_16")
    print(f"{out_path}: {len(strokes)} strokes, {len(wipes)} wipes, {len(alive_hits)} alive hits, {dur:.2f}s")


if __name__ == "__main__":
    main()
