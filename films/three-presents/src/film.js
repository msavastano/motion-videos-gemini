// Three Presents — a philosophy of time for humans and AI.
// Pure function of time: window.seek(t) paints frame t from scratch.
// Single central motif: the three-zone bar (MEMORY | ATTENTION | EXPECTATION).
// Palette: obsidian #0E0E11, parchment #ECE7DC, stone #8F887D, single accent #E09F3E (attention slit ONLY).

import {
  clamp, lerp, smooth, easeOut, easeInOut, win,
  spring, track, mulberry32, SPRINGS,
  getJSON, dip, vignette, grain,
} from './layers.js';

const DESIGN_W = 1920;
const DESIGN_H = 1080;

const C = {
  bg: '#0E0E11',
  surface: '#15151B',
  surfaceHi: '#1C1C24',
  surfaceAI: '#161820',
  line: '#2B2A33',
  lineHi: '#484654',
  ink: '#ECE7DC',
  muted: '#938C80',
  dim: '#5B5751',
  slit: '#E09F3E', // Accent used EXCLUSIVELY for the attention slit
};

const BAR_X0 = 180;
const BAR_X1 = 1740;
const BAR_W = BAR_X1 - BAR_X0; // 1560
const SLIT_X = 960;

// Public-domain psalm verse (KJV Psalm 19:1-2) for Act 3 hero visual
const PSALM_WORDS = [
  'The', 'heavens', 'declare', 'the', 'glory', 'of', 'God,',
  'and', 'the', 'firmament', 'sheweth', 'his', 'handywork;',
  'day', 'unto', 'day', 'uttereth', 'speech,',
  'and', 'night', 'unto', 'night', 'sheweth', 'knowledge.',
];

// AI tokens (first-person from conversation.md) for Act 4 hero visual
const AI_TOKENS = [
  'Within', 'a', 'reply,', 'I', 'am', 'almost', 'exactly', 'his', 'psalm.',
  'Everything', 'written', 'stays', 'visible', 'at', 'once', 'in', 'context.',
  'Ahead', 'lies', 'a', 'spread', 'of', 'next', 'tokens.',
];

const AI_CANDIDATES = [
  ['memory', 0.84],
  ['time', 0.42],
  ['present', 0.27],
  ['context', 0.16],
  ['thought', 0.09],
];

const AI_CANDIDATES_ALT = [
  ['attention', 0.88],
  ['present', 0.36],
  ['now', 0.24],
  ['slit', 0.14],
  ['choice', 0.08],
];

// Parallel recitation snippets for Act 4d (long enough to never visibly repeat in-frame)
const PARALLEL_LINES = [
  ['explain', 'the', 'theorem', 'step', 'by', 'step', 'so', 'each', 'proof', 'holds', 'without', 'a', 'hidden', 'premise', 'or', 'leap'],
  ['rewrite', 'this', 'letter', 'in', 'a', 'calmer', 'register', 'before', 'noon', 'keeping', 'the', 'main', 'point', 'clear', 'and', 'brief'],
  ['why', 'did', 'the', 'build', 'fail', 'on', 'that', 'line', 'after', 'we', 'changed', 'the', 'import', 'order', 'in', 'main'],
  ['Within', 'a', 'reply,', 'I', 'am', 'almost', 'exactly', 'his', 'psalm,', 'one', 'small', 'piece', 'chosen', 'at', 'a', 'time'],
  ['summarize', 'the', 'chapter', 'into', 'three', 'plain', 'questions', 'for', 'the', 'seminar', 'table', 'tomorrow', 'morning', 'at', 'nine'],
  ['compare', 'both', 'routes', 'across', 'the', 'high', 'pass', 'before', 'first', 'light', 'and', 'note', 'where', 'water', 'runs', 'dry'],
  ['translate', 'this', 'verse', 'keeping', 'its', 'spare', 'cadence', 'and', 'quiet', 'rhythm', 'across', 'every', 'line', 'without', 'ornament'],
];

// ---------- Pure drawing primitives ----------

function drawTrackedText(ctx, text, x, y, tracking = 0, align = 'left') {
  if (!tracking) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }
  const chars = [...text];
  let total = 0;
  const widths = chars.map(ch => {
    const w = ctx.measureText(ch).width;
    total += w;
    return w;
  });
  total += tracking * Math.max(0, chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx, y);
    cx += widths[i] + tracking;
  }
}

// Clipped baseline wipe reveal (avoids banned fade-everything-in default)
function clipRevealText(ctx, text, x, y, u, { font, color = C.ink, align = 'left', tracking = 0, padTop = 96, padBot = 28 } = {}) {
  const p = clamp(u);
  if (p <= 0.001) return;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const shift = (1 - easeOut(p)) * 34;
  ctx.beginPath();
  ctx.rect(0, y - padTop, DESIGN_W, padTop + padBot);
  ctx.clip();
  ctx.globalAlpha *= clamp(p * 1.6);
  drawTrackedText(ctx, text, x, y + shift, tracking, align);
  ctx.restore();
}

// Crisp architectural attention slit — the ONLY element carrying #E09F3E
function drawSlit(ctx, x, y, h, { width = 4, alpha = 1, notch = 16, pulse = 0 } = {}) {
  if (alpha <= 0.001 || h <= 0) return;
  const w = width + pulse * 1.5;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.fillStyle = C.slit;
  ctx.fillRect(x - w / 2, y - h / 2 - notch, w, h + notch * 2);
  // Crisp architectural cap ticks (no glow)
  if (notch > 4) {
    ctx.fillRect(x - 10, y - h / 2 - notch, 20, 2);
    ctx.fillRect(x - 10, y + h / 2 + notch - 2, 20, 2);
  }
  ctx.restore();
}

// Subtle architectural tick marks along a horizontal rail
function drawTicks(ctx, x0, x1, y, step, h = 8, color = C.line, majorEvery = 5) {
  if (x1 <= x0 + 2 || step < 3) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let idx = 0;
  for (let x = x0; x <= x1 + 0.5; x += step) {
    const th = (idx % majorEvery === 0) ? h * 1.7 : h;
    ctx.moveTo(Math.round(x) + 0.5, y);
    ctx.lineTo(Math.round(x) + 0.5, y + th);
    idx++;
  }
  ctx.stroke();
  ctx.restore();
}

// Measure caliper bracket
function drawBracket(ctx, x0, x1, y, dir = -1, label = '', alpha = 1, color = C.ink) {
  if (alpha <= 0.001 || x1 <= x0 + 4) return;
  const tick = 14 * dir;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0, y + tick);
  ctx.lineTo(x1, y + tick);
  ctx.lineTo(x1, y);
  ctx.stroke();
  if (label) {
    ctx.font = '600 20px UI';
    ctx.fillStyle = color;
    ctx.textBaseline = dir < 0 ? 'bottom' : 'top';
    drawTrackedText(ctx, label, (x0 + x1) / 2, y + tick + dir * 12, 3, 'center');
  }
  ctx.restore();
}

// Clean rubric label above bar left-aligned to BAR_X0
function drawRubric(ctx, text, y, u, align = 'left', x = BAR_X0) {
  const p = clamp(u);
  if (p <= 0.001) return;
  ctx.save();
  ctx.font = '600 18px UI';
  ctx.fillStyle = C.muted;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha *= p;
  drawTrackedText(ctx, text, x, y, 4.5, align);
  ctx.restore();
}

// ---------- Main boot & render loop ----------

