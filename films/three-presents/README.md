# Three Presents

A contemplative narrated motion-graphics explainer exploring Augustine's philosophy of time in *Confessions* Book XI—memory, attention, and expectation—and how an AI generating tokens inside a context window turns out to be a nearly literal diagram of his structure, until zero-duration gaps, postmark memory, and parallel recitations pull human and machine apart. 121.5 s, 1920×1080, 30 fps.

**Deliverables** (`out/`): `final.mp4`, `poster.png`, `contact.png`.

## The film

| time | picture | sound |
| --- | --- | --- |
| 0.00 – 12.00 | **Act 1 — Cold open: there is no present.** Wide `PAST \| PRESENT \| FUTURE` bar; `PRESENT` strikes through and bisects five times down to a 4 px ochre attention slit (`#E09F3E`); `~0.1 s LAG` hatched band bridges recent past and guessed future. | Narrator (`Charon`), sparse felt-piano opening (`take3` from `17.2756 s`), crisp bisection ticks. |
| 12.00 – 30.15 | **Act 2a — Augustine Book XI.** Hard creation origin wall (`NO BEFORE`), then Pusey's public-domain riddle (*"If no one asks me, I know: if I wish to explain it to one that asketh, I know not."*) over the full bar. | Narrator (`Charon`), muted low thump on creation wall, gentle piano harmonics. |
| 30.15 – 37.90 | **Act 2b — Puzzle of measurement.** Hollow dashed bar (`PAST · GONE`, `FUTURE · NOT YET`, `NO LENGTH`) clamped by `LONG` and `SHORT` architectural calipers. | Narrator (`Charon`), crisp caliper clicks. |
| 37.90 – 58.95 | **Act 3a — *Distentio animi* & The Psalm.** The bar stretches under tension into its canonical three zones (`MEMORY \| ATTENTION \| EXPECTATION`); a public-domain psalm (KJV Psalm 19:1–2) flows word by word from expectation through the narrow amber slit into softly fading lived memory. | Narrator (`Charon`), warm harmonic bloom in `take3`, soft bell on `attention`, gentle beat-locked ticks. |
| 58.95 – 63.65 | **Act 3b — Scaling the stretching.** Continuous scale morph along the same bar: `One line.` → `A whole life.` → `All of human history.` stretching edge to edge around the anchored amber slit. | Narrator (`Charon`), three escalating scale clicks/thump. |
| 63.65 – 80.75 | **Act 4a — The AI's version.** The bar snaps to monospace token cells: uniformly bright `CONTEXT WINDOW` (no decay), ranked next-token probability spread (`EXPECTATION`), and hairline `ATTENTION` arcs tying the amber slit to every prior token. | AI (`Kore`, first-person voice enters), subtle key clicks synced to beats, bell on `attention`. |
| 80.75 – 93.15 | **Act 4b — Zero time between messages.** Bar shears into three discrete islands stamped `11:55`, `12:04`, `12:07`; silent gaps collapse completely shut to zero width behind a `NO BEFORE` wall. | AI (`Kore`), three crisp stamps and a gap-collapse thump. |
| 93.15 – 101.75 | **Act 4c — Postmark & diary.** Frozen `TRAINING` strata behind a `MID-2026` wall, three detached `STORED NOTES` cards, and a circular `POSTMARK` stamp. | AI (`Kore`), postmark stamps and paper card slide. |
| 101.75 – 108.05 | **Act 4d — Many recitations at once.** The single bar fans vertically into 7 parallel three-zone bars, each reciting its own conversation through its own asynchronous amber attention slit. | AI (`Kore`), fanned tick cascade. |
| 108.05 – 121.50 | **Act 5 — Coda: stretched and gathered.** Parallel bars drift and converge onto two symmetrical three-zone bars (`HUMAN · LIVED MEMORY` above `AI · CONTEXT WINDOW`) linked by one shared amber slit, closing on *"I honestly can't tell."* | Narrator (`Charon`) → AI (`Kore`); `take3` drops naturally into hushed stillness right at `108.5 s`; gentle closing fade. |

