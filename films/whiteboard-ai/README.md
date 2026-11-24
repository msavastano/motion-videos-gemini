# From Neuron to Transformer

A narrated whiteboard-style explainer that takes the viewer from a single artificial neuron to stacked neural network layers, token vectors, next-token prediction, and transformer self-attention—with every dry-erase stroke drawn in sync with a 3D Blender hand and coming alive once sketched. `99.63 s`, `1920x1080`, `24 fps`.

**Deliverables** (`out/`): [`final.mp4`](out/final.mp4), [`poster.png`](out/poster.png), [`contact.png`](out/contact.png), plus [`docs/script.md`](docs/script.md) and [`plan.json`](plan.json).

## The film

| time | picture | sound |
| --- | --- | --- |
| `0.00 – 16.35 s` | Cap pops off; Blender hand draws a single neuron (`x₁..x₃`, `w₁..w₃`, `Σ`, sigmoid activation, `out`). Sketch comes alive with traveling pulses and weight throbs. | Cap click off, `Charon` narration, marker squeaks, soft whoosh + harmonic blip at `neuron_alive` (`14.94 s`), sparse 105.5 BPM Lyria bed ducked under VO. |
| `16.35 – 33.80 s` | Board pans smoothly to a 3-layer network (`3 → 4 → 2`) and `Target` box. Forward cobalt wave sweeps across layers; terracotta error loop flows back and nudges connection widths. | Marker squeaks on nodes/connections, forward/training whooshes & blips at `23.24 s` and `30.61 s`. |
| `33.80 – 48.95 s` | Blender felt eraser wipes board clean in 3 diagonal passes; hand writes `"The cat sat on the"`, boxes tokens, draws `[0.82, -0.14, 0.51]` vector bars and semantic map. | 3-pass felt eraser swipe at `36.16 s`, marker strokes, living vector spring whoosh & blip at `47.48 s`. |
| `48.95 – 64.45 s` | Token sequence glides to top; hand sketches `LLM` block and ranked probability bars (`mat 72%`, `rug 14%`, `floor 6%`). `"mat"` locks in and loops back to predict `"."`. | Marker squeaks, `pick_mat` (`59.22 s`) and `loop_alive` (`61.61 s`) whooshes & tonal blips. |
| `64.45 – 83.25 s` | Eraser wipes clean; hand writes `"The animal didn't cross the street because it was too tired"`, draws arcs from `"it"` to `"animal"` (`0.84`) & `"street"` (`0.11`), and stacks `×N` transformer layers. | Eraser swipe at `67.18 s`, sentence/arc strokes, attention & layer stack blips (`77.81 s`, `80.36 s`). |
| `83.25 – 99.63 s` | Quick eraser wipe; hand redraws the complete end-to-end pipeline (`Words → Tokens → Vectors → Attention ×N → Next Token`), caps marker and exits while a cobalt pulse sweeps all stages. | Eraser swipe at `85.01 s`, cap-on click (`93.94 s`), final sweeping whoosh & resolution chord (`94.98 s`). |

## How it was made

- **code** (`index.html`, `src/whiteboard.js`, `src/film.js`, `src/layers.js`): Pure `window.seek(t)` whiteboard engine on HTML5 Canvas. Renders porcelain enamel background with seeded residue (`mulberry32`), organic dry-erase ink polylines, progressive typography, spatial `destination-out` eraser wipe masks, and living post-draw animations locked to `vo.json` cues.
- **Blender** (`blender/build_scene.py`, `blender/scene.blend`): Blender 5.3 EEVEE (`1600x1200`, 16 samples, transparent RGBA) models and renders the 96-frame reusable sprite library across 4 banks (`grip` `1..24`, `draw` `25..48`, `lift` `49..72`, `eraser` `73..96`) with a custom 16-bone tripod-grip hand rig and exports exact normalized marker-tip / eraser-pad screen coordinates to `prep/hand_anchors.json` via `world_to_camera_view`.
- **Voice, music, effects**: Narration generated with Google Gemini TTS (`tools/tts_gemini.py`, `gemini-3.8-flash-tts`, voice `Charon`) and forced-aligned via `tools/align.py --verify` (`vo.json`, `99.63 s`, 209 words, 26 cues). Music bed generated across 3 takes with Lyria 3 Pro (`tools/music_lyria.py`, `lyria-3-pro-preview`), measured with `tools/beats.py`, selecting `take1.mp3` (`105.47 BPM`). Synced whiteboard foley (cap clicks, dry-erase squeaks, felt eraser swipes, living whooshes & blips) synthesized in `audio.py` and mixed to `-14.2 LUFS` (`-1.8 dBTP`) via `mix.json`.

