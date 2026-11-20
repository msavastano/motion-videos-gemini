#!/usr/bin/env python3
"""
Force-align the voiced segments to their known text and lay them on one timeline.

    python tools/align.py                  # vo_script.json + audio/vo/*.wav -> vo.json + audio/vo_track.wav
    python tools/align.py --verify         # also transcribe each segment and diff it against the script
    python tools/align.py --device cuda    # default is cpu, which is fine for short voiceovers

Needs:  pip install whisperx soundfile numpy   (and ffmpeg on PATH)
        First run downloads the wav2vec2 alignment model for the language.

What it produces
- vo.json            absolute word timings, segment bounds and [[cue]] times the animation reads
- audio/vo_track.wav every segment placed on the timeline, silence between, ready to mix
- audio/vo.srt       captions in short chunks (optional, on by default)

Timeline rules (from vo_script.json)
- Segments are trimmed to their speech (tiny pads kept), then placed back to back:
  lead_in, segment, gap (or the segment's gap_after), next segment, ..., tail.
- A segment with "start": T is pinned to T (use it to land lines on downbeats or on a fixed
  shot). If the previous line would still be speaking at T, the line is pushed later and a
  warning says by how much.
"""
import argparse
import difflib
import json
import re
import sys
from pathlib import Path

import numpy as np

CUE_RE = re.compile(r"\[\[\s*([A-Za-z0-9_\-]+)\s*\]\]")
TAG_RE = re.compile(r"<[^>]*>")          # inline vocal events: not words
BACKCHANNEL_RE = re.compile(r"\|[^|]*\|")  # |oh really?| overlaps: skip for alignment
PAD_PRE, PAD_POST = 0.08, 0.20


# ---------- text ----------

def spoken_words_and_cues(text):
    """Split script text into the words actually spoken, plus [[cue]] -> word index."""
    words, cues = [], []
    for i, piece in enumerate(CUE_RE.split(text)):
        if i % 2 == 1:                      # a cue name
            cues.append((piece, len(words)))
            continue
        clean = BACKCHANNEL_RE.sub(" ", TAG_RE.sub(" ", piece))
        words.extend(clean.split())
    return words, cues


def norm(w):
    return re.sub(r"[^\w']", "", w.lower())


# ---------- alignment ----------

class Aligner:
    def __init__(self, language, device):
        import whisperx
        self.wx = whisperx
        self.device = device
        self.model, self.meta = whisperx.load_align_model(language_code=language, device=device)
        self.asr = None
        self.language = language

    def load(self, path):
        return self.wx.load_audio(str(path))  # float32 mono, 16 kHz

    def align(self, audio16k, words):
        dur = len(audio16k) / 16000.0
        seg = [{"start": 0.0, "end": dur, "text": " ".join(words)}]
        res = self.wx.align(seg, self.model, self.meta, audio16k, self.device,
                            return_char_alignments=False)
        out = []
        for s in res.get("segments", []):
            for w in s.get("words", []):
                out.append({"w": w.get("word", ""), "start": w.get("start"), "end": w.get("end"),
                            "score": w.get("score")})
        return out

    def transcribe(self, audio16k, asr_model):
        if self.asr is None:
            ct = "float16" if self.device == "cuda" else "int8"
            self.asr = self.wx.load_model(asr_model, self.device, compute_type=ct, language=self.language)
        res = self.asr.transcribe(audio16k, batch_size=4, language=self.language)
        return " ".join(s["text"].strip() for s in res.get("segments", []))


def map_to_script(script_words, aligned):
    """Give every script word a timing, matching aligned tokens by sequence, then interpolating gaps."""
    a = [norm(w) for w in script_words]
    b = [norm(x["w"]) for x in aligned]
    timed = [{"w": w, "start": None, "end": None} for w in script_words]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("equal", "replace") and (i2 - i1) == (j2 - j1):
            for k in range(i2 - i1):
                timed[i1 + k]["start"] = aligned[j1 + k]["start"]
                timed[i1 + k]["end"] = aligned[j1 + k]["end"]
    fill_missing(timed)
    return timed


def fill_missing(timed):
    """Words the aligner couldn't place (digits, symbols) get evenly spread between neighbors."""
    n = len(timed)
    i = 0
    while i < n:
        if timed[i]["start"] is not None and timed[i]["end"] is not None:
            i += 1
            continue
        j = i
        while j < n and (timed[j]["start"] is None or timed[j]["end"] is None):
            j += 1
        left = timed[i - 1]["end"] if i > 0 else None
        right = timed[j]["start"] if j < n else None
        if left is None and right is None:
            raise RuntimeError("alignment produced no timings at all for this segment")
        if left is None:
            left = max(0.0, right - 0.3 * (j - i))
        if right is None:
            right = left + 0.3 * (j - i)
        step = max(right - left, 0.0) / (j - i)
        for k in range(i, j):
            timed[k]["start"] = left + step * (k - i)
            timed[k]["end"] = left + step * (k - i + 1)
        i = j


def compare(expected_words, heard_text):
    a = [norm(w) for w in expected_words if norm(w)]
    b = [norm(w) for w in heard_text.split() if norm(w)]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    diffs = [{"expected": " ".join(a[i1:i2]), "heard": " ".join(b[j1:j2])}
             for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != "equal"]
    return round(sm.ratio(), 3), diffs


# ---------- timeline ----------