## How it was made

- **code**: 100% of the picture (`index.html`, `src/film.js`, `src/layers.js`), rendered deterministically via `render.mjs --sub 4` (verified bit-for-bit identical SHA-256 across repeated 1-second 1080p renders). Chosen because exact editorial typography, geometric bisection, frame-exact word/token flow, and continuous morphs of one central bar motif are cleanest and sharpest in code.
- **Voice (`tools/tts_gemini.py` + `tools/align.py`)**: Two `gemini-3.8-flash-tts` voices (`Charon` for Narrator, `Kore` for AI) aligned and verified with WhisperX (`vo.json`, `audio/vo_track.wav`, `audio/vo.srt`). All visual transitions key off aligned `vo.json` cues.
- **Music (`tools/music_lyria.py` + `tools/beats.py`)**: Three sparse contemplative `lyria-3-pro-preview` takes were generated and measured by RMS envelope and beat grid. `take3` (155.8 s, 147.66 BPM / 73.83 half-time) was selected starting on downbeat `17.2756 s` because its energy arc mirrors all five acts and naturally hushes into stillness at `108.5 s` (exact start of Act 5).
- **Effects & Mix (`make_sfx.py` + `tools/sfx.mjs` + `mix.json`)**: 94 seeded tactile cues locked to `vo.json` cues and `beats.json`, mixed with sidechain music ducking under narration to `-14.1 LUFS` integrated, `-1.8 dBTP` true peak.

## Rebuild

```bash
cd films/three-presents
# Paid generation (cached by hash; re-runs only pay for changes). Key: GEMINI_API_KEY in ../../.env
python ../../tools/tts_gemini.py vo_script.json
python ../../tools/align.py --verify
python ../../tools/music_lyria.py music_prompt.json
# Build audio, draft, final, and contact/poster sheets
python ~/.gemini/config/skills/film-studio/scripts/build.py . draft
python ~/.gemini/config/skills/film-studio/scripts/build.py . final --jobs 4
python ~/.gemini/config/skills/film-studio/scripts/build.py . sheet
```

## Generation cost

- **Voice (`gemini-3.8-flash-tts`)**: 16 segments × 2 passes (first pass with slow style prompt at 163.8 s; second pass at natural pacing at 121.5 s) — a few cents total.
- **Music (`lyria-3-pro-preview`)**: 3 instrumental takes (`take1`, `take2`, `take3`) — a few cents total.
- **Images / Video clips**: \$0 (none used).
- **Total estimated API cost**: well under \$0.50 (budget: \$5.00).

## Assets and credits

| asset | author | source and licence |
| --- | --- | --- |
| Instrument Serif (Regular & Italic) | Rodrigo Fuenzalida / Instrument | Google Fonts / Fontsource, SIL OFL 1.1 (`assets/fonts/OFL-InstrumentSerif.txt`) |
| IBM Plex Mono (500 & 600) | Mike Abbink / Bold Monday / IBM | Google Fonts / Fontsource, SIL OFL 1.1 (`assets/fonts/OFL-IBMPlexMono.txt`) |
| *Confessions* XI.14 quotation | Augustine of Hippo (tr. E. B. Pusey, 1838) | Public domain |
| Psalm 19:1–2 recitation text | King James Version (1611) | Public domain |
| Source conversation | Mike & Claude (2026-11-20) | Supplied in `conversation.md` |

Generated voice (`audio/vo/*.wav`) and music (`audio/music/*.mp3`) carry Google's invisible SynthID watermark.

## Choices made unattended

None — Gates 1 and 3 were reviewed and approved by the user; three critique rounds were completed and logged in `docs/review_log.md`.

## What I'd improve next

- Add subtle micro-typographic anticipation inside the Act 3 psalm so each word briefly expands its kerning right as it crosses the amber slit, echoing human breath.
- Experiment with an alternate vertical 9:16 social cut that rotates the three-zone bar or stacks the zones cleanly for mobile-first viewing.