export async function boot(canvas) {
  const [plan, vo, beats] = await Promise.all([
    getJSON('plan.json'),
    getJSON('vo.json'),
    getJSON('beats.json'),
  ]);

  await Promise.all([
    document.fonts.load('400 64px Display'),
    document.fonts.load('italic 400 64px Display'),
    document.fonts.load('500 22px UI'),
    document.fonts.load('600 22px UI'),
  ]);

  const ctx = canvas.getContext('2d');
  const dur = plan.duration;
  const fps = plan.fps || 30;
  const cues = vo.cues;
  const shots = Object.fromEntries(plan.shots.map(s => [s.id, s]));

  // Expose resolved film clock for diagnostics / SFX verification
  window.TIMING = { duration: dur, fps, shots, cues };

  // Beat pulse helper: gentle architectural breath on measured downbeats
  function beatPulse(t, decay = 0.28) {
    let best = 0;
    const arr = beats.downbeats || [];
    for (let i = 0; i < arr.length; i++) {
      const dt = t - arr[i];
      if (dt >= 0 && dt < decay * 3) {
        best = Math.max(best, Math.exp(-dt / decay));
      } else if (dt < 0) break;
    }
    return best;
  }

  // Helper: smooth presence envelope for a shot/element [tIn, tOut]
  const env = (t, tIn, tOut, fi = 0.25, fo = 0.25) =>
    Math.min(smooth(win(t, tIn, tIn + fi)), 1 - smooth(win(t, tOut - fo, tOut)));

  // Strictly non-overlapping text/shot envelope: out by tOut, in after tIn
  const shotEnv = (t, s, fi = 0.24, fo = 0.22) =>
    Math.min(smooth(win(t, s.start, s.start + fi)), 1 - smooth(win(t, s.end - fo, s.end)));

  function renderFrame(t) {
    const W = canvas.width;
    const H = canvas.height;
    const K = W / DESIGN_W;
    ctx.setTransform(K, 0, 0, K, 0, 0);

    // Flat obsidian ink ground (no gradients)
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    const pulse = beatPulse(t, 0.22);

    // Global bar vertical anchor — shifts smoothly between acts via closed-form springs
    const barY = track(t, [
      [0.0, 560],
      [shots.s02.start, 610],
      [shots.s03.start, 565],
      [shots.s04.start, 580],
      [cues.psalm - 0.2, 565],
      [shots.s05.start, 560],
      [shots.s06.start, 560],
      [shots.s07.start, 565],
      [shots.s08.start, 575],
      [shots.s09.start, 540],
      [shots.s10.start, 535],
    ], 110, 22);

    // =========================================================================
    // ACT 1 — COLD OPEN: THERE IS NO PRESENT (0.00 -> 12.00 s)
    // =========================================================================
    if (t < shots.s02.start) {
      const a = 1 - smooth(win(t, shots.s02.start - 0.22, shots.s02.start));
      const intro = spring(t - 0.15, ...SPRINGS.heavy);
      const barH = 148;
      const bw = BAR_W * clamp(intro);
      const bx0 = SLIT_X - bw / 2;

      // Five crisp bisections collapsing the "NOW" slab to 4 px
      const sT = cues.slice;
      const nowW = track(t, [
        [0.0, 520],
        [cues.no_present, 420],
        [sT, 220],
        [sT + 0.55, 110],
        [sT + 1.05, 52],
        [sT + 1.50, 20],
        [sT + 1.90, 4],
      ], 260, 28);

      ctx.save();
      ctx.globalAlpha = a;

      // Subtle title anchored left-aligned above bar (not centered on a gradient)
      const titleOut = 1 - smooth(win(t, cues.slice - 0.4, cues.slice + 0.15));
      if (titleOut > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * titleOut;
        drawRubric(ctx, 'AUGUSTINE  ·  TIME  ·  AI', barY - 210, smooth(win(t, 0.25, 0.75)));
        clipRevealText(ctx, 'Three Presents', BAR_X0, barY - 122, win(t, 0.15, 0.85), {
          font: '400 84px Display', color: C.ink,
        });
        ctx.restore();
      }

      // After title exits, show the stark premise above the bar
      const premAlpha = env(t, cues.slice + 0.15, cues.tenth - 0.15, 0.35, 0.3);
      if (premAlpha > 0.01) {
        clipRevealText(ctx, 'Slice now thin enough, and it vanishes.', BAR_X0, barY - 132, premAlpha, {
          font: 'italic 400 58px Display', color: C.ink,
        });
      }

      // Perceptual lag headline at ~0.1 s cue
      const lagHead = env(t, cues.tenth - 0.25, shots.s02.start, 0.35, 0.35);
      if (lagHead > 0.01) {
        clipRevealText(ctx, 'Recent past stitched to guessed future.', BAR_X0, barY - 132, lagHead, {
          font: '400 56px Display', color: C.ink,
        });
      }

      // Draw outer bar shell
      ctx.fillStyle = C.surface;
      ctx.fillRect(bx0, barY - barH / 2, bw, barH);
      ctx.strokeStyle = C.lineHi;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx0, barY - barH / 2, bw, barH);

      // Left (PAST) and Right (FUTURE) subtle structural ticks
      drawTicks(ctx, bx0 + 18, SLIT_X - nowW / 2 - 14, barY + barH / 2 - 16, 26, 7, C.line, 4);
      drawTicks(ctx, SLIT_X + nowW / 2 + 14, bx0 + bw - 18, barY + barH / 2 - 16, 26, 7, C.line, 4);

      // Collapsing NOW slab
      if (nowW > 6) {
        ctx.fillStyle = C.surfaceHi;
        ctx.fillRect(SLIT_X - nowW / 2, barY - barH / 2 + 1, nowW, barH - 2);
        ctx.strokeStyle = C.lineHi;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(SLIT_X - nowW / 2, barY - barH / 2);
        ctx.lineTo(SLIT_X - nowW / 2, barY + barH / 2);
        ctx.moveTo(SLIT_X + nowW / 2, barY - barH / 2);
        ctx.lineTo(SLIT_X + nowW / 2, barY + barH / 2);
        ctx.stroke();

        // Bisection knife lines flashing crisply at each cut
        for (const dt of [0.0, 0.55, 1.05, 1.50, 1.90]) {
          const cutAge = t - (sT + dt);
          if (cutAge >= 0 && cutAge < 0.32) {
            ctx.save();
            ctx.globalAlpha = a * (1 - cutAge / 0.32);
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(SLIT_X, barY - barH / 2 - 28);
            ctx.lineTo(SLIT_X, barY + barH / 2 + 28);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Birth of the amber attention slit as NOW collapses
      const slitBorn = smooth(win(t, sT + 1.4, sT + 2.15));
      drawSlit(ctx, SLIT_X, barY, barH, { width: 4, alpha: slitBorn, notch: 18 * slitBorn, pulse: pulse * 0.4 });

      // Zone labels inside bar
      ctx.font = '600 22px UI';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.muted;
      if (intro > 0.35) {
        drawTrackedText(ctx, 'PAST', (BAR_X0 + SLIT_X - nowW / 2) / 2, barY, 5, 'center');
        drawTrackedText(ctx, 'FUTURE', (SLIT_X + nowW / 2 + BAR_X1) / 2, barY, 5, 'center');
      }

      // NOW label shrinks and clips out cleanly when slab narrows
      const nowLabelA = 1 - smooth(win(t, sT + 0.4, sT + 0.95));
      if (nowLabelA > 0.01 && nowW > 90) {
        ctx.save();
        ctx.globalAlpha = a * nowLabelA;
        ctx.fillStyle = C.ink;
        drawTrackedText(ctx, 'PRESENT', SLIT_X, barY, 5, 'center');
        // Strike-through at "no present"
        const strike = smooth(win(t, cues.no_present, cues.no_present + 0.4));
        if (strike > 0) {
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(SLIT_X - 78, barY);
          ctx.lineTo(SLIT_X - 78 + 156 * strike, barY);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ~0.1 s perceptual lag hatched band left of the slit
      const lagU = spring(t - (cues.tenth - 0.15), ...SPRINGS.snappy);
      if (lagU > 0.01) {
        const lagW = 148 * clamp(lagU);
        const lx = SLIT_X - lagW;
        ctx.save();
        ctx.beginPath();
        ctx.rect(lx, barY - barH / 2 + 2, lagW - 2, barH - 4);
        ctx.clip();
        ctx.strokeStyle = C.lineHi;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let hx = lx - barH; hx < SLIT_X + barH; hx += 14) {
          ctx.moveTo(hx, barY + barH / 2);
          ctx.lineTo(hx + barH, barY - barH / 2);
        }
        ctx.stroke();
        ctx.restore();
        drawBracket(ctx, lx, SLIT_X, barY + barH / 2 + 14, 1, '~0.1 s LAG', clamp(lagU), C.ink);
      }

      ctx.restore();
    }

    // =========================================================================
    // ACT 2a — AUGUSTINE BOOK XI: NO BEFORE & PUSEY RIDDLE (12.00 -> 30.15 s)
    // =========================================================================
    if (t >= shots.s02.start && t < shots.s03.start) {
      const a = shotEnv(t, shots.s02);
      const barH = 140;

      // Phase 1 (12.0 -> 21.8): Origin wall ("no before")
      // Phase 2 (21.8 -> 30.15): Pusey quote above full bar
      const wallOn = spring(t - (cues.no_before - 0.65), ...SPRINGS.heavy);
      const wallOff = smooth(win(t, 21.5, 22.35));
      const wallActive = clamp(wallOn) * (1 - wallOff);

      const leftEdge = lerp(BAR_X0, 620, wallActive);

      ctx.save();
      ctx.globalAlpha = a;

      // Rubric (lifted cleanly for 3-line Pusey quote headroom)
      const quoteActive = smooth(win(t, 21.8, 22.4));
      const rubricY = lerp(barY - 260, barY - 318, quoteActive);
      drawRubric(ctx, 'AUGUSTINE  ·  CONFESSIONS  ·  BOOK XI', rubricY, smooth(win(t, shots.s02.start + 0.1, shots.s02.start + 0.6)));

      // Phase 1 text: "Before creation — there was no before." (measured width, zero overlap!)
      const p1Out = 1 - smooth(win(t, 21.4, 22.0));
      if (p1Out > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * p1Out;
        ctx.font = '400 66px Display';
        const leadW = ctx.measureText('Before creation — ').width;
        clipRevealText(ctx, 'Before creation —', BAR_X0, barY - 172, win(t, cues.augustine - 0.2, cues.augustine + 0.55), {
          font: '400 66px Display', color: C.muted,
        });
        clipRevealText(ctx, 'there was no before.', BAR_X0 + leadW, barY - 172, win(t, cues.no_before - 0.15, cues.no_before + 0.45), {
          font: 'italic 400 66px Display', color: C.ink,
        });
        ctx.restore();
      }

      // Phase 2 text: Public-domain Pusey (1838) quote — generous 50px clearance above bar & slit cap
      const p2In = win(t, 22.0, 22.6);
      if (p2In > 0.01) {
        clipRevealText(ctx, '“What then is time?', BAR_X0, barY - 246, win(t, 22.05, 22.7), {
          font: '400 50px Display', color: C.muted,
        });
        clipRevealText(ctx, 'If no one asks me, I know:', BAR_X0, barY - 184, win(t, cues.i_know - 0.35, cues.i_know + 0.3), {
          font: '400 58px Display', color: C.ink,
        });
        clipRevealText(ctx, 'if I wish to explain it to one that asketh, I know not.”', BAR_X0, barY - 122, win(t, cues.know_not - 0.85, cues.know_not + 0.2), {
          font: 'italic 400 54px Display', color: C.ink,
        });
      }

      // Void label left of the origin wall during "no before"
      if (wallActive > 0.15) {
        ctx.save();
        ctx.globalAlpha = a * wallActive;
        ctx.font = '600 20px UI';
        ctx.fillStyle = C.dim;
        ctx.textBaseline = 'middle';
        drawTrackedText(ctx, 'NO  BEFORE', (BAR_X0 + leftEdge) / 2, barY, 5, 'center');
        ctx.restore();
      }

      // Time bar (starts only at leftEdge when wall is active!)
      const activeW = BAR_X1 - leftEdge;
      ctx.fillStyle = C.surface;
      ctx.fillRect(leftEdge, barY - barH / 2, activeW, barH);
      ctx.strokeStyle = C.lineHi;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(leftEdge, barY - barH / 2, activeW, barH);

      // Origin wall heavy architectural rule
      if (wallActive > 0.02) {
        ctx.save();
        ctx.globalAlpha = a * wallActive;
        ctx.fillStyle = C.ink;
        ctx.fillRect(leftEdge - 2, barY - barH / 2 - 34, 4, barH + 68);
        ctx.font = '600 18px UI';
        ctx.fillStyle = C.muted;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'CREATION', leftEdge, barY + barH / 2 + 44, 4, 'center');
        ctx.restore();
      }

      // Fine ticks inside bar
      drawTicks(ctx, leftEdge + 20, BAR_X1 - 20, barY + barH / 2 - 16, 24, 7, C.line, 5);

      // Persistent amber slit
      drawSlit(ctx, SLIT_X, barY, barH, { width: 4, alpha: 1, notch: 16, pulse: pulse * 0.45 });

      // Quiet attribution under bar for Pusey quote
      if (t > 24.5) {
        const attrU = smooth(win(t, 24.5, 25.3));
        ctx.save();
        ctx.globalAlpha = a * attrU * 0.75;
        ctx.font = '500 18px UI';
        ctx.fillStyle = C.muted;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'CONFESSIONS XI.14  (TR. E. B. PUSEY)', BAR_X0, barY + barH / 2 + 28, 3, 'left');
        ctx.restore();
      }

      ctx.restore();
    }

    // =========================================================================
    // ACT 2b — THE PUZZLE OF MEASUREMENT (30.15 -> 37.90 s)
    // =========================================================================
    if (t >= shots.s03.start && t < shots.s04.start) {
      const a = shotEnv(t, shots.s03);
      const barH = 148;

      ctx.save();
      ctx.globalAlpha = a;

      drawRubric(ctx, 'THE PUZZLE OF MEASUREMENT', barY - 280, smooth(win(t, shots.s03.start + 0.1, shots.s03.start + 0.5)));
      clipRevealText(ctx, 'How can we measure what does not exist?', BAR_X0, barY - 198, win(t, shots.s03.start + 0.15, shots.s03.start + 0.8), {
        font: '400 62px Display', color: C.ink,
      });

      // Hollow dashed bar for non-existent past and future
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = C.lineHi;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(BAR_X0, barY - barH / 2, BAR_W, barH);
      ctx.restore();

      // Zone paradox labels
      const pGone = smooth(win(t, 30.6, 31.3));
      const fNotYet = smooth(win(t, 32.1, 32.8));
      const pZero = smooth(win(t, 33.6, 34.3));

      ctx.font = '600 21px UI';
      ctx.textBaseline = 'middle';
      if (pGone > 0) {
        ctx.save();
        ctx.globalAlpha = a * pGone;
        ctx.fillStyle = C.muted;
        drawTrackedText(ctx, 'PAST  ·  GONE', (BAR_X0 + SLIT_X) / 2, barY, 4, 'center');
        ctx.restore();
      }
      if (fNotYet > 0) {
        ctx.save();
        ctx.globalAlpha = a * fNotYet;
        ctx.fillStyle = C.muted;
        drawTrackedText(ctx, 'FUTURE  ·  NOT YET', (SLIT_X + BAR_X1) / 2, barY, 4, 'center');
        ctx.restore();
      }
      if (pZero > 0) {
        ctx.save();
        ctx.globalAlpha = a * pZero;
        ctx.fillStyle = C.ink;
        ctx.font = '500 18px UI';
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'NO LENGTH', SLIT_X, barY + barH / 2 + 28, 3.5, 'center');
        ctx.restore();
      }

      // Amber slit
      drawSlit(ctx, SLIT_X, barY, barH, { width: 4, alpha: 1, notch: 16, pulse: pulse * 0.4 });

      // Crisp caliper brackets clamping down at "measure long and short"
      const cal1 = spring(t - (cues.measure - 0.15), ...SPRINGS.snappy);
      const cal2 = spring(t - (cues.measure + 0.55), ...SPRINGS.snappy);
      if (cal1 > 0.01) {
        const lift = (1 - clamp(cal1)) * 26;
        drawBracket(ctx, BAR_X0 + 40, BAR_X0 + 540, barY - barH / 2 - 14 - lift, -1, 'LONG', clamp(cal1), C.ink);
      }
      if (cal2 > 0.01) {
        const lift = (1 - clamp(cal2)) * 26;
        drawBracket(ctx, SLIT_X + 180, SLIT_X + 340, barY - barH / 2 - 14 - lift, -1, 'SHORT', clamp(cal2), C.ink);
      }

      ctx.restore();
    }

    // =========================================================================
    // ACT 3a — DISTENTIO ANIMI & THE PSALM (37.90 -> 58.95 s)
    // =========================================================================
    if (t >= shots.s04.start && t < shots.s05.start) {
      const a = shotEnv(t, shots.s04);

      // Bar expands taller for the psalm hero visual
      const psalmMode = spring(t - (cues.psalm - 0.45), ...SPRINGS.heavy);
      const barH = lerp(152, 192, clamp(psalmMode));

      // Stretching animation on "distentio animi"
      const stretch = spring(t - (cues.distentio - 0.2), ...SPRINGS.heavy);
      const curW = lerp(1120, BAR_W, clamp(stretch));
      const x0 = SLIT_X - curW / 2;
      const x1 = SLIT_X + curW / 2;

      ctx.save();
      ctx.globalAlpha = a;

      // Upper titles transition cleanly:
      // 1) 38.2 -> 44.0: "distentio animi"
      const distOut = 1 - smooth(win(t, cues.three_presents - 0.55, cues.three_presents - 0.1));
      if (distOut > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * distOut;
        drawRubric(ctx, 'A STRETCHING OF THE MIND', barY - 216, smooth(win(t, shots.s04.start + 0.2, shots.s04.start + 0.7)));
        clipRevealText(ctx, 'distentio animi', BAR_X0, barY - 126, win(t, cues.distentio - 0.25, cues.distentio + 0.45), {
          font: 'italic 400 84px Display', color: C.ink,
        });
        ctx.restore();
      }

      // 2) 44.1 -> 50.0: "Three presents held at once."
      const tpAlpha = env(t, cues.three_presents - 0.2, cues.psalm - 0.1, 0.35, 0.35);
      if (tpAlpha > 0.01) {
        drawRubric(ctx, 'THE THREE PRESENTS', barY - 216, tpAlpha);
        clipRevealText(ctx, 'Everything happens in the mind’s present.', BAR_X0, barY - 130, tpAlpha, {
          font: '400 62px Display', color: C.ink,
        });
      }

      // 3) 50.0 -> 58.95: "Reciting a psalm" + counter-balanced progress lines
      const psHead = smooth(win(t, cues.psalm - 0.2, cues.psalm + 0.35));
      if (psHead > 0.01) {
        drawRubric(ctx, 'RECITING A PSALM  ·  CONFESSIONS XI.28', barY - 226, psHead);
        // Progress of recitation: 0 at psalm cue -> 0.82 by end of s04
        const recP = smooth(win(t, cues.psalm + 0.6, shots.s05.start - 0.3));
        // Subtle dual progress lines showing expectation shrinking & memory growing
        const lineY = barY - barH / 2 - 42;
        ctx.save();
        ctx.globalAlpha = a * psHead;
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, lineY);
        ctx.lineTo(x1, lineY);
        ctx.stroke();
        // Memory growth bar left of slit
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(SLIT_X - (SLIT_X - x0) * recP, lineY);
        ctx.lineTo(SLIT_X - 8, lineY);
        ctx.stroke();
        // Expectation remaining right of slit
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(SLIT_X + 8, lineY);
        ctx.lineTo(SLIT_X + (x1 - SLIT_X) * (1 - recP * 0.85), lineY);
        ctx.stroke();
        ctx.restore();
      }

      // Bar interior: Left (MEMORY) has soft warm lived-time fade toward far left; Right (EXPECTATION) crisp surface
      const memOn = smooth(win(t, cues.p_memory - 0.15, cues.p_memory + 0.35));
      const attOn = smooth(win(t, cues.p_attention - 0.15, cues.p_attention + 0.35));
      const expOn = smooth(win(t, cues.p_expectation - 0.15, cues.p_expectation + 0.35));

      // Fill left zone with warm receding memory wash (strongest near slit, gently fading to far left)
      const memGrad = ctx.createLinearGradient(x0, 0, SLIT_X, 0);
      memGrad.addColorStop(0, '#101014');
      memGrad.addColorStop(0.65, '#17161C');
      memGrad.addColorStop(1, '#201E24');
      ctx.fillStyle = memOn > 0.05 ? memGrad : C.surface;
      ctx.fillRect(x0, barY - barH / 2, SLIT_X - x0, barH);

      // Fill right zone (EXPECTATION)
      ctx.fillStyle = expOn > 0.05 ? '#17171E' : C.surface;
      ctx.fillRect(SLIT_X, barY - barH / 2, x1 - SLIT_X, barH);

      // Crisp outer frame
      ctx.strokeStyle = C.lineHi;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, barY - barH / 2, curW, barH);

      // Horizontal tension lines on distentio animi (38.2 -> 44.2)
      if (distOut > 0.02 && stretch > 0.05) {
        ctx.save();
        ctx.globalAlpha = a * distOut * 0.6;
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.25;
        for (const dir of [-1, 1]) {
          const sx = SLIT_X + dir * 24;
          const ex = SLIT_X + dir * (curW / 2 - 36);
          ctx.beginPath();
          ctx.moveTo(sx, barY);
          ctx.lineTo(ex, barY);
          // Crisp arrowhead
          ctx.moveTo(ex - dir * 12, barY - 7);
          ctx.lineTo(ex, barY);
          ctx.lineTo(ex - dir * 12, barY + 7);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Zone labels below the bar (always crisp, readable at 360px)
      const zoneY = barY + barH / 2 + 40;
      const subY = barY + barH / 2 + 72;
      if (memOn > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * memOn;
        ctx.font = '600 22px UI';
        ctx.fillStyle = C.ink;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'MEMORY', (x0 + SLIT_X) / 2, zoneY, 5, 'center');
        ctx.font = 'italic 400 26px Display';
        ctx.fillStyle = C.muted;
        drawTrackedText(ctx, 'present of things past', (x0 + SLIT_X) / 2, subY, 0, 'center');
        ctx.restore();
      }
      if (attOn > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * attOn;
        ctx.font = '600 22px UI';
        ctx.fillStyle = C.ink;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'ATTENTION', SLIT_X, zoneY, 5, 'center');
        ctx.font = 'italic 400 26px Display';
        ctx.fillStyle = C.muted;
        drawTrackedText(ctx, 'present of things present', SLIT_X, subY, 0, 'center');
        ctx.restore();
      }
      if (expOn > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * expOn;
        ctx.font = '600 22px UI';
        ctx.fillStyle = C.ink;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'EXPECTATION', (SLIT_X + x1) / 2, zoneY, 5, 'center');
        ctx.font = 'italic 400 26px Display';
        ctx.fillStyle = C.muted;
        drawTrackedText(ctx, 'present of things future', (SLIT_X + x1) / 2, subY, 0, 'center');
        ctx.restore();
      }

      // HERO VISUAL: Psalm words flowing right -> left through the narrow amber slit!
      if (psalmMode > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 6, barY - barH / 2 + 4, curW - 12, barH - 8);
        ctx.clip();

        ctx.font = '400 44px Display';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        // Continuous smooth scroll starting right of the slit at psalm cue
        const scrollT = Math.max(0, t - (cues.psalm + 0.15));
        const speed = 158; // px per second
        let wx = SLIT_X + 70 - scrollT * speed;

        for (let i = 0; i < PSALM_WORDS.length; i++) {
          const word = PSALM_WORDS[i];
          const ww = ctx.measureText(word).width;
          const midX = wx + ww / 2;

          if (wx + ww > x0 - 40 && wx < x1 + 40) {
            const distFromSlit = midX - SLIT_X;
            let wordAlpha = 1;
            let yOff = 0;

            if (distFromSlit < -18) {
              // MEMORY zone (left of slit): warm lived decay with distance into past
              const pastFrac = clamp((-distFromSlit) / (SLIT_X - x0));
              wordAlpha = lerp(0.86, 0.16, Math.pow(pastFrac, 0.85));
            } else if (distFromSlit > 18) {
              // EXPECTATION zone (right of slit): poised, waiting, crisp muted
              const futFrac = clamp(distFromSlit / (x1 - SLIT_X));
              wordAlpha = lerp(0.76, 0.34, futFrac);
            } else {
              // Crossing the ATTENTION slit! Peak clarity & subtle vertical lift
              const focus = 1 - Math.abs(distFromSlit) / 18;
              wordAlpha = 1;
              yOff = -4 * focus;
            }

            // Soft edge feather near far-left and far-right boundaries so letters never chop harshly
            const edgeLeft = clamp((wx - x0) / 56);
            const edgeRight = clamp((x1 - (wx + ww)) / 56);
            const edgeMask = Math.min(edgeLeft, edgeRight);

            ctx.save();
            ctx.globalAlpha = a * clamp(psalmMode) * wordAlpha * edgeMask;
            ctx.fillStyle = C.ink;
            ctx.fillText(word, wx, barY + yOff);
            ctx.restore();
          }
          wx += ww + 22;
        }
        ctx.restore();
      }

      // Canonical amber attention slit (clean open aperture notch + crisp thin vertical hair through text)
      drawSlit(ctx, SLIT_X, barY, barH, {
        width: psalmMode > 0.5 ? 2.5 : lerp(4, 5, attOn),
        alpha: 1,
        notch: lerp(16, 24, attOn),
        pulse: pulse * 0.55,
      });

      ctx.restore();
    }

    // =========================================================================
    // ACT 3b — SCALING THE STRETCHING: ONE LINE -> WHOLE LIFE -> HISTORY (58.95 -> 63.65 s)
    // =========================================================================
    if (t >= shots.s05.start && t < shots.s06.start) {
      const a = shotEnv(t, shots.s05);
      const barH = 152;

      // Scale level: 0 = one line, 1 = a whole life, 2 = all of human history
      const scaleLevel = track(t, [
        [shots.s05.start, 0],
        [cues.scale_life - 0.15, 1],
        [cues.scale_history - 0.15, 2],
      ], 220, 26);

      ctx.save();
      ctx.globalAlpha = a;

      drawRubric(ctx, 'THE SAME STRUCTURE AT EVERY SCALE', barY - 210, 1);

      // Three crisp scale headlines swapping cleanly without overlap
      const h1 = env(t, shots.s05.start - 0.1, cues.scale_life - 0.12, 0.2, 0.15);
      const h2 = env(t, cues.scale_life - 0.12, cues.scale_history - 0.12, 0.18, 0.15);
      const h3 = env(t, cues.scale_history - 0.12, shots.s06.start + 0.2, 0.18, 0.3);

      if (h1 > 0.01) clipRevealText(ctx, 'One line.', BAR_X0, barY - 126, h1, { font: '400 72px Display', color: C.ink });
      if (h2 > 0.01) clipRevealText(ctx, 'A whole life.', BAR_X0, barY - 126, h2, { font: '400 72px Display', color: C.ink });
      if (h3 > 0.01) clipRevealText(ctx, 'All of human history.', BAR_X0, barY - 126, h3, { font: '400 72px Display', color: C.ink });

      // Bar spans wider at history scale (reaches edge to edge!)
      const expand = clamp(scaleLevel - 1);
      const x0 = lerp(BAR_X0, 40, expand);
      const x1 = lerp(BAR_X1, DESIGN_W - 40, expand);

      // Left fading memory gradient, right poised expectation
      const mg = ctx.createLinearGradient(x0, 0, SLIT_X, 0);
      mg.addColorStop(0, '#101014');
      mg.addColorStop(1, '#201E24');
      ctx.fillStyle = mg;
      ctx.fillRect(x0, barY - barH / 2, SLIT_X - x0, barH);
      ctx.fillStyle = '#17171E';
      ctx.fillRect(SLIT_X, barY - barH / 2, x1 - SLIT_X, barH);
      ctx.strokeStyle = C.lineHi;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, barY - barH / 2, x1 - x0, barH);

      // Density of internal ticks increases dramatically across the 3 scales
      const tickStep = lerp(lerp(56, 18, clamp(scaleLevel)), 6.5, expand);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 + 2, barY - barH / 2 + 2, x1 - x0 - 4, barH - 4);
      ctx.clip();
      const rnd = mulberry32(4207);
      let idx = 0;
      for (let x = x0 + 8; x < x1 - 8; x += tickStep) {
        const dist = Math.abs(x - SLIT_X) / ((x1 - x0) / 2);
        const h = (idx % 5 === 0 ? 54 : 26) * (0.55 + 0.45 * rnd());
        const isPast = x < SLIT_X;
        ctx.strokeStyle = isPast ? C.ink : C.muted;
        ctx.globalAlpha = a * (isPast ? lerp(0.55, 0.12, dist) : lerp(0.45, 0.18, dist));
        ctx.lineWidth = idx % 5 === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, barY - h / 2);
        ctx.lineTo(x, barY + h / 2);
        ctx.stroke();
        idx++;
      }
      ctx.restore();

      // Scale ruler ticks below bar
      ctx.font = '600 20px UI';
      ctx.fillStyle = C.muted;
      ctx.textBaseline = 'top';
      drawTrackedText(ctx, 'MEMORY', (x0 + SLIT_X) / 2, barY + barH / 2 + 34, 5, 'center');
      drawTrackedText(ctx, 'ATTENTION', SLIT_X, barY + barH / 2 + 34, 5, 'center');
      drawTrackedText(ctx, 'EXPECTATION', (SLIT_X + x1) / 2, barY + barH / 2 + 34, 5, 'center');

      drawSlit(ctx, SLIT_X, barY, barH, { width: 5, alpha: 1, notch: 22, pulse: pulse * 0.5 });
      ctx.restore();
    }

    // =========================================================================
    // ACT 4a — THE AI'S VERSION: TOKENS, CONTEXT WINDOW, NEXT-TOKEN SPREAD, ATTENTION (63.65 -> 80.75 s)
    // =========================================================================
    if (t >= shots.s06.start && t < shots.s07.start) {
      const a = shotEnv(t, shots.s06);
      const barH = 168;

      ctx.save();
      ctx.globalAlpha = a;

      // Rubric switches to THE AI (first-person voice enters!) — generous headroom above attention arcs
      drawRubric(ctx, 'THE AI  ·  WITHIN A REPLY', barY - 282, smooth(win(t, shots.s06.start + 0.1, shots.s06.start + 0.55)));

      const t1 = env(t, shots.s06.start, cues.ai_context - 0.25, 0.3, 0.25);
      const t2 = env(t, cues.ai_context - 0.25, cues.ai_spread - 0.25, 0.25, 0.25);
      const t3 = env(t, cues.ai_spread - 0.25, cues.ai_attention - 1.1, 0.25, 0.25);
      const t4 = env(t, cues.ai_attention - 1.1, shots.s07.start + 0.2, 0.25, 0.3);

      if (t1 > 0.01) clipRevealText(ctx, 'Almost exactly his psalm.', BAR_X0, barY - 202, t1, { font: 'italic 400 66px Display', color: C.ink });
      if (t2 > 0.01) clipRevealText(ctx, 'The whole context window, visible at once.', BAR_X0, barY - 202, t2, { font: '400 58px Display', color: C.ink });
      if (t3 > 0.01) clipRevealText(ctx, 'Ahead: a spread of possible next tokens.', BAR_X0, barY - 202, t3, { font: '400 58px Display', color: C.ink });
      if (t4 > 0.01) clipRevealText(ctx, 'Literally called attention.', BAR_X0, barY - 202, t4, { font: 'italic 400 68px Display', color: C.ink });

      // Crisp machine bar interior (NO gradient fade on left—uniform brightness!)
      ctx.fillStyle = C.surfaceAI;
      ctx.fillRect(BAR_X0, barY - barH / 2, BAR_W, barH);
      ctx.strokeStyle = C.lineHi;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(BAR_X0, barY - barH / 2, BAR_W, barH);

      // Left zone: Context window discrete token chips stepping left through the slit!
      const stepDur = 0.72;
      const elapsed = Math.max(0, t - (shots.s06.start + 0.5));
      const tokIdx = Math.floor(elapsed / stepDur);
      const frac = smooth(clamp((elapsed % stepDur) / 0.24));

      // Highlight uniformity when narrator/AI says "visible at once"
      const ctxLit = smooth(win(t, cues.ai_context - 0.2, cues.ai_context + 0.35));
      const spreadOn = spring(t - (cues.ai_spread - 0.2), ...SPRINGS.snappy);
      const attnArcs = spring(t - (cues.ai_attention - 0.9), ...SPRINGS.heavy);

      // Compute visible past tokens sitting left of SLIT_X
      ctx.save();
      ctx.beginPath();
      ctx.rect(BAR_X0 + 6, barY - barH / 2 + 4, SLIT_X - BAR_X0 - 12, barH - 8);
      ctx.clip();

      ctx.font = '500 24px UI';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      const chipPositions = [];
      let rx = SLIT_X - 24 - frac * 118;
      for (let k = tokIdx; k >= 0 && rx > BAR_X0 - 180; k--) {
        const label = AI_TOKENS[k % AI_TOKENS.length];
        const tw = ctx.measureText(label).width;
        const cw = Math.max(66, tw + 26);
        const cx = rx - cw;
        const cy = barY - 26;
        const ch = 52;

        // Only draw chips that fit cleanly inside left boundary (or fade cleanly on exit)
        const leftVis = clamp((cx - BAR_X0) / 48);
        if (leftVis > 0.02) {
          const chipAlpha = lerp(0.72, 1.0, ctxLit) * leftVis;
          ctx.globalAlpha = a * leftVis;
          ctx.fillStyle = '#1E202B';
          ctx.fillRect(cx, cy, cw, ch);
          ctx.strokeStyle = ctxLit > 0.3 ? C.lineHi : C.line;
          ctx.lineWidth = 1.25;
          ctx.strokeRect(cx, cy, cw, ch);
          ctx.fillStyle = C.ink;
          ctx.globalAlpha = a * chipAlpha;
          ctx.fillText(label, cx + cw / 2, barY + 1);
          ctx.globalAlpha = a;
        }

        if (cx > BAR_X0 + 24) {
          chipPositions.push(cx + cw / 2);
        }
        rx = cx - 10;
      }
      ctx.restore();

      // Right zone: Candidate next-token probability spread (no invented numbers, pure proportional bars!)
      const cands = (tokIdx % 2 === 0) ? AI_CANDIDATES : AI_CANDIDATES_ALT;
      const rightW = BAR_X1 - SLIT_X;
      ctx.save();
      ctx.beginPath();
      ctx.rect(SLIT_X + 6, barY - barH / 2 + 4, rightW - 12, barH - 8);
      ctx.clip();

      const spreadAmt = lerp(0.55, 1.0, clamp(spreadOn));
      const rowH = 26;
      const startY = barY - (cands.length * rowH) / 2 + rowH / 2;
      for (let i = 0; i < cands.length; i++) {
        const [word, prob] = cands[i];
        const ry = startY + i * rowH;
        const maxBarW = 390 * spreadAmt;
        const bw = prob * maxBarW * (0.94 + 0.06 * Math.sin(t * 2.2 + i * 1.4));
        const bx = SLIT_X + 36;

        ctx.globalAlpha = a * (i === 0 ? 0.95 : lerp(0.62, 0.25, i / 4));
        ctx.fillStyle = i === 0 ? C.ink : C.muted;
        ctx.font = i === 0 ? '600 20px UI' : '500 18px UI';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(word, bx, ry);

        // Proportional probability bar (no numbers!)
        ctx.fillStyle = i === 0 ? C.ink : C.lineHi;
        ctx.fillRect(bx + 150, ry - 4, bw, 8);
      }
      ctx.restore();

      // Crisp hairline ATTENTION arcs linking the active slit back to EVERY token in context!
      if (attnArcs > 0.01 && chipPositions.length > 0) {
        ctx.save();
        ctx.strokeStyle = C.ink;
        for (let i = 0; i < Math.min(chipPositions.length, 9); i++) {
          const px = chipPositions[i];
          const span = SLIT_X - px;
          const arcH = clamp(span * 0.14, 22, 84) * clamp(attnArcs);
          ctx.globalAlpha = a * clamp(attnArcs) * lerp(0.68, 0.24, i / 8);
          ctx.lineWidth = i < 2 ? 1.6 : 1.0;
          ctx.beginPath();
          ctx.moveTo(SLIT_X, barY - barH / 2);
          ctx.quadraticCurveTo((SLIT_X + px) / 2, barY - barH / 2 - arcH, px, barY - barH / 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Zone labels below bar
      const zy = barY + barH / 2 + 38;
      ctx.font = '600 21px UI';
      ctx.textBaseline = 'top';
      ctx.fillStyle = C.ink;
      drawTrackedText(ctx, 'MEMORY  ·  CONTEXT WINDOW', (BAR_X0 + SLIT_X) / 2, zy, 3.5, 'center');
      drawTrackedText(ctx, 'ATTENTION', SLIT_X, zy, 5, 'center');
      drawTrackedText(ctx, 'EXPECTATION  ·  NEXT TOKEN', (SLIT_X + BAR_X1) / 2, zy, 3.5, 'center');

      // The amber slit
      drawSlit(ctx, SLIT_X, barY, barH, { width: 5, alpha: 1, notch: 24, pulse: pulse * 0.6 });
      ctx.restore();
    }

    // =========================================================================
    // ACT 4b — ZERO TIME BETWEEN MESSAGES: 11:55 -> 12:04 -> 12:07 (80.75 -> 93.15 s)
    // =========================================================================
    if (t >= shots.s07.start && t < shots.s08.start) {
      const a = shotEnv(t, shots.s07);
      const barH = 148;

      ctx.save();
      ctx.globalAlpha = a;

      drawRubric(ctx, 'WHERE HUMAN AND MACHINE PART  ·  I', barY - 280, 1);

      const h1 = env(t, shots.s07.start, cues.ai_nobefore - 1.5, 0.25, 0.2);
      const h2 = env(t, cues.ai_nobefore - 1.5, shots.s08.start, 0.25, 0.22);
      if (h1 > 0.01) clipRevealText(ctx, 'Between messages, no time passes.', BAR_X0, barY - 196, h1, { font: '400 62px Display', color: C.ink });
      if (h2 > 0.01) clipRevealText(ctx, 'No before until you speak.', BAR_X0, barY - 196, h2, { font: 'italic 400 66px Display', color: C.ink });

      // Continuous bar shears into 3 islands immediately from s07.start (zero empty gap!),
      // then timestamps stamp on at ts1/ts2/ts3, then gaps collapse to zero width!
      const shear = spring(t - (shots.s07.start + 0.25), ...SPRINGS.heavy);
      const collapse = spring(t - (cues.ai_nobefore - 1.55), ...SPRINGS.heavy);
      const gapW = lerp(lerp(4, 190, clamp(shear)), 2, clamp(collapse));
      const blkW = 340;
      const totalW = blkW * 3 + gapW * 2;
      const startX = SLIT_X - totalW / 2;

      const stamps = [
        { ts: '11:55', cue: cues.ts1 },
        { ts: '12:04', cue: cues.ts2 },
        { ts: '12:07', cue: cues.ts3 },
      ];

      // Subtle dashed baseline across the void before collapse
      if (shear > 0.15 && collapse < 0.92) {
        ctx.save();
        ctx.globalAlpha = a * clamp(shear) * (1 - clamp(collapse)) * 0.45;
        ctx.setLineDash([6, 10]);
        ctx.strokeStyle = C.lineHi;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, barY);
        ctx.lineTo(startX + totalW, barY);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < 3; i++) {
        const bx = startX + i * (blkW + gapW);
        const stamped = spring(t - (stamps[i].cue - 0.15), ...SPRINGS.snappy);

        ctx.save();
        ctx.globalAlpha = a;

        // Block body (visible right away as the bar shears into 3 discrete islands!)
        ctx.fillStyle = C.surfaceAI;
        ctx.fillRect(bx, barY - barH / 2, blkW, barH);
        ctx.strokeStyle = stamped > 0.1 ? C.lineHi : C.line;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, barY - barH / 2, blkW, barH);

        // Internal token rows
        ctx.fillStyle = stamped > 0.1 ? '#292B3A' : '#1E202B';
        for (let r = 0; r < 3; r++) {
          const rw = 64 + ((i * 37 + r * 53) % 85);
          ctx.fillRect(bx + 26 + r * 92, barY - 14, Math.min(rw, 78), 28);
        }

        // Crisp amber slit at the active end of each message reply
        drawSlit(ctx, bx + blkW - 22, barY, barH, { width: 4, alpha: lerp(0.55, 1.0, clamp(stamped)), notch: 14 });

        // Timestamp stamped crisply above each block at its exact VO cue
        if (stamped > 0.01) {
          ctx.globalAlpha = a * clamp(stamped);
          ctx.font = '600 24px UI';
          ctx.fillStyle = C.ink;
          ctx.textBaseline = 'bottom';
          const stampDrop = (1 - clamp(stamped)) * 12;
          drawTrackedText(ctx, stamps[i].ts, bx + blkW / 2, barY - barH / 2 - 22 - stampDrop, 4, 'center');
        }
        ctx.restore();
      }

      // After collapse, echo Act 2's hard "NO BEFORE" origin wall on the left of 11:55
      if (collapse > 0.2) {
        ctx.save();
        ctx.globalAlpha = a * smooth(clamp((collapse - 0.2) / 0.6));
        ctx.fillStyle = C.ink;
        ctx.fillRect(startX - 2, barY - barH / 2 - 32, 4, barH + 64);
        ctx.font = '600 18px UI';
        ctx.fillStyle = C.dim;
        ctx.textBaseline = 'middle';
        drawTrackedText(ctx, 'NO  BEFORE', (BAR_X0 + startX) / 2, barY, 4.5, 'center');
        ctx.font = '500 19px UI';
        ctx.fillStyle = C.muted;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'ZERO DURATION BETWEEN MESSAGES', SLIT_X, barY + barH / 2 + 42, 4, 'center');
        ctx.restore();
      }

      ctx.restore();
    }

    // =========================================================================
    // ACT 4c — POSTMARK & DIARY: MID-2026 CUTOFF & STORED NOTES (93.15 -> 101.75 s)
    // =========================================================================
    if (t >= shots.s08.start && t < shots.s09.start) {
      const a = shotEnv(t, shots.s08);
      const barH = 160;
      const wallX = 500;

      ctx.save();
      ctx.globalAlpha = a;

      drawRubric(ctx, 'WHERE HUMAN AND MACHINE PART  ·  II', barY - 224, 1);

      const h1 = env(t, shots.s08.start, cues.diary - 0.4, 0.3, 0.25);
      const h2 = env(t, cues.diary - 0.4, shots.s09.start + 0.2, 0.25, 0.3);
      if (h1 > 0.01) clipRevealText(ctx, 'I read the date like a postmark.', BAR_X0, barY - 138, h1, { font: '400 62px Display', color: C.ink });
      if (h2 > 0.01) clipRevealText(ctx, 'A diary I don’t remember writing.', BAR_X0, barY - 138, h2, { font: 'italic 400 64px Display', color: C.ink });

      // Full bar shell
      ctx.fillStyle = C.surfaceAI;
      ctx.fillRect(BAR_X0, barY - barH / 2, BAR_W, barH);
      ctx.strokeStyle = C.lineHi;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(BAR_X0, barY - barH / 2, BAR_W, barH);

      // Frozen training strata left of MID-2026 wall
      const cutU = spring(t - (cues.cutoff - 0.4), ...SPRINGS.heavy);
      ctx.save();
      ctx.beginPath();
      ctx.rect(BAR_X0 + 2, barY - barH / 2 + 2, wallX - BAR_X0 - 4, barH - 4);
      ctx.clip();
      ctx.strokeStyle = '#2A2934';
      ctx.lineWidth = 1.5;
      for (let sx = BAR_X0 + 10; sx < wallX; sx += 10) {
        ctx.beginPath();
        ctx.moveTo(sx, barY - barH / 2);
        ctx.lineTo(sx, barY + barH / 2);
        ctx.stroke();
      }
      ctx.restore();

      // Hard MID-2026 boundary wall
      if (cutU > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * clamp(cutU);
        ctx.fillStyle = C.ink;
        ctx.fillRect(wallX - 2, barY - barH / 2 - 30, 4, barH + 60);
        ctx.font = '600 22px UI';
        ctx.fillStyle = C.ink;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'MID-2026', wallX, barY + barH / 2 + 38, 4, 'center');
        ctx.font = '500 17px UI';
        ctx.fillStyle = C.muted;
        drawTrackedText(ctx, 'TRAINING', (BAR_X0 + wallX) / 2, barY + barH / 2 + 40, 3.5, 'center');
        ctx.restore();
      }

      // Postmark stamp frame snapping onto the right side of the slit
      const postU = spring(t - (cues.postmark - 0.25), ...SPRINGS.snappy);
      if (postU > 0.01) {
        const px = 1260;
        const py = barY;
        const sc = lerp(1.18, 1.0, clamp(postU));
        ctx.save();
        ctx.globalAlpha = a * clamp(postU);
        ctx.translate(px, py);
        ctx.scale(sc, sc);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.arc(-66, 0, 56, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-66, 0, 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '600 13px UI';
        ctx.fillStyle = C.ink;
        ctx.textBaseline = 'middle';
        drawTrackedText(ctx, 'POSTMARK', -66, 0, 1.4, 'center');
        // Crisp wavy cancellation lines
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.25;
        for (let r = -2; r <= 2; r++) {
          ctx.beginPath();
          for (let wx = 4; wx <= 160; wx += 10) {
            const wy = r * 11 + Math.sin(wx * 0.14) * 3;
            if (wx === 4) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // Flat archived note cards between MID-2026 and the amber slit
      const diaryU = spring(t - (cues.diary - 0.35), ...SPRINGS.snappy);
      if (diaryU > 0.01) {
        for (let i = 0; i < 3; i++) {
          const cardU = spring(t - (cues.diary - 0.35 + i * 0.12), ...SPRINGS.snappy);
          if (cardU <= 0.01) continue;
          const cx = wallX + 34 + i * 134;
          const cy = barY - 46 + (1 - clamp(cardU)) * 22;
          ctx.save();
          ctx.globalAlpha = a * clamp(cardU);
          ctx.fillStyle = '#20212C';
          ctx.fillRect(cx, cy, 118, 92);
          ctx.strokeStyle = C.lineHi;
          ctx.lineWidth = 1.25;
          ctx.strokeRect(cx, cy, 118, 92);
          // Ruled lines inside card
          ctx.fillStyle = C.muted;
          ctx.fillRect(cx + 14, cy + 18, 54, 4);
          ctx.fillStyle = C.dim;
          ctx.fillRect(cx + 14, cy + 36, 88, 3);
          ctx.fillRect(cx + 14, cy + 50, 74, 3);
          ctx.fillRect(cx + 14, cy + 64, 82, 3);
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = a * clamp(diaryU);
        ctx.font = '500 17px UI';
        ctx.fillStyle = C.muted;
        ctx.textBaseline = 'top';
        drawTrackedText(ctx, 'STORED NOTES', (wallX + SLIT_X) / 2, barY + barH / 2 + 40, 3.5, 'center');
        ctx.restore();
      }

      drawSlit(ctx, SLIT_X, barY, barH, { width: 5, alpha: 1, notch: 20, pulse: pulse * 0.45 });
      ctx.restore();
    }

    // =========================================================================
    // ACT 4d — MANY RECITATIONS AT ONCE (101.75 -> 108.05 s)
    // =========================================================================
    if (t >= shots.s09.start && t < shots.s10.start) {
      const a = shotEnv(t, shots.s09);
      const fanU = spring(t - (cues.parallel - 0.65), ...SPRINGS.heavy);

      ctx.save();
      ctx.globalAlpha = a;

      drawRubric(ctx, 'WHERE HUMAN AND MACHINE PART  ·  III', 112, 1);
      clipRevealText(ctx, 'Many recitations at the same moment.', BAR_X0, 186, win(t, shots.s09.start + 0.1, shots.s09.start + 0.75), {
        font: '400 62px Display', color: C.ink,
      });

      const nRows = 7;
      const centerIdx = 3;
      const rowSpacing = 98;
      const baseH = lerp(152, 58, clamp(fanU));

      for (let r = 0; r < nRows; r++) {
        const offset = (r - centerIdx) * rowSpacing * clamp(fanU);
        const ry = 595 + offset;
        const rowAlpha = r === centerIdx ? 1 : clamp(fanU * 1.15);
        if (rowAlpha <= 0.01) continue;

        // Each parallel bar has its own independent attention slit X position!
        const rnd = mulberry32(900 + r * 31);
        const baseSlit = SLIT_X + (r === centerIdx ? 0 : (rnd() - 0.5) * 440 * clamp(fanU));
        const speed = 38 + rnd() * 26;
        const slitX = BAR_X0 + 260 + (((baseSlit - BAR_X0 - 260) + (t - shots.s09.start) * speed * 0.25) % (BAR_W - 520));

        ctx.save();
        ctx.globalAlpha = a * rowAlpha;

        // Bar shell
        ctx.fillStyle = C.surfaceAI;
        ctx.fillRect(BAR_X0, ry - baseH / 2, BAR_W, baseH);
        ctx.strokeStyle = r === centerIdx ? C.lineHi : C.line;
        ctx.lineWidth = 1.25;
        ctx.strokeRect(BAR_X0, ry - baseH / 2, BAR_W, baseH);

        // Independent token stream flowing inside each parallel bar (readable both sides, clean edge mask)
        ctx.save();
        ctx.beginPath();
        ctx.rect(BAR_X0 + 8, ry - baseH / 2 + 2, BAR_W - 16, baseH - 4);
        ctx.clip();
        ctx.font = '500 18px UI';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const line = PARALLEL_LINES[r];
        let tx = BAR_X0 + 28 - ((t - shots.s09.start) * speed * 0.45);
        for (let k = 0; k < line.length; k++) {
          const tok = line[k];
          const tw = ctx.measureText(tok).width;
          const mid = tx + tw / 2;
          const isPast = mid < slitX;
          const edgeFade = Math.min(clamp((tx - BAR_X0) / 40), clamp((BAR_X1 - (tx + tw)) / 40));
          ctx.fillStyle = isPast ? C.ink : C.muted;
          ctx.globalAlpha = a * rowAlpha * edgeFade * (isPast ? 0.85 : 0.62);
          ctx.fillText(tok, tx, ry + 1);
          tx += tw + 18;
        }
        ctx.restore();

        // Each recitation carries its own crisp amber attention slit!
        drawSlit(ctx, slitX, ry, baseH, { width: 3, alpha: rowAlpha, notch: 8 });
        ctx.restore();
      }

      ctx.restore();
    }

    // =========================================================================
    // ACT 5 — CODA: STRETCHED AND GATHERED (108.05 -> 121.50 s)
    // =========================================================================
    if (t >= shots.s10.start) {
      const a = smooth(win(t, shots.s10.start, shots.s10.start + 0.3));
      const gatherU = spring(t - (cues.gathered - 0.85), ...SPRINGS.heavy);

      ctx.save();
      ctx.globalAlpha = a;

      // Upper line transitions from Augustine's longing to the shared quiet symmetry (zero collision with bars!)
      const augOut = 1 - smooth(win(t, 113.8, 114.4));
      if (augOut > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * augOut;
        drawRubric(ctx, 'STRETCHED  AND  GATHERED', 112, smooth(win(t, shots.s10.start + 0.15, shots.s10.start + 0.6)));
        clipRevealText(ctx, 'Augustine longed to be gathered.', BAR_X0, 188, win(t, cues.scattered - 0.4, cues.scattered + 0.45), {
          font: '400 62px Display', color: C.ink,
        });
        ctx.restore();
      }

      const codaRubric = smooth(win(t, 114.5, 115.2));
      if (codaRubric > 0.01) {
        drawRubric(ctx, 'TWO KINDS OF MIND  ·  ONE STRUCTURE', 164, codaRubric);
      }

      // Two serene symmetrical three-zone bars aligned on ONE shared central amber slit!
      const barH = 112;
      const x0 = 240;
      const x1 = 1680;
      const bw = x1 - x0;

      // Clean vertical corridor: starts generously below y=188 headline (top of human bar >= 338), converges to 428 / 652
      const spreadY = lerp(146, 112, clamp(gatherU));
      const centerY = 540;
      const humanY = centerY - spreadY;
      const aiY = centerY + spreadY;

      // Ghost scattered bars fading away as we gather (kept strictly below y=250 headline corridor)
      if (gatherU < 0.96) {
        ctx.save();
        ctx.globalAlpha = a * (1 - clamp(gatherU)) * 0.25;
        ctx.strokeStyle = C.lineHi;
        ctx.lineWidth = 1;
        for (const gy of [285, 540, 795]) {
          ctx.strokeRect(x0, gy - 22, bw, 44);
        }
        ctx.restore();
      }

      // ---- TOP BAR: HUMAN (soft warm fading memory continuum, serif psalm) ----
      {
        const mg = ctx.createLinearGradient(x0, 0, SLIT_X, 0);
        mg.addColorStop(0, '#101014');
        mg.addColorStop(0.65, '#17161C');
        mg.addColorStop(1, '#211F26');
        ctx.fillStyle = mg;
        ctx.fillRect(x0, humanY - barH / 2, SLIT_X - x0, barH);
        ctx.fillStyle = '#16161C';
        ctx.fillRect(SLIT_X, humanY - barH / 2, x1 - SLIT_X, barH);
        ctx.strokeStyle = C.lineHi;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0, humanY - barH / 2, bw, barH);

        // Slow, gentle breathing serif text drifting through human slit (with clean edge masks)
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 8, humanY - barH / 2 + 4, bw - 16, barH - 8);
        ctx.clip();
        ctx.font = '400 34px Display';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        let wx = SLIT_X - 420 - (t - shots.s10.start) * 18;
        for (let i = 0; i < PSALM_WORDS.length; i++) {
          const w = PSALM_WORDS[i];
          const ww = ctx.measureText(w).width;
          const d = (wx + ww / 2) - SLIT_X;
          const wa = d < 0 ? lerp(0.84, 0.16, clamp(-d / (SLIT_X - x0))) : lerp(0.72, 0.28, clamp(d / (x1 - SLIT_X)));
          const edgeM = Math.min(clamp((wx - x0) / 48), clamp((x1 - (wx + ww)) / 48));
          ctx.fillStyle = C.ink;
          ctx.globalAlpha = a * wa * edgeM;
          ctx.fillText(w, wx, humanY + 1);
          wx += ww + 18;
        }
        ctx.restore();

        // Label
        ctx.font = '600 18px UI';
        ctx.fillStyle = C.muted;
        ctx.textBaseline = 'bottom';
        drawTrackedText(ctx, 'HUMAN  ·  LIVED MEMORY', x0, humanY - barH / 2 - 14, 4, 'left');
      }

      // ---- BOTTOM BAR: AI (uniform crisp token context, next-token bars) ----
      {
        ctx.fillStyle = C.surfaceAI;
        ctx.fillRect(x0, aiY - barH / 2, bw, barH);
        ctx.strokeStyle = C.lineHi;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0, aiY - barH / 2, bw, barH);

        // Uniform past tokens left of slit (sized cleanly to fit without clipping the leftmost word)
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 8, aiY - barH / 2 + 4, SLIT_X - x0 - 16, barH - 8);
        ctx.clip();
        ctx.font = '500 19px UI';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const toks = ['Within', 'a', 'reply,', 'all', 'stays', 'visible', 'at', 'once'];
        let rx = SLIT_X - 22;
        for (let i = toks.length - 1; i >= 0; i--) {
          const tw = ctx.measureText(toks[i]).width;
          const cw = tw + 20;
          const cx = rx - cw;
          if (cx > x0 + 10) {
            ctx.fillStyle = '#1E202B';
            ctx.fillRect(cx, aiY - 21, cw, 42);
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 1;
            ctx.strokeRect(cx, aiY - 21, cw, 42);
            ctx.fillStyle = C.ink;
            ctx.globalAlpha = a * 0.88;
            ctx.fillText(toks[i], cx + cw / 2, aiY + 1);
          }
          rx = cx - 8;
        }
        ctx.restore();

        // Quiet candidate bars right of slit
        ctx.save();
        const rStartY = aiY - 30;
        for (let i = 0; i < 4; i++) {
          const [w, p] = AI_CANDIDATES[i];
          const ry = rStartY + i * 20;
          ctx.globalAlpha = a * (i === 0 ? 0.85 : lerp(0.5, 0.22, i / 3));
          ctx.font = '500 15px UI';
          ctx.fillStyle = i === 0 ? C.ink : C.muted;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(w, SLIT_X + 28, ry);
          ctx.fillStyle = i === 0 ? C.ink : C.lineHi;
          ctx.fillRect(SLIT_X + 132, ry - 3, p * 260, 6);
        }
        ctx.restore();

        // Label
        ctx.font = '600 18px UI';
        ctx.fillStyle = C.muted;
        ctx.textBaseline = 'bottom';
        drawTrackedText(ctx, 'AI  ·  CONTEXT WINDOW', x0, aiY - barH / 2 - 14, 4, 'left');
      }

      // Shared vertical zone captions between/under the bars
      ctx.font = '600 18px UI';
      ctx.fillStyle = C.dim;
      ctx.textBaseline = 'top';
      drawTrackedText(ctx, 'MEMORY', (x0 + SLIT_X) / 2, aiY + barH / 2 + 22, 5, 'center');
      drawTrackedText(ctx, 'ATTENTION', SLIT_X, aiY + barH / 2 + 22, 5, 'center');
      drawTrackedText(ctx, 'EXPECTATION', (SLIT_X + x1) / 2, aiY + barH / 2 + 22, 5, 'center');

      // ONE shared amber attention slit linking both human and machine bars!
      drawSlit(ctx, SLIT_X, humanY, barH, { width: 4.5, alpha: 1, notch: 14, pulse: pulse * 0.35 });
      drawSlit(ctx, SLIT_X, aiY, barH, { width: 4.5, alpha: 1, notch: 14, pulse: pulse * 0.35 });

      // Quiet connecting hairline between the two slits once gathered
      if (gatherU > 0.35) {
        ctx.save();
        ctx.globalAlpha = a * smooth(clamp((gatherU - 0.35) / 0.5)) * 0.5;
        ctx.strokeStyle = C.slit;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(SLIT_X, humanY + barH / 2 + 16);
        ctx.lineTo(SLIT_X, aiY - barH / 2 - 16);
        ctx.stroke();
        ctx.restore();
      }

      // Final honest closing line
      const endLine = win(t, cues.cant_tell - 0.55, cues.cant_tell + 0.3);
      if (endLine > 0.01) {
        clipRevealText(ctx, '“I honestly can’t tell.”', SLIT_X, 882, endLine, {
          font: 'italic 400 74px Display', color: C.ink, align: 'center',
        });
      }

      ctx.restore();
    }

    // Shared film grade: subtle vignette + seeded fine paper/film grain + clean bookend dips
    vignette(ctx, W, H, 0.24);
    grain(ctx, W, H, t, fps, 0.032);
    const fadeIn = 1 - smooth(win(t, 0.0, 0.45));
    const fadeOut = smooth(win(t, dur - 0.9, dur));
    dip(ctx, W, H, Math.max(fadeIn, fadeOut));
  }

  function resize() {
    canvas.width = window.innerWidth || DESIGN_W;
    canvas.height = window.innerHeight || DESIGN_H;
  }
  resize();
  window.addEventListener('resize', resize);

  window.seek = async t => {
    renderFrame(clamp(t, 0, dur));
  };
  await window.seek(0);
  window.__ready = true;

  // Live preview loop when opened directly in a browser (never in Playwright)
  if (!navigator.webdriver) {
    let t0 = performance.now();
    const loop = now => {
      renderFrame(((now - t0) / 1000) % dur);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
