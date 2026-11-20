#!/usr/bin/env python3
"""
Generate every clip in shots.json, one MP4 per clip, with Gemini Omni (default) or Veo 3.1.

    python tools/video_veo.py                       # generate anything new or changed
    python tools/video_veo.py --only c01,c02        # just these clip ids
    python tools/video_veo.py --force               # regenerate everything
    python tools/video_veo.py --dry-run             # show requests and estimated cost, no API calls
    python tools/video_veo.py --parallel 3          # jobs in flight at once (default 2)

Needs:  pip install google-genai python-dotenv     (google-genai >= 2.19 for Gemini Omni)
Key:    GEMINI_API_KEY in .env (or the environment), or a cloud network secret. Never hard-code it.
        No free tier for either model family: billing must be on, and you pay per second of video.
        Run --dry-run first to see the estimate.

Models ("video_model" in shots.json, or "model" on one clip)
- gemini-omni-1.1-flash (default). 3-10 s clips at 360p, 720p, 1080p or 4k. 720p is the model's
  native size; 1080p and 4k are upscaled from it, so they are sharper to look at but not more
  detailed. 360p is a cheap draft. Takes first/last frames and image references.
- veo-3.1-generate-preview (best realism), veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview.
  4, 6 or 8 s clips at 720p, 1080p or 4k (1080p and 4k need 8 s; Lite has no 4k and no refs).

shots.json (shared with tools/image_nanobanana.py; see tools/shots.example.json)
{
  "video_model": "gemini-omni-1.1-flash",          // see Models above
  "aspect_ratio": "16:9",                          // "16:9" or "9:16"
  "video_resolution": "720p",                      // "360p" (Omni only), "720p", "1080p", "4k"
  "clip_seconds": 8,                               // Omni: 3-10; Veo: 4, 6 or 8
  "video_style": "Slow, steady camera. No text on screen.",  // appended to every clip prompt
  "images": [ ... ],                               // used by image_nanobanana.py
  "clips": [
    {"id": "c01", "prompt": "Slow push-in on the dome as the sky brightens.", "first_frame": "title_bg"},
    {"id": "c02", "prompt": "...", "first_frame": "title_bg", "last_frame": "assets/end.png"},
    {"id": "c03", "prompt": "<IMAGE_REF_0> walks into frame ...", "refs": ["mascot"], "seconds": 6}
  ]
}

Frames and refs
- "first_frame" / "last_frame" / "refs" take an image id from "images" (uses
  public/gen/images/<id>.jpg, so run image_nanobanana.py first) or a file path.
- "first_frame" alone animates from that image. Add "last_frame" to interpolate between two.
- "refs" (up to 3) keep a character or object consistent without fixing the first frame.
  Gemini Omni: name each one in the prompt as <IMAGE_REF_0>, <IMAGE_REF_1>, ... in refs order.
  Veo: not supported on Veo 3.1 Lite.

Prompt rules
- Describe motion and camera, not layout: titles, captions and graphics go on top in code.
- "negative_prompt" is a real field on Veo; Gemini Omni has none, so it is appended to the
  prompt as "Avoid: ...".
- Both families add their own audio. Mute the clip if the voiceover should be the only sound.
- Generated videos carry an invisible SynthID watermark.

Output goes to public/gen/video/<id>.mp4 (or --out-dir), with <id>.json next to it (Omni also
records the interaction id). Each clip is cached by a hash of its settings and the contents of
its frame/ref images, so regenerating an image also regenerates the clips built from it.
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DEFAULT_MODEL = "gemini-omni-1.1-flash"
LITE = "veo-3.1-lite-generate-preview"
VEO_SECONDS = {4, 6, 8}
OMNI_SECONDS = range(3, 11)
VEO_RESOLUTIONS = {"720p", "1080p", "4k"}
OMNI_RESOLUTIONS = {"360p", "720p", "1080p", "4k"}
ASPECTS = {"16:9", "9:16"}
# Rough USD per second of video (audio included), for --dry-run estimates only.
# Veo: published Gemini API rates, Oct 2026. Omni: Google's launch table as quoted in Oct 2026
# coverage (Google's pricing page bills Omni by output token). Check the pricing page.
PRICE = {
    "gemini-omni-1.1-flash": {"360p": 0.03, "720p": 0.10, "1080p": 0.15, "4k": 0.30},
    "veo-3.1-lite-generate-preview": {"720p": 0.05, "1080p": 0.08},
    "veo-3.1-fast-generate-preview": {"720p": 0.10, "1080p": 0.12, "4k": 0.30},
    "veo-3.1-generate-preview": {"720p": 0.40, "1080p": 0.40, "4k": 0.60},
}
POLL_SECONDS = 10


def is_omni(model):
    return model.startswith("gemini-omni")


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
    p = Path(path)
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.is_file() else "missing"


def resolver(shots, images_dir):
    ids = {i["id"] for i in shots.get("images", [])}
    def resolve(ref):
        return str(Path(images_dir) / f"{ref}.jpg") if ref in ids else ref
    return resolve


def settings(shots, clip, resolve):
    """Resolve per-clip settings over the file-level defaults."""
    style = clip.get("style")
    style = (shots.get("video_style") or "") if style is None else style
    prompt = clip["prompt"].strip()
    if style:
        prompt = f"{prompt} {style.strip()}"
    return {
        "model": clip.get("model") or shots.get("video_model") or DEFAULT_MODEL,
        "prompt": prompt,
        "seconds": int(clip.get("seconds") or shots.get("clip_seconds") or 8),
        "resolution": clip.get("resolution") or shots.get("video_resolution") or "720p",
        "aspect_ratio": clip.get("aspect_ratio") or shots.get("aspect_ratio") or "16:9",
        "negative_prompt": clip.get("negative_prompt") or shots.get("negative_prompt") or "",
        "person_generation": clip.get("person_generation") or "",
        "first_frame": resolve(clip["first_frame"]) if clip.get("first_frame") else "",
        "last_frame": resolve(clip["last_frame"]) if clip.get("last_frame") else "",
        "refs": [resolve(r) for r in clip.get("refs") or []],
    }


def clip_hash(cfg):
    key = dict(cfg)
    for k in ("first_frame", "last_frame"):
        if cfg[k]:
            key[k] = [cfg[k], file_hash(cfg[k])]
    key["refs"] = [[r, file_hash(r)] for r in cfg["refs"]]
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:16]


def validate(shots, clips, resolve):
    ids = [c["id"] for c in clips]
    if len(ids) != len(set(ids)):
        sys.exit("error: clip ids must be unique")
    for c in clips:
        cfg, cid = settings(shots, c, resolve), c["id"]
        if cfg["aspect_ratio"] not in ASPECTS:
            sys.exit(f"error: {cid}: aspect_ratio must be 16:9 or 9:16")
        if len(cfg["refs"]) > 3:
            sys.exit(f"error: {cid}: at most 3 refs")
        if cfg["last_frame"] and not cfg["first_frame"]:
            sys.exit(f"error: {cid}: last_frame needs a first_frame")
        if is_omni(cfg["model"]):
            if cfg["seconds"] not in OMNI_SECONDS:
                sys.exit(f"error: {cid}: {cfg['model']} takes 3-10 seconds")
            if cfg["resolution"] not in OMNI_RESOLUTIONS:
                sys.exit(f"error: {cid}: resolution must be one of {sorted(OMNI_RESOLUTIONS)}")
            missing = [f"<IMAGE_REF_{i}>" for i in range(len(cfg["refs"])) if f"<IMAGE_REF_{i}>" not in cfg["prompt"]]
            if missing:
                sys.exit(f"error: {cid}: name each ref in the prompt ({', '.join(missing)} missing)")
            if cfg["person_generation"]:
                print(f"warning: {cid}: person_generation is a Veo setting; ignored for {cfg['model']}",
                      file=sys.stderr)
            continue
        if cfg["seconds"] not in VEO_SECONDS:
            sys.exit(f"error: {cid}: seconds must be 4, 6 or 8 on Veo")
        if cfg["resolution"] not in VEO_RESOLUTIONS:
            sys.exit(f"error: {cid}: resolution must be one of {sorted(VEO_RESOLUTIONS)} on Veo")
        if cfg["resolution"] != "720p" and cfg["seconds"] != 8:
            sys.exit(f"error: {cid}: {cfg['resolution']} needs 8-second clips on Veo")
        if cfg["model"] == LITE and cfg["resolution"] == "4k":
            sys.exit(f"error: {cid}: Veo 3.1 Lite has no 4k")
        if cfg["model"] == LITE and cfg["refs"]:
            sys.exit(f"error: {cid}: Veo 3.1 Lite doesn't take refs; use first_frame or another model")
        if cfg["refs"] and cfg["first_frame"]:
            print(f"warning: {cid} sets both refs and first_frame; Veo may reject the combination",
                  file=sys.stderr)


# --- Veo: models.generate_videos, a long-running operation --------------------------------

def load_image(path):
    from google.genai import types
    mime = mimetypes.guess_type(path)[0] or "image/png"
    return types.Image.from_file(location=path, mime_type=mime)


def build_veo_request(cfg, with_images=True):
    """Keyword arguments for client.models.generate_videos."""
    conf = {
        "number_of_videos": 1,
        "duration_seconds": cfg["seconds"],
        "resolution": cfg["resolution"],
        "aspect_ratio": cfg["aspect_ratio"],
    }
    if cfg["negative_prompt"]:
        conf["negative_prompt"] = cfg["negative_prompt"]
    if cfg["person_generation"]:
        conf["person_generation"] = cfg["person_generation"]
    img = load_image if with_images else (lambda p: f"<{p}>")
    if cfg["last_frame"]:
        conf["last_frame"] = img(cfg["last_frame"])
    if cfg["refs"]:
        conf["reference_images"] = [{"image": img(r), "reference_type": "asset"} for r in cfg["refs"]]
    req = {"model": cfg["model"], "prompt": cfg["prompt"], "config": conf}
    if cfg["first_frame"]:
        req["image"] = img(cfg["first_frame"])
    return req


def submit_veo(client, req, retries=4):
    from google.genai import types
    req = dict(req, config=types.GenerateVideosConfig(**req["config"]))
    delay = 2.0
    for attempt in range(1, retries + 1):
        try:
            return client.models.generate_videos(**req)
        except Exception as e:  # network, quota, bad request, etc.
            if attempt == retries:
                raise
            print(f"    attempt {attempt} failed ({e}); retrying in {delay:.0f}s", file=sys.stderr)
            time.sleep(delay)
            delay *= 2


def run_veo(client, cfg, mp4):
    op = submit_veo(client, build_veo_request(cfg))
    while not op.done:
        time.sleep(POLL_SECONDS)
        op = client.operations.get(op)
    if op.error:
        raise RuntimeError(f"Veo error: {op.error}")
    resp = op.response or op.result
    vids = getattr(resp, "generated_videos", None) if resp else None
    if not vids:
        reasons = getattr(resp, "rai_media_filtered_reasons", None) if resp else None
        raise RuntimeError(f"no video returned (safety filter: {reasons})" if reasons
                           else "no video returned")
    client.files.download(file=vids[0].video, destination=str(mp4))
    return {}


# --- Gemini Omni: interactions.create, which returns when the video is ready --------------

def build_omni_request(cfg, with_images=True):
    """Keyword arguments for client.interactions.create."""
    def image(path):
        mime = mimetypes.guess_type(path)[0] or "image/png"
        data = base64.b64encode(Path(path).read_bytes()).decode() if with_images else f"<{path}>"
        return {"type": "image", "data": data, "mime_type": mime}

    blocks, prompt = [], cfg["prompt"]
    # frames go first, in order, then refs; the prompt names them with these tags
    if cfg["first_frame"]:
        blocks.append(image(cfg["first_frame"]))
        tags = "<FIRST_FRAME>"
        if cfg["last_frame"]:
            blocks.append(image(cfg["last_frame"]))
            tags += " <LAST_FRAME>"
        if "<FIRST_FRAME>" not in prompt:
            prompt = f"{tags} {prompt}"
    blocks += [image(r) for r in cfg["refs"]]
    if cfg["negative_prompt"]:
        prompt = f"{prompt} Avoid: {cfg['negative_prompt'].rstrip('.')}."
    blocks.append({"type": "text", "text": prompt})
    fmt = {
        "type": "video",
        "delivery": "uri",
        "aspect_ratio": cfg["aspect_ratio"],
        "duration": f"{cfg['seconds']}s",
        "resolution": cfg["resolution"],
    }
    return {"model": cfg["model"], "input": blocks, "response_format": fmt}


def run_omni(client, cfg, mp4):
    interaction = client.interactions.create(**build_omni_request(cfg))
    video = getattr(interaction, "output_video", None)
    if video is None or not (getattr(video, "uri", None) or getattr(video, "data", None)):
        raise RuntimeError(f"no video returned (interaction {interaction.id}, status "
                           f"{getattr(interaction, 'status', '?')})")
    data = base64.b64decode(video.data) if getattr(video, "data", None) else client.files.download(file=video.uri)
    mp4.write_bytes(data)
    return {"interaction_id": interaction.id}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shots", nargs="?", default="shots.json")
    ap.add_argument("--out-dir", default="public/gen/video")
    ap.add_argument("--images-dir", default="public/gen/images", help="where image ids resolve")
    ap.add_argument("--only", help="comma-separated clip ids")
    ap.add_argument("--force", action="store_true", help="ignore the cache")
    ap.add_argument("--dry-run", action="store_true", help="print requests and cost, call nothing")
    ap.add_argument("--parallel", type=int, default=2, help="jobs in flight at once")
    ap.add_argument("--timeout", type=int, default=900,
                    help="seconds to wait for one Gemini Omni clip (4k takes longest; default 900)")
    args = ap.parse_args()

    shots = json.loads(Path(args.shots).read_text(encoding="utf-8"))
    resolve = resolver(shots, args.images_dir)
    clips = shots.get("clips", [])
    validate(shots, clips, resolve)
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        missing = wanted - {c["id"] for c in clips}
        if missing:
            sys.exit(f"error: unknown clip ids: {', '.join(sorted(missing))}")
        clips = [c for c in clips if c["id"] in wanted]

    out = Path(args.out_dir)
    todo = []
    for c in clips:
        mp4, meta = out / f"{c['id']}.mp4", out / f"{c['id']}.json"
        cfg = settings(shots, c, resolve)
        h = clip_hash(cfg)
        cached = (not args.force and mp4.exists() and meta.exists()
                  and json.loads(meta.read_text(encoding="utf-8")).get("hash") == h)
        if not cached:
            todo.append((c, cfg, h))

    secs = sum(cfg["seconds"] for _, cfg, _ in todo)
    est = sum(PRICE.get(cfg["model"], {}).get(cfg["resolution"], 0) * cfg["seconds"] for _, cfg, _ in todo)
    print(f"{len(clips)} clip(s), {len(todo)} to generate ({secs}s), {len(clips) - len(todo)} cached"
          + (f", about ${est:.2f}" if est else ""))

    missing_files = sorted({p for _, cfg, _ in todo
                            for p in [cfg["first_frame"], cfg["last_frame"], *cfg["refs"]]
                            if p and not Path(p).is_file()})
    if args.dry_run:
        for c, cfg, _ in todo:
            print(f"--- {c['id']} ({cfg['model']})")
            build = build_omni_request if is_omni(cfg["model"]) else build_veo_request
            print(json.dumps(build(cfg, with_images=False), indent=1))
        for p in missing_files:
            print(f"note: {p} doesn't exist yet (run image_nanobanana.py first?)", file=sys.stderr)
        return
    if not todo:
        return
    if missing_files:
        sys.exit("error: missing frame/ref images: " + ", ".join(missing_files)
                 + "\n       run python tools/image_nanobanana.py first, or fix the paths")

    load_env()
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=gemini_api_key(), http_options=types.HttpOptions(api_version="v1beta", timeout=args.timeout * 1000))  # google-genai 3 defaults to v1, where Omni 404s

    out.mkdir(parents=True, exist_ok=True)

    def job(c, cfg, h):
        mp4, meta = out / f"{c['id']}.mp4", out / f"{c['id']}.json"
        t0 = time.time()
        print(f"  submitting {c['id']} ({cfg['model']}, {cfg['seconds']}s {cfg['resolution']}): "
              f"{c['prompt'][:60]}...")
        extra = (run_omni if is_omni(cfg["model"]) else run_veo)(client, cfg, mp4)
        meta.write_text(json.dumps({
            "hash": h, "id": c["id"], "model": cfg["model"], "prompt": cfg["prompt"],
            "seconds": cfg["seconds"], "resolution": cfg["resolution"],
            "aspect_ratio": cfg["aspect_ratio"], "first_frame": cfg["first_frame"],
            "last_frame": cfg["last_frame"], "refs": cfg["refs"], **extra,
        }, indent=1), encoding="utf-8")
        return f"    -> {mp4} (took {time.time() - t0:.0f}s)"

    failed = []
    with ThreadPoolExecutor(max_workers=max(1, args.parallel)) as pool:
        futures = {pool.submit(job, c, cfg, h): c["id"] for c, cfg, h in todo}
        for f in as_completed(futures):
            try:
                print(f.result())
            except Exception as e:
                print(f"    {futures[f]} failed: {e}", file=sys.stderr)
                failed.append(futures[f])

    if failed:
        sys.exit(f"done with failures: {', '.join(failed)} (re-run to retry just those)")
    print("done. Clips are in " + str(out))


if __name__ == "__main__":
    main()
