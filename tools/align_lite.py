#!/usr/bin/env python3
"""
Offline fallback for tools/align.py when the WhisperX alignment model can't be downloaded.
Same inputs and outputs (vo.json, audio/vo_track.wav, audio/vo.srt), same timeline rules.

Each segment is trimmed to its speech by RMS energy; word times are spread across the speech by
syllable weight, snapped to the nearest low-energy dips. Accurate at segment and phrase
boundaries, approximate inside a phrase, so put [[cues]] at the start of a segment where timing
matters.

    python tools/align_lite.py                 # needs audio/vo/*.wav
    python tools/align_lite.py --estimate      # no audio yet: placeholder vo.json at ~2.6 words/s
"""
import argparse, json, re, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from align import spoken_words_and_cues, place, srt_chunks, ts  # noqa: E402  (pure helpers, no whisperx)

PAD_PRE, PAD_POST = 0.06, 0.18


def syllables(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w:
        return 1
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and n > 1:
        n -= 1
    return max(1, n)


def word_times(words, length, env=None, hop=0.01):
    wts = np.array([syllables(w) + (0.6 if re.search(r"[,.;:?!]$", w) else 0) for w in words], float)
    edges = np.concatenate([[0], np.cumsum(wts)]) / wts.sum() * length
    if env is not None and len(env) > 4:
        for i in range(1, len(edges) - 1):  # snap inner boundaries to local energy minima (±80 ms)
            c = int(edges[i] / hop); lo, hi = max(1, c - 8), min(len(env) - 1, c + 8)
            if hi > lo:
                edges[i] = (lo + int(np.argmin(env[lo:hi]))) * hop
        edges = np.maximum.accumulate(edges)
    return [{"w": w, "start": float(edges[i]), "end": float(edges[i + 1])} for i, w in enumerate(words)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script", nargs="?", default="vo_script.json")
    ap.add_argument("--vo-dir", default="audio/vo")
    ap.add_argument("--out", default="vo.json")
    ap.add_argument("--track", default="audio/vo_track.wav")
    ap.add_argument("--srt", default="audio/vo.srt")
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--wps", type=float, default=2.6)
    a = ap.parse_args()
    script = json.loads(Path(a.script).read_text())
    segs = script["segments"]
    clips, sr_out = [], 24000
    for s in segs:
        words, cues = spoken_words_and_cues(s["text"])
        if a.estimate:
            L = sum(syllables(w) for w in words) / (a.wps * 1.45)
            clips.append({"pcm": np.zeros(int(L * sr_out), np.float32), "c0": 0.0, "speech_len": L,
                          "words": word_times(words, L), "cues": cues, "spoken": words})
            continue
        import soundfile as sf
        pcm, sr = sf.read(str(Path(a.vo_dir) / f"{s['id']}.wav"), dtype="float32", always_2d=True)
        pcm = pcm.mean(1); sr_out = sr
        hop = int(0.01 * sr)
        env = np.sqrt(np.convolve(pcm ** 2, np.ones(hop * 3) / (hop * 3), "same")[::hop])
        thr = max(env.max() * 0.04, 1e-4)
        on = np.where(env > thr)[0]
        t0, t1 = on[0] * 0.01, (on[-1] + 1) * 0.01
        c0, c1 = max(0, t0 - PAD_PRE), min(len(pcm) / sr, t1 + PAD_POST)
        timed = word_times(words, t1 - t0, env[on[0]:on[-1] + 1])
        for w in timed:
            w["start"] += t0; w["end"] += t0
        clips.append({"pcm": pcm[int(c0 * sr):int(c1 * sr)], "c0": c0, "speech_len": c1 - c0,
                      "words": timed, "cues": cues, "spoken": words})
    starts, total, warns = place(script, clips)
    for w in warns:
        print("warning:", w, file=sys.stderr)
    track = np.zeros(int(np.ceil(total * sr_out)) + 1, np.float32)
    out, allw, allc = [], [], []
    for s, c, t0 in zip(segs, clips, starts):
        i0 = int(round(t0 * sr_out)); track[i0:i0 + len(c["pcm"])] += c["pcm"]
        off = t0 - c["c0"]
        words = [{"w": w["w"], "start": round(w["start"] + off, 3), "end": round(w["end"] + off, 3)} for w in c["words"]]
        cues = [{"name": n, "t": words[i]["start"] if i < len(words) else words[-1]["end"], "segment": s["id"]} for n, i in c["cues"]]
        out.append({"id": s["id"], "text": s["text"], "spoken": " ".join(c["spoken"]), "start": round(t0, 3),
                    "end": round(t0 + c["speech_len"], 3), "words": words, "cues": cues})
        allw += words; allc += cues
    meta = {"version": 1, "duration": round(total, 3), "sample_rate": sr_out, "voice": script.get("voice"),
            "model": script.get("model"), "aligner": "estimate" if a.estimate else "align_lite",
            "segments": out, "cues": {c["name"]: c["t"] for c in allc}}
    Path(a.out).write_text(json.dumps(meta, indent=1))
    if not a.estimate:
        import soundfile as sf
        Path(a.track).parent.mkdir(parents=True, exist_ok=True)
        sf.write(a.track, np.clip(track, -1, 1), sr_out, subtype="PCM_16")
        lines = []
        for n, ch in enumerate(srt_chunks(allw), 1):
            lines += [str(n), f"{ts(ch[0]['start'])} --> {ts(ch[-1]['end'])}", " ".join(w["w"] for w in ch), ""]
        Path(a.srt).write_text("\n".join(lines))
    print(f"{a.out}: {len(out)} segments, {total:.2f}s")
    for e in out:
        print(f"  {e['id']} {e['start']:6.2f}-{e['end']:6.2f}  {e['spoken']}")


if __name__ == "__main__":
    main()
