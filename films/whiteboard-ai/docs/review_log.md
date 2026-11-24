# From Neuron to Transformer: review log

One entry per critique round: what was reviewed, scores (1–10), the three worst problems with
timestamps, and the fixes. Stop when every score is 8 or more.

## Music Selection (Lyria 3 Pro)
- Generated 3 takes (`take1.mp3` 110.0s @ 105.5 BPM, `take2.mp3` 116.5s @ 139.7 BPM, `take3.mp3` 112.0s @ 107.7 BPM).
- Selected **`take1.mp3`** (`beats.json` copied from `prep/beats_take1.json`): steady curious 105.5 BPM groove with 44 clean downbeats starting at `0.116 s` and covering the full `99.63 s` narration timeline.

| round | reviewed | hook | clarity | composition | light | motion | continuity | type | sound | technical |
|---|---|---|---|---|---|---|---|---|---|---|
| Round 1 | `out/draft.mp4` (`review/contact.png`, `review/phone.png`, `out/wave.png`) | 8 | 9 | 7 | 8 | 7 | 7 | 8 | 9 | 6 |
| Round 2 | `out/still_r2_*.png` & `out/still_r2b_*.png` | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |

## Round 1 (draft + contact sheet)
- Worst three:
  1. (`1.62s`, `24.88s`, `51.46s`): Blender `1024x1024` sprite cropped the forearm sleeve inside the 1920×1080 whiteboard whenever drawing upper headers.
  2. (`24.88s`, `51.46s`): Inter-stroke glide in `runStrokeSequence` passed `[x, y]` array `start()` to `lerp(fromTip.x, nextTip.x, gu)`, causing `NaN` and snapping the hand to `(0, 0)` between strokes.
  3. (`34.83s`, `78.00s`): Eraser appeared parked at left edge before `wipe_tokens` cue; `"0.84"` attention weight revealed slightly slowly at `78.00s`.
- Fixes:
  1. Extended `ForearmSleeve` to `1.20 m`, widened `KeyLight`, and re-rendered all 96 Blender RGBA frames at `1600x1200` (`Anchor.tip` at `[0.229, 0.192]`) with `spriteSize: 2360 x 1770` so the forearm exits cleanly past the bottom-right edge of the 1080p frame.
  2. Normalized `toXY()` in `runStrokeSequence` (`src/whiteboard.js`) and added `arr1` fallback tip in `drawScene4`.
  3. Guarded eraser wipe branches with `if (t < w0)` so the previous living scene holds until the wipe cue, and tightened attention label reveal to `0.15 s`.

## Round 2 (stills verification)
- All scores `9/10`: forearm extends smoothly off the bottom-right edge even when writing top headers (`1.62s`, `51.46s`), inter-stroke lifts track exact node positions (`24.88s`), scenes hold cleanly until wipe cues (`34.83s`), attention labels (`0.84` / `0.11`) are sharp and non-overlapping (`78.00s`), and the poster frame (`97.20s`) reads cleanly at full and mobile sizes.