def place(script, clips):
    """clips: list of dicts with id, speech_len. Returns absolute starts and total duration."""
    t = float(script.get("lead_in", 0.5))
    default_gap = float(script.get("gap", 0.6))
    starts, warnings = [], []
    for seg, clip in zip(script["segments"], clips):
        pin = seg.get("start")
        if pin is not None:
            if pin + 1e-3 < t:
                warnings.append(f"{seg['id']}: pinned at {pin:.2f}s but the previous line and its gap "
                                f"end at {t:.2f}s; pushed {t - pin:.2f}s later")
            else:
                t = float(pin)
        starts.append(t)
        t += clip["speech_len"]
        gap = seg.get("gap_after")
        t += default_gap if gap is None else float(gap)
    last_gap = script["segments"][-1].get("gap_after")
    total = t - (default_gap if last_gap is None else float(last_gap)) + float(script.get("tail", 1.0))
    return starts, total, warnings


def srt_chunks(words, max_words=7):
    chunk = []
    for w in words:
        chunk.append(w)
        if len(chunk) >= max_words or re.search(r"[.,?!;:]$", w["w"]):
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def ts(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", nargs="?", default="vo_script.json")
    ap.add_argument("--vo-dir", default="audio/vo")
    ap.add_argument("--out", default="vo.json")
    ap.add_argument("--track", default="audio/vo_track.wav")
    ap.add_argument("--srt", default="audio/vo.srt", help="'' to skip")
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    ap.add_argument("--verify", action="store_true", help="transcribe and diff against the script")
    ap.add_argument("--asr-model", default="small")
    args = ap.parse_args()

    import soundfile as sf

    script = json.loads(Path(args.script).read_text(encoding="utf-8"))
    segs = script["segments"]
    lang = script.get("language", "en")
    vo_dir = Path(args.vo_dir)
    missing = [s["id"] for s in segs if not (vo_dir / f"{s['id']}.wav").exists()]
    if missing:
        sys.exit(f"error: no audio for {', '.join(missing)}. Run tools/tts_gemini.py first.")

    aligner = Aligner(lang, args.device)
    clips, sr_out = [], None
    for s in segs:
        wav = vo_dir / f"{s['id']}.wav"
        words, cues = spoken_words_and_cues(s["text"])
        if not words:
            sys.exit(f"error: {s['id']} has no spoken words")
        a16 = aligner.load(wav)
        timed = map_to_script(words, aligner.align(a16, words))

        pcm, sr = sf.read(str(wav), dtype="float32", always_2d=True)
        pcm = pcm.mean(axis=1)
        if sr_out is None:
            sr_out = sr
        elif sr != sr_out:
            sys.exit(f"error: {s['id']} is {sr} Hz but earlier segments are {sr_out} Hz")
        dur = len(pcm) / sr
        c0 = max(0.0, timed[0]["start"] - PAD_PRE)
        c1 = min(dur, timed[-1]["end"] + PAD_POST)
        clip = {"id": s["id"], "pcm": pcm[int(c0 * sr):int(c1 * sr)], "c0": c0,
                "speech_len": c1 - c0, "words": timed, "cues": cues, "spoken": words}
        if args.verify:
            ratio, diffs = compare(words, aligner.transcribe(a16, args.asr_model))
            clip["verify"] = {"match": ratio, "diffs": diffs}
            flag = "" if ratio >= 0.97 else "   <-- CHECK"
            print(f"  {s['id']}: verbatim match {ratio:.3f}{flag}")
            for d in diffs[:5]:
                print(f"      expected '{d['expected']}'  heard '{d['heard']}'")
        clips.append(clip)

    starts, total, warnings = place(script, clips)
    for w in warnings:
        print("warning:", w, file=sys.stderr)

    track = np.zeros(int(np.ceil(total * sr_out)) + 1, dtype=np.float32)
    out_segs, all_words, all_cues = [], [], []
    for s, clip, t0 in zip(segs, clips, starts):
        i0 = int(round(t0 * sr_out))
        track[i0:i0 + len(clip["pcm"])] += clip["pcm"]
        off = t0 - clip["c0"]
        words = [{"w": w["w"], "start": round(w["start"] + off, 3), "end": round(w["end"] + off, 3)}
                 for w in clip["words"]]
        cues = []
        for name, idx in clip["cues"]:
            t = words[idx]["start"] if idx < len(words) else words[-1]["end"]
            cues.append({"name": name, "t": round(t, 3), "segment": s["id"]})
        entry = {"id": s["id"], "text": s["text"], "spoken": " ".join(clip["spoken"]),
                 "start": round(t0, 3), "end": round(t0 + clip["speech_len"], 3),
                 "words": words, "cues": cues}
        if "verify" in clip:
            entry["verify"] = clip["verify"]
        out_segs.append(entry)
        all_words += words
        all_cues += cues

    Path(args.track).parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.track, np.clip(track, -1, 1), sr_out, subtype="PCM_16")
    Path(args.out).write_text(json.dumps({
        "version": 1, "duration": round(total, 3), "sample_rate": sr_out,
        "voice": script.get("voice"), "model": script.get("model"),
        "segments": out_segs, "cues": {c["name"]: c["t"] for c in all_cues},
    }, indent=1), encoding="utf-8")

    if args.srt:
        lines = []
        for n, ch in enumerate(srt_chunks(all_words), 1):
            lines += [str(n), f"{ts(ch[0]['start'])} --> {ts(ch[-1]['end'])}",
                      " ".join(w["w"] for w in ch), ""]
        Path(args.srt).parent.mkdir(parents=True, exist_ok=True)
        Path(args.srt).write_text("\n".join(lines), encoding="utf-8")

    print(f"vo.json: {len(out_segs)} segments, {len(all_words)} words, {len(all_cues)} cues, "
          f"{total:.2f}s total")
    for e in out_segs:
        print(f"  {e['id']}  {e['start']:6.2f} - {e['end']:6.2f}s  {e['spoken'][:60]}")


if __name__ == "__main__":
    main()
