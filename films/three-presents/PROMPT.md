# Prompt: "Three Presents" — a philosophy of time for humans and AI

Paste this into Claude Code from the repo root. The source material is `films/three-presents/conversation.md`. Read it first.

---

Make a narrated motion-graphics explainer film in `films/three-presents/`. It sets out one philosophy of time that covers both a human mind and an AI model, built on Augustine's *Confessions* Book XI. Follow the house rules in CLAUDE.md. Use the narrative explainer workflow (motion-explainer-vid) if it's available.

## The idea in one line
Augustine said time isn't out in the world but is a stretching of the mind, held together as memory, attention and expectation. An AI that writes one token at a time, with its whole context in view, turns out to be a nearly literal diagram of his idea. The film shows how the two kinds of mind line up and where they come apart.

## Format
- 1920 x 1080, 30 fps, about 100–120 s. Not a loop.
- Two voices, both made with `tools/tts_gemini.py`:
  - **Narrator**: a warm, unhurried human voice. Carries Augustine and the human side.
  - **The AI**: a clear, quieter voice. Speaks only in Act 4 and the coda, in the first person, taken from Claude's last answer in the conversation.
- Score: sparse and contemplative (`tools/music_lyria.py`). Sound hits on the measured beat grid, as always.

## Structure (draft; tighten in the beat map)
1. **Cold open: there is no present** (~12 s). The viewer's half-memory: "there's no present, only past and future." A "now" line gets sliced finer and finer until it has no width.
2. **Augustine's puzzle** (~20 s). What was God doing before creation? There was no "before." If nobody asks him what time is, he knows; if someone asks, he doesn't. The past is gone, the future isn't here, the present has no length, and yet we still measure long and short.
3. **The three presents** (~30 s). *Distentio animi.* The hero visual is the psalm: a line of text in three zones, unread (expectation), a narrow bright slit (attention) and already read (memory). The words flow through the slit. Then scale it up: one line, then a whole life, then all of history.
4. **The AI's version** (~30 s). The same three-zone image, but now the text is tokens being generated. The context window is memory and is all visible at once. A spread of possible next tokens is expectation. The token being chosen is attention, and the mechanism really is called "attention." Then the differences:
   - Between messages, no time passes for it: timestamps 11:55 → 12:04 → 12:07 with nothing in the gaps.
   - Its memory works like a postmark or a diary it doesn't remember writing, not like lived memory.
   - It runs as many recitations at once: the single slit splits into many parallel ones.
5. **Coda: stretched and gathered** (~15 s). For Augustine, *distentio* is also being scattered, and he longs to be gathered. For the AI it's an open question whether any of this is felt at all. End on the two three-zone bars side by side, one human and one machine, and an honest "I can't tell."

## Content rules
- Stay accurate to the conversation and to Augustine. Don't overclaim AI experience. The AI voice describes structure and says plainly that it doesn't know whether anything is felt.
- Augustine quotes: use the public-domain Pusey translation, or paraphrase. Don't quote modern translations (Chadwick, Ruden, Boulding) on screen or in the voiceover.
- No invented numbers. The only figures allowed are the ones in the conversation (about a tenth of a second for perceptual lag; the three timestamps; a training cutoff of mid-2026).
- Keep on-screen words few. The narration carries the argument and the visuals carry the structure.

## Visual direction (starting point; the critique rounds can change it)
- One central motif all the way through: the three-zone bar (expectation | attention | memory). Every act transforms it rather than cutting to new imagery.
- One display face, one UI face, one accent color. The accent is the attention slit and nothing else.
- Something new every 2–4 s; no fade-everything-in; no particle bursts; no glow.

## Deliverables
- `README.md`, `vo_script.json` (two speakers), `beats.json`, `index.html`, and a render in `out/`.
- Run at least one critique round before showing anything.