## Rebuild

```bash
# 1. Blender RGBA sprite library + hand_anchors.json (requires Blender 5.x + BlenderKit assets)
cd films/whiteboard-ai
blender -b --factory-startup --python blender/build_scene.py -- "$PWD/blender/scene.blend"
blender -b blender/scene.blend --python blender/render_frames.py -- final "$PWD/prep/frames_1080" --res 1600x1200 --samples 16 --transparent
ffmpeg -v error -y -i "prep/frames_1080/f%04d.png" -vf "scale=800:600" "prep/frames_480/f%04d.png"

# 2. Voice + alignment + music (cached on disk; only re-run if vo_script.json / music_prompt.json changes)
python ../../tools/tts_gemini.py vo_script.json
python ../../tools/align.py --verify
python ../../tools/music_lyria.py music_prompt.json
python ../../tools/beats.py audio/music/take1.mp3 --out beats.json

# 3. Synthesize foley, mix audio, render draft/final MP4, poster & contact sheet (from repo root)
cd ../..
python ~/.gemini/config/skills/film-studio/scripts/build.py films/whiteboard-ai final --jobs 3
python ~/.gemini/config/skills/film-studio/scripts/build.py films/whiteboard-ai sheet
```

## Generation cost

- **Gemini TTS (`gemini-3.8-flash-tts`)**: 6 segments (`95.6 s` raw speech) — a few cents (< `$0.05`).
- **Lyria 3 Pro (`lyria-3-pro-preview`)**: 3 takes (`~110 s` each) — a few cents (< `$0.25`).
- **Nano Banana / Veo**: `$0.00` (not used).
- **Total paid generation**: `< $0.30` (well under the `$5.00` budget).

## Assets and credits

| asset | author | source and licence |
| --- | --- | --- |
| `Stylized Hand` | 3D FLICK | BlenderKit (Free License); rigged & textured for realistic dry-erase grip in `blender/build_scene.py` |
| `Red whiteboard marker` | Master P | BlenderKit (Free License); re-materialed as charcoal/white dry-erase marker + cap |
| `Space Grotesk` (600) | Florian Karsten | Bundled local woff2 (`assets/fonts/OFL-SpaceGrotesk.txt`, SIL OFL 1.1) |
| `JetBrains Mono` (500) | JetBrains | Bundled local woff2 (`assets/fonts/OFL-JetBrainsMono.txt`, SIL OFL 1.1) |

Generated voice and music carry Google's invisible SynthID watermark.

## Choices made unattended

- After `"go"` at Gate 1, ran unattended through audio generation, Blender look-dev, draft critique rounds, and final 1080p delivery (`duration` locked from planned `105 s` to aligned `99.63 s` from `vo.json`, `poster` set to `97.2 s`).
- Re-rigged the BlenderKit `Stylized Hand` mesh with a 16-bone mirrored right-hand armature + extended `1.20 m` forearm sleeve at `1600x1200` so top-of-board writing never crops the sleeve inside the 16:9 frame.
- Selected Lyria `take1.mp3` (`105.47 BPM`) over `take2` (`139.7 BPM`) and `take3` (late first downbeat at `17.94 s`).

## What I'd improve next

- Add hand-modeled articulated fingers gripping the felt eraser as well, rather than a standalone 3D eraser prop.
- Add subtle calligraphic stroke-width pressure variation along curved Bezier arcs and individual letter glyphs.
