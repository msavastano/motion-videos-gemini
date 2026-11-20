#!/usr/bin/env python3
"""
Generate every image in shots.json with Nano Banana (Gemini image models), one JPEG per image.

    python tools/image_nanobanana.py                    # generate anything new or changed
    python tools/image_nanobanana.py --only title_bg    # just these image ids
    python tools/image_nanobanana.py --force            # regenerate everything
    python tools/image_nanobanana.py --dry-run          # show requests and estimated cost, no API calls

Needs:  pip install google-genai python-dotenv
Key:    GEMINI_API_KEY in .env (or the environment), or a cloud network secret. Never hard-code it.
        Image generation is billed per image; the API key's project needs billing on.

shots.json (shared with tools/video_veo.py; see tools/shots.example.json)
{
  "image_model": "gemini-nano-banana-2.1",   // or gemini-3-pro-image (Pro), gemini-3.1-flash-image (NB2)
  "aspect_ratio": "16:9",                    // default for images and clips
  "image_size": "2K",                        // "1K", "2K", "4K" (uppercase K)
  "style": "Flat vector, warm paper texture, navy and amber palette.",  // appended to every image prompt
  "images": [
    {"id": "title_bg", "prompt": "An empty Capitol dome at dawn, wide shot, room for a title on the left."},
    {"id": "mascot", "prompt": "...", "refs": ["assets/logo.png"], "aspect_ratio": "1:1", "style": ""}
  ],
  "clips": [ ... ]                           // used by video_veo.py
}

Prompt rules
- Say what the frame is for ("background plate", "empty space top-left for a title") so the
  layout leaves room for motion graphics laid on top in Remotion.
- "style" is appended to every prompt so a set of images matches. Set "style": "" on one image
  to skip it.
- "refs" are local image files (paths relative to the project root) used as references for
  characters, objects or style. Up to 14 per image.
- Generated images carry an invisible SynthID watermark.

Output goes to public/gen/images/<id>.jpg (Remotion: staticFile("gen/images/<id>.jpg")),
with <id>.json next to it. Each image is cached by a hash of (model, prompt, size, aspect,
reference file contents). Re-running only pays for images that changed.
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import sys
import time
from pathlib import Path

DEFAULT_MODEL = "gemini-nano-banana-2.1"
SIZES = {"512", "1K", "2K", "4K"}
ASPECTS = {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"}
MAX_REFS = 14
# Rough USD per image, standard tier, for --dry-run estimates only. Check Google's pricing page.
PRICE = {"gemini-nano-banana-2.1": {"1K": 0.0336, "2K": 0.0504, "4K": 0.113}}


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


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16]


def settings(shots, img):
    """Resolve per-image settings over the file-level defaults."""
    style = img.get("style")
    style = (shots.get("style") or "") if style is None else style
    prompt = img["prompt"].strip()
    if style:
        prompt = f"{prompt}\n\nStyle: {style.strip()}"
    return {
        "model": img.get("model") or shots.get("image_model") or DEFAULT_MODEL,
        "prompt": prompt,
        "aspect_ratio": img.get("aspect_ratio") or shots.get("aspect_ratio") or "16:9",
        "image_size": img.get("image_size") or shots.get("image_size") or "2K",
        "refs": list(img.get("refs") or []),
    }


def img_hash(cfg):
    key = dict(cfg, refs=[[r, file_hash(r)] for r in cfg["refs"]])
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:16]


def build_request(cfg, with_data=True):
    if cfg["refs"]:
        blocks = [{"type": "text", "text": cfg["prompt"]}]
        for r in cfg["refs"]:
            mime = mimetypes.guess_type(r)[0] or "image/png"
            data = base64.b64encode(Path(r).read_bytes()).decode() if with_data else f"<{r}>"
            blocks.append({"type": "image", "data": data, "mime_type": mime})
        inp = blocks
    else:
        inp = cfg["prompt"]
    return {
        "model": cfg["model"],
        "input": inp,
        "response_format": {
            "type": "image",
            "mime_type": "image/jpeg",
            "aspect_ratio": cfg["aspect_ratio"],
            "image_size": cfg["image_size"],
        },
    }


def generate(client, req, retries=4):
    delay = 2.0
    for attempt in range(1, retries + 1):
        try:
            interaction = client.interactions.create(**req)
            img = getattr(interaction, "output_image", None)
            if img is None or not getattr(img, "data", None):
                raise RuntimeError("response contained no image (safety block or text-only reply?)")
            data = base64.b64decode(img.data)
            if data[:3] != b"\xff\xd8\xff":
                raise RuntimeError("expected a JPEG response; got something else")
            return data
        except Exception as e:  # network, quota, safety block, etc.
            if attempt == retries:
                raise
            print(f"    attempt {attempt} failed ({e}); retrying in {delay:.0f}s", file=sys.stderr)
            time.sleep(delay)
            delay *= 2


def validate(shots):
    imgs = shots.get("images", [])
    ids = [i["id"] for i in imgs]
    if len(ids) != len(set(ids)):
        sys.exit("error: image ids must be unique")
    for i in imgs:
        cfg = settings(shots, i)
        if cfg["image_size"] not in SIZES:
            sys.exit(f"error: {i['id']}: image_size must be one of {sorted(SIZES)} (uppercase K)")
        if cfg["aspect_ratio"] not in ASPECTS:
            sys.exit(f"error: {i['id']}: aspect_ratio must be one of {sorted(ASPECTS)}")
        if len(cfg["refs"]) > MAX_REFS:
            sys.exit(f"error: {i['id']}: at most {MAX_REFS} refs")
        for r in cfg["refs"]:
            if not Path(r).is_file():
                sys.exit(f"error: {i['id']}: reference image not found: {r}")
    return imgs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shots", nargs="?", default="shots.json")
    ap.add_argument("--out-dir", default="public/gen/images")
    ap.add_argument("--only", help="comma-separated image ids")
    ap.add_argument("--force", action="store_true", help="ignore the cache")
    ap.add_argument("--dry-run", action="store_true", help="print requests and cost, call nothing")
    args = ap.parse_args()

    shots = json.loads(Path(args.shots).read_text(encoding="utf-8"))
    imgs = validate(shots)
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        missing = wanted - {i["id"] for i in imgs}
        if missing:
            sys.exit(f"error: unknown image ids: {', '.join(sorted(missing))}")
        imgs = [i for i in imgs if i["id"] in wanted]

    out = Path(args.out_dir)
    todo = []
    for i in imgs:
        jpg, meta = out / f"{i['id']}.jpg", out / f"{i['id']}.json"
        cfg = settings(shots, i)
        h = img_hash(cfg)
        cached = (not args.force and jpg.exists() and meta.exists()
                  and json.loads(meta.read_text(encoding="utf-8")).get("hash") == h)
        if not cached:
            todo.append((i, cfg, h))

    est = sum(PRICE.get(c["model"], {}).get(c["image_size"], 0) for _, c, _ in todo)
    print(f"{len(imgs)} image(s), {len(todo)} to generate, {len(imgs) - len(todo)} cached"
          + (f", about ${est:.2f}" if est else ""))
    if args.dry_run:
        for i, cfg, _ in todo:
            print(f"--- {i['id']}")
            print(json.dumps(build_request(cfg, with_data=False), indent=1))
        return
    if not todo:
        return

    load_env()
    from google import genai
    client = genai.Client(api_key=gemini_api_key())

    out.mkdir(parents=True, exist_ok=True)
    for i, cfg, h in todo:
        jpg, meta = out / f"{i['id']}.jpg", out / f"{i['id']}.json"
        print(f"  generating {i['id']}: {i['prompt'][:70]}...")
        data = generate(client, build_request(cfg))
        jpg.write_bytes(data)
        meta.write_text(json.dumps({
            "hash": h, "id": i["id"], "model": cfg["model"], "prompt": cfg["prompt"],
            "aspect_ratio": cfg["aspect_ratio"], "image_size": cfg["image_size"], "refs": cfg["refs"],
        }, indent=1), encoding="utf-8")
        print(f"    -> {jpg} ({len(data) // 1024} KB)")
    print("done. Next: python tools/video_veo.py (clips can start from these images)")


if __name__ == "__main__":
    main()
