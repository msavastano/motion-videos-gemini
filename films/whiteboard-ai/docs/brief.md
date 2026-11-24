# From Neuron to Transformer: brief

Everything here is a number or a rule. Every shot follows it.

## The film
- Logline: A dry-erase marker sketches a single artificial neuron on a clean whiteboard—and every diagram comes alive as we build up to neural networks, token prediction, and transformer self-attention.
- The takeaway (what the viewer feels or understands at the end): AI language models aren't magic; they are layers of simple weighted sums, vectors, and self-attention working together one token at a time.
- Audience and where it plays: Curious technical and general viewers on YouTube/web; 16:9 widescreen, readable down to 360 px mobile.

## Frame
- Size 1920 x 1080, 24 fps, 105 s (final duration locks to aligned `vo.json`). Loops: no.
- Lens and camera language: Locked-off overhead/slight-angle whiteboard camera (matching the Blender hand camera angle) with gentle code-side framing pans when diagrams expand across the board.

## World
- Palette (hex):
  - Whiteboard surface: `#F7F8FA` (porcelain enamel with subtle overhead sheen and seeded faint ghost smudges)
  - Primary dry-erase ink: `#1C2331` (deep charcoal black)
  - Secondary annotation ink: `#5B6577` (slate gray)
  - Primary accent ink: `#1D5FD6` (vivid cobalt blue — traveling signals, active weights, attention arcs, pipeline pulse)
  - Emphasis ink (sparingly for error nudge / chosen token / activation): `#D64527` (terracotta red)
- Light (direction, time of day, quality), shared by every maker: Soft overhead-left studio key light (`~45°` upper-left), casting a subtle crisp contact shadow from the Blender hand/marker onto the porcelain whiteboard surface.
- Materials and texture: Glossy porcelain whiteboard enamel with faint seeded dry-erase residue; slightly textured felt dry-erase ink strokes (`lineCap: 'round'`, subtle width jitter); realistic skin, fingernails, and matte-plastic dry-erase marker in Blender EEVEE.
- Grade (applied in code over everything): Subtle warm studio vignette (`0.14`), fine seeded grain (`0.015`), clean white-board contrast with `#1C2331` ink.

## Type
- Display face: `Space Grotesk` (600, bundled in `assets/fonts/space-grotesk-latin-600-normal.woff2`).
- UI/mono face: `JetBrains Mono` (500, bundled in `assets/fonts/jetbrains-mono-latin-500-normal.woff2`).
- At most 6–8 words per label group; text holds at least `(words / 3) + 0.5` s and reveals progressively in sync with the marker tip.

## Makers
- **Blender (`blender+code`, EEVEE RGBA)**: Realistic human hand holding a dry-erase marker (grip, drawing pose, lift-and-move, plus felt eraser swipe) rendered as a reusable 96-frame transparent PNG sequence library (`prep/frames_1080/` and `prep/frames_480/`) with exact marker-tip coordinates exported to `prep/hand_anchors.json` via `world_to_camera_view`.
- **Code (`index.html` + `src/film.js`)**: Pure `window.seek(t)` whiteboard engine drawing progressive ink strokes locked pixel-for-pixel to the Blender marker tip, felt eraser wipes between scenes, and living post-draw animations (pulsing neurons, traveling signals, dynamic weight thicknesses, sliding tokens, glowing attention arcs).
- **Gemini TTS (`tools/tts_gemini.py` + `tools/align.py`)**: Warm, informative narration (`Charon`, `gemini-3.8-flash-tts`), aligned to `vo.json` so every draw and animation lands on the spoken word.
- **Lyria 3 (`tools/music_lyria.py` + `tools/beats.py`)**: Light, curious, unobtrusive instrumental bed (`lyria-3-pro-preview`), measured with `beats.py` and sidechain-ducked under narration.
- **Synth / Foley (`audio.py` + `tools/sfx.mjs`)**: Marker squeaks timed to strokes, cap clicks, felt eraser swipes, and soft whooshes/blips when drawings come alive.

## Sound
- Voice: Gemini TTS (`gemini-3.8-flash-tts`), voice `Charon`, ~234 words (~105 s).
- Music: Lyria 3 Pro (`lyria-3-pro-preview`), 3 takes evaluated; 104–110 BPM light pizzicato / soft marimba / felt piano, sparse under narration, ducked via `mix.json`.
- Effects: Marker cap click at open/close, stroke-locked marker squeaks, felt eraser swipes at scene wipes, soft whooshes and harmonic blips when sketches animate.
- Loudness: `-14 LUFS`, true peak `-1 dBTP`.

## Budget
- Paid generation cap: `$5.00`   Render time cap: `2.0 h`

## Always banned
Centered title on a gradient; everything fading in; corner labels and frame borders; glow on UI chrome; generic particle bursts; linear easing on anything the eye follows; things scaling up from zero; text inside generated images or clips; invented quotes, numbers or product screens.
