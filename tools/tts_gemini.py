#!/usr/bin/env python3
"""
Voice every segment of vo_script.json with Gemini 3.8 TTS, one WAV per segment.

    python tools/tts_gemini.py                       # voice anything new or changed
    python tools/tts_gemini.py --only s03,s04        # just these segments
    python tools/tts_gemini.py --force               # re-voice everything
    python tools/tts_gemini.py --dry-run             # show what would be sent, no API calls

Needs:  pip install google-genai python-dotenv soundfile
Key:    GEMINI_API_KEY in .env (or the environment), or a cloud network secret. Never hard-code it.

vo_script.json
{
  "model": "gemini-3.8-flash-tts",      // or gemini-3.8-flash-lite-tts
  "voice": "Charon",                    // prebuilt name, or a voice_... id from Voice design
  "style": "",                          // default speech_metadata.style; empty is usually best
  "language": "en",                     // used by align.py
  "lead_in": 0.5, "gap": 0.6, "tail": 1.0,   // seconds, used by align.py
  "segments": [
    {"id": "s01", "text": "A bill starts as [[intro]] an idea.", "style": ""},
    {"id": "s02", "text": "...", "gap_after": 0.9, "start": 12.0}
  ]
}

Text rules
- Spoken verbatim. Direction goes in "style", never in the text.
- Inline vocal tags are allowed: <short pause>, <long pause>, <breath>, <laugh> ...
- [[cue_name]] markers are stripped before voicing; align.py turns them into timed cues.
- CAPITALIZED words get vocal emphasis.

Each segment is cached by a hash of (model, voice, style, spoken text). Re-running only
pays for segments that changed.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

CUE_RE = re.compile(r"\[\[\s*([A-Za-z0-9_\-]+)\s*\]\]")
MAX_TEXT_CHARS = 20000  # well under the 8,192 input-token limit; keep segments short anyway


def load_env(path=".env"):
    """Load .env from CWD or nearest parent directory without requiring python-dotenv."""
    p = Path(path)
    if not p.exists():
        for parent in Path.cwd().parents:
            cand = parent / path
            if cand.exists():
                p = cand
                break
    if not p.exists():
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(p)
        return
    except ImportError:
        pass
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def gemini_api_key():
    """The key from .env or the environment, else a placeholder.

    In a cloud session the key is a network secret instead: the agent proxy puts it in the
    x-goog-api-key header of requests to generativelanguage.googleapis.com, so the session
    never sees it. The placeholder only lets the SDK start; the proxy replaces it.
    """
    key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    print("no GEMINI_API_KEY in .env or the environment; using the network secret "
          "for generativelanguage.googleapis.com", file=sys.stderr)
    return "proxy-injected"


def tts_text(text):
    """What actually gets sent to the model: cue markers removed, whitespace tidied."""
    return re.sub(r"\s+", " ", CUE_RE.sub(" ", text)).strip()


def seg_voice(script, seg):
    v = seg.get("voice")
    if v:
        return v
    sp = seg.get("speaker")
    if sp and isinstance(script.get("voices"), dict) and sp in script["voices"]:
        return script["voices"][sp]
    return script.get("voice", "Charon")


def seg_style(script, seg):
    s = seg.get("style")
    if s is not None:
        return s
    sp = seg.get("speaker")
    if sp and isinstance(script.get("styles"), dict) and sp in script["styles"]:
        return script["styles"][sp]
    return script.get("style") or ""


def seg_hash(script, seg):
    key = json.dumps({
        "model": script.get("model", "gemini-3.8-flash-tts"),
        "voice": seg_voice(script, seg),
        "style": seg_style(script, seg),
        "text": tts_text(seg["text"]),
    }, sort_keys=True)
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def build_request(script, seg):
    content = {"type": "text", "text": tts_text(seg["text"])}
    style = seg_style(script, seg)
    if style:
        content["annotations"] = [{"type": "speech_metadata", "style": style}]
    return {
        "model": script.get("model", "gemini-3.8-flash-tts"),
        "input": [{"type": "user_input", "content": [content]}],
        "response_format": {"type": "audio"},  # unary default: WAV, 24 kHz mono 16-bit
        "generation_config": {"speech_config": [{"voice": seg_voice(script, seg)}]},
    }


def pcm_to_wav(pcm, rate=24000):
    """Wrap raw 16-bit mono PCM in a WAV header."""
    import struct
    return (b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt "
            + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(pcm)) + pcm)


def synthesize_generate_content(client, req):
    """The same request through generateContent, for when the Interactions API can't find
    the model (it returned 404 for gemini-3.8-flash-tts in November 2026 while
    generateContent still served it). That route has no style field, and the model reads a
    "Say this warmly:" prefix aloud, so the style is left out."""
    from google.genai import types
    content = req["input"][0]["content"][0]
    if any(a.get("style") for a in content.get("annotations", [])):
        print("    note: generateContent has no style field; voicing without the style", file=sys.stderr)
    prompt = content["text"]
    voice = req["generation_config"]["speech_config"][0]["voice"]
    from google import genai
    client = genai.Client(api_key=gemini_api_key(), http_options=types.HttpOptions(api_version="v1beta"))
    resp = client.models.generate_content(
        model=req["model"], contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)))))
    part = resp.candidates[0].content.parts[0].inline_data
    if part is None or not part.data:
        raise RuntimeError("response contained no audio")
    data = part.data if isinstance(part.data, bytes) else base64.b64decode(part.data)
    if data[:4] == b"RIFF":
        return data
    rate = 24000
    m = re.search(r"rate=(\d+)", part.mime_type or "")
    if m:
        rate = int(m.group(1))
    return pcm_to_wav(data, rate)


def synthesize(client, req, retries=4):
    delay = 2.0
    for attempt in range(1, retries + 1):
        try:
            try:
                interaction = client.interactions.create(**req)
            except Exception as e:
                if "404" not in str(e) and "not found" not in str(e).lower():
                    raise
                return synthesize_generate_content(client, req)
            audio = getattr(interaction, "output_audio", None)
            if audio is None or not getattr(audio, "data", None):
                raise RuntimeError("response contained no audio")
            data = base64.b64decode(audio.data)
            if data[:4] != b"RIFF":
                raise RuntimeError("expected a WAV (RIFF) response; got something else")
            return data
        except Exception as e:  # network, quota, safety block, etc.
            if attempt == retries:
                raise
            print(f"    attempt {attempt} failed ({e}); retrying in {delay:.0f}s", file=sys.stderr)
            time.sleep(delay)
            delay *= 2


def wav_seconds(path):
    try:
        import soundfile as sf
        return sf.info(str(path)).duration
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", nargs="?", default="vo_script.json")
    ap.add_argument("--out-dir", default="audio/vo")
    ap.add_argument("--only", help="comma-separated segment ids")
    ap.add_argument("--force", action="store_true", help="ignore the cache")
    ap.add_argument("--dry-run", action="store_true", help="print requests, call nothing")
    args = ap.parse_args()

    script = json.loads(Path(args.script).read_text(encoding="utf-8"))
    segs = script.get("segments", [])
    ids = [s["id"] for s in segs]
    if len(ids) != len(set(ids)):
        sys.exit("error: segment ids must be unique")
    for s in segs:
        if len(tts_text(s["text"])) > MAX_TEXT_CHARS:
            sys.exit(f"error: segment {s['id']} is too long; split it")
        if re.search(r"\[(?!\[)[^\]]*\]", CUE_RE.sub("", s["text"])):
            print(f"warning: {s['id']} has [single-bracket] text that will be SPOKEN. "
                  "Use <tags> for vocal events, [[name]] for cues, 'style' for direction.",
                  file=sys.stderr)
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        missing = wanted - set(ids)
        if missing:
            sys.exit(f"error: unknown segment ids: {', '.join(sorted(missing))}")
        segs = [s for s in segs if s["id"] in wanted]

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    todo = []
    for s in segs:
        wav, meta = out / f"{s['id']}.wav", out / f"{s['id']}.json"
        h = seg_hash(script, s)
        cached = (not args.force and wav.exists() and meta.exists()
                  and json.loads(meta.read_text(encoding="utf-8")).get("hash") == h)
        if not cached:
            todo.append((s, h))

    print(f"{len(segs)} segment(s), {len(todo)} to voice, {len(segs) - len(todo)} cached")
    if args.dry_run:
        for s, _ in todo:
            print(json.dumps(build_request(script, s), indent=1))
        return
    if not todo:
        return

    load_env()
    from google import genai
    client = genai.Client(api_key=gemini_api_key())

    total = 0.0
    for s, h in todo:
        wav, meta = out / f"{s['id']}.wav", out / f"{s['id']}.json"
        print(f"  voicing {s['id']}: {tts_text(s['text'])[:70]}...")
        data = synthesize(client, build_request(script, s))
        wav.write_bytes(data)
        secs = wav_seconds(wav)
        total += secs or 0
        meta.write_text(json.dumps({
            "hash": h, "id": s["id"], "model": script.get("model", "gemini-3.8-flash-tts"),
            "voice": seg_voice(script, s), "speaker": s.get("speaker"), "style": seg_style(script, s),
            "spoken": tts_text(s["text"]), "seconds": secs,
        }, indent=1), encoding="utf-8")
        print(f"    -> {wav} ({secs:.2f}s)" if secs else f"    -> {wav}")
    print(f"done: {total:.1f}s of new audio. Next: python tools/align.py")


if __name__ == "__main__":
    main()
