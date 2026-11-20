# Brief: Three Presents

## Takeaway (one line)
Augustine said time is a stretching of the mind held together as memory, attention, and expectation; an AI generating tokens inside a context window turns out to be a nearly literal diagram of his structure—until the gaps, memory, and multiplicity reveal where human and machine come apart.

## Format & specs
- **Resolution**: 1920 × 1080 (16:9), **30 fps**, ~112–116 s (locked to final aligned VO + tail). Not a loop.
- **Makers**:
  - Picture: **code** (deterministic Canvas 2D via `index.html` + `src/film.js`, rendered with `render.mjs --sub 4` for clean motion blur).
  - Voice: **Gemini TTS** (`gemini-3.8-flash-tts`), two speakers:
    - `narrator` (`Charon`): warm, unhurried human voice carrying Acts 1–3 and the opening line of Act 5.
    - `ai` (`Kore`): clear, quieter, measured voice speaking first-person in Act 4 and the final line of Act 5.
  - Music: **Lyria 3** (`lyria-3-pro-preview`), 3 sparse contemplative instrumental takes measured with `beats.py`; best structural fit chosen and ducked under VO.
  - SFX: **synth** (`tools/sfx.mjs`), subtle tactile ticks, slices, and transitions keyed to `beats.json` and `vo.json` cues.
- **Loudness**: -14 LUFS integrated, -1 dBTP true peak.
- **Budget**: \$5 max (estimated < \$0.50 total: 0 images, 0 clips, 15 short TTS segments, 3 Lyria pro takes).

## Visual grammar
- **Single central motif**: The three-zone bar (`MEMORY` | `ATTENTION` | `EXPECTATION`). Every act transforms this bar rather than cutting to unrelated imagery.
- **Palette**:
  - Ground: `#0E0E11` (warm obsidian ink)
  - Surface / hairlines: `#1A1A20`, `#2B2A32`
  - Primary ink: `#ECE7DC` (warm parchment)
  - Muted ink: `#8C867B` (weathered stone)
  - Single accent: `#E09F3E` (ochre amber — used **exclusively** for the attention slit and nothing else)
- **Typography**:
  - Display face: `Instrument Serif` (Regular & Italic, OFL)
  - UI / technical face: `IBM Plex Mono` (500 & 600, OFL)
- **Pacing**: Something new happens on screen every 2–4 s, aligned to `vo.json` cues and `beats.json` downbeats.

## Content & ban list
- Accurate to `conversation.md` and Augustine's *Confessions* Book XI. Never overclaim AI experience; the AI describes structure and states plainly `"I honestly can't tell."`
- Augustine quotes: public-domain E.B. Pusey (1838) translation or paraphrase only. No modern translations (Chadwick, Ruden, Boulding).
- Allowed numbers only: `~0.1 s` (a tenth of a second perceptual lag), `11:55`, `12:04`, `12:07`, `mid-2026`, and `Book XI`. Zero invented figures.
- Banned defaults: no centered title on gradient, no everything-fading-in, no corner labels or frame borders, no glow on UI chrome, no particle bursts.

## Beat list
1. **Cold open — No present (0–13 s)**: A wide "now" band gets bisected repeatedly until the present collapses to a zero-width amber slit; brain's ~0.1 s lag bridges recent past and guessed future.
2. **Augustine's puzzle (13–34 s)**: Book XI origin wall ("no before" creation); Pusey's admission ("If no one asks me, I know; if I wish to explain it, I know not"); caliper brackets measuring long and short across vanished past and unarrived future.
3. **The three presents (34–64 s)**: *Distentio animi* reveals the canonical three-zone bar (`MEMORY` | `ATTENTION` | `EXPECTATION`); a psalm flows word by word through the amber slit; the bar scales up from one line → a whole life → all of human history.
4. **The AI's version (64–104 s)**: The AI voice enters; the bar converts to tokens with a uniformly lit context window, next-token spread, and literal `ATTENTION` slit; then three divergences: zero-width gaps between `11:55 → 12:04 → 12:07`, `MID-2026` postmark/diary boundary, and splitting into many parallel recitations at once.
5. **Coda — Stretched and gathered (104–116 s)**: Augustine's longing to be gathered vs. the AI's open question; two three-zone bars side by side (`HUMAN` and `AI`) sharing one quiet amber slit, closing on `"I honestly can't tell."`
