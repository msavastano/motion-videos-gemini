#!/usr/bin/env python3
"""
Generate an instrumental music bed with Lyria 3 (Gemini API generateContent, audio out).

    python tools/music_lyria.py music_prompt.json                 # generate anything new or changed
    python tools/music_lyria.py music_prompt.json --only take2    # just these takes
    python tools/music_lyria.py music_prompt.json --dry-run       # show requests, call nothing

music_prompt.json
{
  "model": "lyria-3-clip-preview",       // ~30 s clips; lyria-3-pro-preview for longer pieces
  "takes": [{"id": "take1", "prompt": "Instrumental ... No vocals."}, ...]
}

Key: GEMINI_API_KEY in .env or the environment, or a cloud network secret.
Output: audio/music/<id>.mp3 + <id>.json, cached by a hash of (model, prompt). Lyria output carries a SynthID watermark.
Measure the result with tools/beats.py before timing picture to it.
"""
import argparse, hashlib, json, os, sys, time
from pathlib import Path


def load_env(path=".env"):
    p = Path(path)
    if not p.exists():
        for parent in Path.cwd().parents:
            cand = parent / path
            if cand.exists():
                p = cand
                break
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
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


def generate(client, model, prompt, retries=4):
    from google.genai import types
    delay = 2.0
    for attempt in range(1, retries + 1):
        try:
            r = client.models.generate_content(model=model, contents=prompt,
                                               config=types.GenerateContentConfig(response_modalities=["AUDIO"]))
            parts = [p for c in (r.candidates or []) if c.content for p in (c.content.parts or [])]
            audio = [p.inline_data for p in parts if getattr(p, "inline_data", None) and p.inline_data.data]
            if not audio:
                raise RuntimeError("no audio in response")
            text = " ".join(p.text for p in parts if getattr(p, "text", None))
            return audio[0].data, audio[0].mime_type, text
        except Exception as e:
            if attempt == retries:
                raise
            print(f"    attempt {attempt} failed ({e}); retrying in {delay:.0f}s", file=sys.stderr)
            time.sleep(delay)
            delay *= 2


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", nargs="?", default="music_prompt.json")
    ap.add_argument("--out-dir", default="audio/music")
    ap.add_argument("--only")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    spec = json.loads(Path(a.spec).read_text(encoding="utf-8"))
    model = spec.get("model", "lyria-3-clip-preview")
    takes = spec["takes"]
    if a.only:
        want = {x.strip() for x in a.only.split(",")}
        takes = [t for t in takes if t["id"] in want]
    out = Path(a.out_dir)
    todo = []
    for t in takes:
        h = hashlib.sha256(json.dumps({"m": model, "p": t["prompt"]}).encode()).hexdigest()[:16]
        meta = out / f"{t['id']}.json"
        if meta.exists() and json.loads(meta.read_text()).get("hash") == h and (out / f"{t['id']}.mp3").exists():
            continue
        todo.append((t, h))
    print(f"{len(takes)} take(s), {len(todo)} to generate")
    if a.dry_run:
        for t, _ in todo:
            print(json.dumps({"model": model, "contents": t["prompt"]}, indent=1))
        return
    if not todo:
        return
    load_env()
    from google import genai
    from google.genai import types
    # google-genai 3.x defaults to API v1, where the Lyria models aren't served; pin v1beta.
    client = genai.Client(api_key=gemini_api_key(), http_options=types.HttpOptions(api_version="v1beta"))
    out.mkdir(parents=True, exist_ok=True)
    for t, h in todo:
        print(f"  generating {t['id']}...")
        data, mime, text = generate(client, model, t["prompt"])
        if "mpeg" not in mime and "mp3" not in mime:
            print(f"    note: got {mime}, saving with .mp3 name anyway", file=sys.stderr)
        (out / f"{t['id']}.mp3").write_bytes(data)
        (out / f"{t['id']}.json").write_text(json.dumps({"hash": h, "id": t["id"], "model": model,
                                                          "prompt": t["prompt"], "mime": mime, "text": text}, indent=1))
        print(f"    -> {out / (t['id'] + '.mp3')} ({len(data) // 1024} KB)")


if __name__ == "__main__":
    main()
