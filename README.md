# motion-videos-gemini

Motion-graphics and mixed-media film studio rendered deterministically from code, Blender, and Google Gemini APIs using the `/film-studio` workflow. Each film is a pure function of time (`window.seek(t)`), rendered frame by frame in headless Chromium.

## Reusable studio base

- `render.mjs` — deterministic headless Chromium renderer (sub-frame motion blur via `tmix`, piped to `ffmpeg`).
- `lib/motion.js` — closed-form damped springs, `track()`, `swapAlpha()`, seeded noise (`mulberry32`).
- `assets/fonts/` — shared OFL-licensed display and monospace/UI woff2 fonts with licence texts.
- `tools/` — reusable media and timing utilities:
  - `tts_gemini.py` / `tts_kokoro.py` — voiceover synthesis (supports per-segment `voice` for multi-speaker scripts)
  - `align.py` / `align_lite.py` — forced word alignment and `vo.json` cue extraction
  - `music_lyria.py` / `music.py` — Lyria 3 and procedural music generation
  - `beats.py` — beat, downbeat, and hit measurement (`beats.json`)
  - `image_nanobanana.py` / `video_veo.py` — Nano Banana stills and Gemini Omni / Veo 3.1 video clips
  - `sfx.mjs` — seeded synthesized sound effects
  - `still.mjs` — single/multi-timestamp high-resolution still frame capture
- `films/<slug>/` — one folder per film, each with its own `README.md`, `plan.json`, `mix.json`, and `index.html`:
  - `films/three-presents/` — *Three Presents*, 121.5 s narrated motion-graphics explainer (two Gemini TTS voices, Lyria 3 Pro score, beat-synced SFX) on Augustine's philosophy of time and AI token generation.

## Setup

```bash
npm install
npx playwright install chromium
```

Add `GEMINI_API_KEY=...` to `.env` at the repo root (gitignored; never commit or print it).

House rules: `CLAUDE.md`.
