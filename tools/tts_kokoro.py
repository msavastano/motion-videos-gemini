#!/usr/bin/env python3
"""
Offline fallback for tools/tts_gemini.py: voices vo_script.json with Kokoro (open-weights, runs locally).
Same outputs: audio/vo/<id>.wav (+ .json with a cache hash), so align.py / align_lite.py work unchanged.

    python tools/tts_kokoro.py --model-dir /path/to/kokoro   # kokoro-v1.0.onnx + voices-v1.0.bin
    pip install kokoro-onnx soundfile

Script "voice" is kept for Gemini; Kokoro's voice comes from "kokoro_voice" (default af_heart).
<tags> become short pauses, CAPS emphasis is lowered (Kokoro would spell it), [[cues]] are stripped.
"""
import argparse, hashlib, json, re
from pathlib import Path
import numpy as np, soundfile as sf

CUE_RE = re.compile(r"\[\[\s*([A-Za-z0-9_\-]+)\s*\]\]")


def speakable(text):
    t = CUE_RE.sub(" ", text)
    t = re.sub(r"<[^>]*>", ",", t)
    t = re.sub(r"\b([A-Z]{2,})\b", lambda m: m.group(1).capitalize() if m.group(1) not in ("BC", "AD") else m.group(1), t)
    t = re.sub(r"\s*,\s*,", ",", t)
    return re.sub(r"\s+", " ", t).strip(" ,")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script", nargs="?", default="vo_script.json")
    ap.add_argument("--out-dir", default="audio/vo")
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--voice", default=None)
    ap.add_argument("--speed", type=float, default=None)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    script = json.loads(Path(a.script).read_text())
    voice = a.voice or script.get("kokoro_voice", "af_heart")
    speed = a.speed or script.get("kokoro_speed", 1.0)
    from kokoro_onnx import Kokoro
    k = Kokoro(str(Path(a.model_dir) / "kokoro-v1.0.onnx"), str(Path(a.model_dir) / "voices-v1.0.bin"))
    out = Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    for s in script["segments"]:
        text = speakable(s["text"])
        h = hashlib.sha256(json.dumps({"engine": "kokoro", "voice": voice, "speed": speed, "text": text}).encode()).hexdigest()[:16]
        wav, meta = out / f"{s['id']}.wav", out / f"{s['id']}.json"
        if not a.force and meta.exists() and json.loads(meta.read_text()).get("hash") == h and wav.exists():
            continue
        samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
        sf.write(str(wav), np.asarray(samples, np.float32), sr, subtype="PCM_16")
        meta.write_text(json.dumps({"hash": h, "id": s["id"], "engine": "kokoro", "voice": voice, "spoken": text,
                                    "seconds": len(samples) / sr}, indent=1))
        print(f"  {s['id']}: {len(samples) / sr:.2f}s  {text}")


if __name__ == "__main__":
    main()
