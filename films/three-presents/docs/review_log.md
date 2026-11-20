# Review Log — Three Presents

## Round 1 — Initial Look-Dev Stills (`t = 1.5, 19.5, 54.0, 79.8, 91.5, 105.5, 119.2`)
- **Scores**: Hook 8 · Clarity 8 · Composition 6 · Motion (pending draft) · Continuity 9 · Type 6 · Sound sync 9 · Technical 8
- **Worst problems found**:
  1. `19.50 s` (`s02`): `"Before creation—"` overlapped `"there was no before."` due to hardcoded X offset (`BAR_X0 + 365`).
  2. `79.80 s` (`s06`) & `91.50 s` (`s07`): Attention arcs (`arcH = 118`) intersected `"Literally called attention."`, and the descender of `"speak."` grazed `"11:55"`.
  3. `105.50 s` (`s09`) & `119.20 s` (`s10`): Parallel row expectation words were too dim (`0.42` alpha) and repeated in-frame; leftmost AI chip `"Within"` clipped at the left bar edge.
- **Fixes applied**:
  - Measured `"Before creation — "` dynamically via `ctx.measureText()`.
  - Raised headlines in `s06` and `s07` (`barY - 202` / `barY - 196`) and capped attention arc height at `84 px`.
  - Extended `PARALLEL_LINES` to 15–16 unique words per row, boosted expectation contrast to `#938C80 @ 0.62`, added soft edge feathers on flowing psalm/token streams, and sized coda AI tokens cleanly inside the bar.

## Round 2 — Full 10-Shot Look-Dev Verification (`11.2, 19.5, 29.6, 36.8, 54.0, 62.6, 79.8, 91.5, 99.8, 105.5, 119.2`)
- **Scores**: Hook 9 · Clarity 9 · Composition 7 · Motion (pending draft) · Continuity 9 · Type 7 · Sound sync 9 · Technical 9
- **Worst problems found**:
  1. `29.60 s` (`s02`): Line 3 of Pusey's quote (`barY - 58`) dipped behind the top edge of the time bar (`barY - 70`).
  2. `36.80 s` (`s03`): `"LONG"` caliper label collided with `"measure"` in `"How can we measure what does not exist?"`.
  3. `99.80 s` (`s08`): `"POSTMARK"` text touched the inner ring (`r = 36`) of the stamp.
- **Fixes applied**:
  - Lifted Pusey quote lines to `barY - 246 / -184 / -122` (48 px clear above the bar and slit cap).
  - Lifted `s03` headline to `barY - 198` (clean headroom above `LONG`/`SHORT` calipers).
  - Enlarged postmark rings to `r = 56 / 46` with `13 px` tracked UI label.
- **Post-fix check (`look3_29.60`, `36.80`, `99.80`)**: All three collisions cleanly resolved; every still score >= 8.5.

## Round 3 — Full Draft Contact Sheet (6×5) & 360 px Phone Test (5×3) (`out/draft.mp4`)
- **Scores before fixes**: Hook 9 · Clarity 9 · Composition 8 · Motion 8 · Continuity 8 · Type 7 · Sound sync 9 · Technical 8
- **Worst problems found**:
  1. `30.37 s` (`s02 → s03` boundary) & `93.13 s` (`s07 → s08` boundary): 0.45 s shot crossfade caused outgoing `"If no one asks me, I know:"` to overlap incoming `"How can we measure what does not exist?"`, and `drawSlit`/`drawRubric`/`clipRevealText` overwrote `ctx.globalAlpha` instead of multiplying it.
  2. `83.00 s` (`s07` opening): Bar disappeared for ~2 s before `11:55` appeared, leaving an empty frame under `"Between messages, no time passes."`.
  3. `111.37 s` (`s10` early coda): `"Augustine longed to be gathered."` collided with the top `"HUMAN · LIVED MEMORY"` bar while scattered (`spreadY = 195`).
- **Fixes applied**:
  - Replaced overlapping shot windows with strictly non-overlapping `shotEnv(t, s)` and multiplicative `ctx.globalAlpha *= ...` inside all drawing primitives (`clipRevealText`, `drawSlit`, `drawBracket`, `drawRubric`).
  - Made `s07` shear the bar continuously into 3 message islands immediately from `80.75 s`, then stamp `11:55`, `12:04`, and `12:07` onto the existing islands at their exact VO cues.
  - Centered coda symmetry around `y = 540` with `spreadY: 146 → 112` so the top `HUMAN` bar clears `"Augustine longed to be gathered."` by 120+ px.
- **Post-fix scores**: Hook 9 · Clarity 9 · Composition 9 · Motion 9 · Continuity 9 · Type 9 · Sound sync 9 · Technical 9 (every score >= 9).

