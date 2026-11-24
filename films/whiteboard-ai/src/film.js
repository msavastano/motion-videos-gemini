// From Neuron to Transformer — deterministic HTML/JS whiteboard film.
// window.seek(t) paints frame t from scratch; nothing carries between frames.
import {
  getJSON, sequence, win, smooth, easeOut, lerp, clamp,
  spring, SPRINGS, dip, vignette, grain, pad,
} from './layers.js';
import {
  PALETTE, drawWhiteboardBase, linePts, circlePts, roundRectPts, quadBezierPts,
  drawInkPolyline, drawArrowHead, drawMarkerText, runStrokeSequence,
  computeEraserWipe, beginWipeLayer, applyWipeLayer, drawBlenderSprite,
} from './whiteboard.js';

const DESIGN_W = 1920, DESIGN_H = 1080;
const DRAFT = new URLSearchParams(location.search).has('draft');

export async function boot(canvas) {
  const W = innerWidth, H = innerHeight, K = W / DESIGN_W;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  await Promise.all([
    document.fonts.load('600 60px Display'),
    document.fonts.load('500 32px UI'),
  ]);

  const [plan, vo, beats, anchors] = await Promise.all([
    getJSON('plan.json'),
    getJSON('vo.json'),
    getJSON('beats.json'),
    getJSON('prep/hand_anchors.json'),
  ]);

  const S = Object.fromEntries(plan.shots.map(s => [s.id, s]));
  const C = vo.cues;
  const DUR = plan.duration;

  // Reusable 96-frame Blender RGBA hand/marker/eraser sprite library
  const sprites = sequence({
    url: i => `prep/frames_${DRAFT ? 480 : 1080}/f${pad(i + 1)}.png`,
    count: 96,
    fps: 24,
    start: 0,
    keep: 96,
  });
  async function getSprite(frame1Based) {
    const f = clamp(Math.round(frame1Based), 1, 96);
    const tFake = (f - 1 + 0.01) / 24;
    return sprites.at(tFake);
  }

  // Timeline windows exposed on window.TIMING
  const T = {
    s1: S.s01_neuron, s2: S.s02_network, s3: S.s03_tokens,
    s4: S.s04_llm, s5: S.s05_attention, s6: S.s06_pipeline,
    wipes: {
      tokens: [C.wipe_tokens, C.wipe_tokens + 1.25],
      attn: [C.wipe_attn, C.wipe_attn + 1.25],
      wrap: [C.wipe_wrap, C.wipe_wrap + 1.05],
    },
    capOff: [0.0, 0.85],
    capOn: [C.cap_on, C.cap_on + 0.95],
  };
  window.TIMING = T;

  // Precomputed deterministic ink geometry
  const G = {
    s1: {
      inputsY: [315, 530, 745],
      sumC: [915, 530],
      actBox: [1135, 425, 215, 210],
      outEnd: [1655, 530],
    },
    s2: {
      xs: [330, 740, 1140],
      ys: [
        [330, 540, 750],
        [270, 450, 630, 810],
        [430, 650],
      ],
      targetBox: [1430, 445, 250, 190],
    },
    s3: {
      words: ['The', 'cat', 'sat', 'on', 'the'],
      wordX: [275, 455, 625, 795, 965],
      vecNums: ['0.82', '-0.14', '0.51'],
      mapOrigin: [1220, 430, 460, 410],
    },
    s5: {
      words: ['The', 'animal', "didn't", 'cross', 'the', 'street', 'because', 'it', 'was', 'too', 'tired'],
    },
    s6: {
      stages: [
        { title: 'Words', sub: '"The cat sat..."', x: 145, w: 255 },
        { title: 'Tokens', sub: '[The] [cat] [sat]', x: 470, w: 270 },
        { title: 'Vectors', sub: '[0.82, -0.14]', x: 810, w: 265 },
        { title: 'Attention ×N', sub: 'context layers', x: 1145, w: 285 },
        { title: 'Next Token', sub: '→ "mat"', x: 1500, w: 275 },
      ],
    },
  };

  // Helper: draw moving pulse dot along a polyline
  function drawPulseDot(pts, u, color = PALETTE.cobalt, r = 10, alpha = 1) {
    if (u <= 0 || u >= 1) return;
    const n = pts.length - 1;
    const idx = Math.min(n - 1, Math.floor(u * n));
    const f = u * n - idx;
    const x = lerp(pts[idx][0], pts[idx + 1][0], f);
    const y = lerp(pts[idx][1], pts[idx + 1][1], f);
    ctx.save();
    ctx.globalAlpha = alpha * Math.sin(Math.PI * u) ** 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- SCENE 1: A SINGLE NEURON
  function drawScene1(t, alpha = 1, targetCtx = ctx) {
    if (alpha <= 0.01) return null;
    const c = targetCtx;
    c.save();
    c.globalAlpha = alpha;
    const { inputsY, sumC, actBox, outEnd } = G.s1;
    const weights = ['0.8', '0.3', '-0.5'];
    const labels = ['x₁', 'x₂', 'x₃'];
    const wireStarts = inputsY.map(y => [355, y]);
    const wireEnds = [
      [sumC[0] - 74, sumC[1] - 32],
      [sumC[0] - 78, sumC[1]],
      [sumC[0] - 74, sumC[1] + 32],
    ];
    const alive = win(t, C.neuron_alive, T.s1.end);

    const strokes = [
      {
        weight: 1.0,
        start: () => [140, 105],
        draw: u => drawMarkerText(c, '1. A Single Neuron', 140, 118, u, { font: '600 46px Display' }),
      },
      ...inputsY.map((y, i) => ({
        weight: 0.75,
        start: () => [270, y],
        draw: u => {
          const p = circlePts(270, y, 42, 10 + i);
          const tip = drawInkPolyline(c, p, u, { color: PALETTE.ink, width: 4.6, fill: 'rgba(255,255,255,0.8)' });
          if (u > 0.45) drawMarkerText(c, labels[i], 270, y, win(u, 0.45, 0.95), { font: '500 32px UI', align: 'center', baseline: 'middle' });
          return tip;
        },
      })),
      ...inputsY.map((y, i) => ({
        weight: 0.95,
        start: () => wireStarts[i],
        draw: u => {
          const p = linePts(wireStarts[i][0], wireStarts[i][1], wireEnds[i][0], wireEnds[i][1], 20 + i);
          const pulseW = alive > 0 ? 1.5 * Math.sin(alive * Math.PI * 4 - i * 0.7) : 0;
          const baseW = (i === 0 ? 5.2 : i === 1 ? 3.8 : 4.2) + Math.max(0, pulseW);
          const tip = drawInkPolyline(c, p, u, { color: i === 2 && alive > 0.2 ? PALETTE.terra : PALETTE.ink, width: baseW });
          drawArrowHead(c, p[p.length - 3], p[p.length - 1], u, { width: 4, size: 12 });
          if (u > 0.35) {
            const wx = lerp(wireStarts[i][0], wireEnds[i][0], 0.40);
            const wy = lerp(wireStarts[i][1], wireEnds[i][1], 0.40) - 28;
            drawMarkerText(c, `w${i + 1}=${weights[i]}`, wx, wy, win(u, 0.35, 0.95), {
              font: '500 26px UI',
              color: i === 2 ? PALETTE.terra : PALETTE.cobalt,
              align: 'center',
            });
          }
          if (alive > 0) {
            const phase = ((t - C.neuron_alive) * 0.85 - i * 0.14) % 1;
            if (phase > 0 && phase < 1) drawPulseDot(p, phase, i === 2 ? PALETTE.terra : PALETTE.cobalt, i === 0 ? 11 : 8);
          }
          return tip;
        },
      })),
      {
        weight: 1.0,
        start: () => [sumC[0], sumC[1] - 74],
        draw: u => {
          const p = circlePts(sumC[0], sumC[1], 74, 31);
          const flash = alive > 0 ? Math.max(0, Math.sin((t - C.neuron_alive) * Math.PI * 1.7)) : 0;
          const tip = drawInkPolyline(c, p, u, {
            color: PALETTE.ink,
            width: 5.2,
            fill: flash > 0.1 ? `rgba(29,95,214,${(0.14 * flash).toFixed(3)})` : 'rgba(255,255,255,0.85)',
          });
          if (u > 0.4) drawMarkerText(c, 'Σ', sumC[0], sumC[1], win(u, 0.4, 0.95), { font: '600 66px Display', align: 'center', baseline: 'middle' });
          return tip;
        },
      },
      {
        weight: 1.4,
        start: () => [sumC[0] + 74, sumC[1]],
        draw: u => {
          const link1 = linePts(sumC[0] + 74, sumC[1], actBox[0], sumC[1], 41);
          const u1 = win(u, 0, 0.25);
          const tip1 = drawInkPolyline(c, link1, u1, { width: 4.5 });
          drawArrowHead(c, link1[link1.length - 3], link1[link1.length - 1], u1, { size: 12 });

          const u2 = win(u, 0.20, 0.55);
          const boxPts = roundRectPts(actBox[0], actBox[1], actBox[2], actBox[3], 18, 42);
          const tip2 = drawInkPolyline(c, boxPts, u2, { width: 4.6, fill: 'rgba(255,255,255,0.9)' });

          const u3 = win(u, 0.50, 0.80);
          const sigPts = [];
          for (let k = 0; k <= 24; k++) {
            const x = k / 24;
            const s = 1 / (1 + Math.exp(-(x - 0.5) * 9));
            sigPts.push([
              lerp(actBox[0] + 28, actBox[0] + actBox[2] - 28, x),
              lerp(actBox[1] + actBox[3] - 34, actBox[1] + 34, s),
            ]);
          }
          const tip3 = drawInkPolyline(c, sigPts, u3, { color: PALETTE.cobalt, width: 5.2 });
          if (u3 > 0.4) drawMarkerText(c, 'activation', actBox[0] + actBox[2] / 2, actBox[1] + actBox[3] + 38, win(u3, 0.4, 1), { font: '500 25px UI', color: PALETTE.slate, align: 'center' });

          const u4 = win(u, 0.78, 1.0);
          const link2 = linePts(actBox[0] + actBox[2], sumC[1], outEnd[0], outEnd[1], 43);
          const tip4 = drawInkPolyline(c, link2, u4, { width: 5.0 });
          drawArrowHead(c, link2[link2.length - 3], link2[link2.length - 1], u4, { size: 15 });
          if (u4 > 0.55) {
            const outVal = alive > 0 ? (0.72 + 0.16 * Math.sin((t - C.neuron_alive) * 3.5)).toFixed(2) : '0.84';
            drawMarkerText(c, `out = ${outVal}`, outEnd[0] + 18, outEnd[1], win(u4, 0.55, 1), { font: '500 32px UI', color: PALETTE.cobalt, baseline: 'middle' });
          }

          if (alive > 0) {
            const ph = ((t - C.neuron_alive) * 0.85 - 0.35);
            if (ph > 0) {
              const p1 = (ph % 1);
              if (p1 < 0.35) drawPulseDot(link1, p1 / 0.35, PALETTE.cobalt, 10);
              else if (p1 < 0.68) drawPulseDot(sigPts, (p1 - 0.35) / 0.33, PALETTE.cobalt, 10);
              else drawPulseDot(link2, (p1 - 0.68) / 0.32, PALETTE.cobalt, 12);
            }
          }
          return u4 > 0 ? tip4 : u3 > 0 ? tip3 : u2 > 0 ? tip2 : tip1;
        },
      },
    ];

    const tip = runStrokeSequence(t, 0.88, C.neuron_alive - 0.05, strokes);
    c.restore();
    return tip;
  }

  // ---------------------------------------------------------------- SCENE 2: LAYERS & TRAINING
  function drawScene2(t, alpha = 1, targetCtx = ctx) {
    if (alpha <= 0.01) return null;
    const c = targetCtx;
    c.save();
    c.globalAlpha = alpha;
    const { xs, ys, targetBox } = G.s2;
    const fwd = win(t, C.forward, C.error);
    const alive = win(t, C.training_alive, T.s2.end);

    const conns = [];
    for (let l = 0; l < 2; l++) {
      for (let i = 0; i < ys[l].length; i++) {
        for (let j = 0; j < ys[l + 1].length; j++) {
          const id = l * 12 + i * 4 + j;
          const w0 = 2.0 + ((id * 7) % 5) * 0.7;
          const targetW = ((i + j) % 2 === 0) ? 7.2 : 1.7;
          const nudgedW = lerp(w0, targetW, alive > 0 ? smooth(win(t, C.training_alive + 0.5, T.s2.end - 0.8)) : 0);
          conns.push({
            l, i, j, id,
            pts: linePts(xs[l] + 36, ys[l][i], xs[l + 1] - 36, ys[l + 1][j], 100 + id, 8, 0.9),
            w: nudgedW,
            strong: targetW > 4,
          });
        }
      }
    }

    const strokes = [
      {
        weight: 0.9,
        start: () => [140, 105],
        draw: u => drawMarkerText(c, '2. Layers & Training', 140, 118, u, { font: '600 46px Display' }),
      },
      {
        weight: 1.5,
        start: () => [xs[0], ys[0][0]],
        draw: u => {
          let tip = null;
          const nodes = [];
          for (let l = 0; l < 3; l++) for (let i = 0; i < ys[l].length; i++) nodes.push([xs[l], ys[l][i], l]);
          nodes.forEach(([nx, ny, l], idx) => {
            const nu = win(u, idx / nodes.length * 0.82, (idx + 1.0) / nodes.length);
            if (nu > 0) {
              const fwdGlow = fwd > 0 ? Math.max(0, Math.sin(clamp((t - C.forward - l * 0.45) * 3.5, 0, Math.PI))) : 0;
              tip = drawInkPolyline(c, circlePts(nx, ny, 35, 140 + idx, 28, 0.8), nu, {
                color: fwdGlow > 0.2 ? PALETTE.cobalt : PALETTE.ink,
                width: 4.2,
                fill: fwdGlow > 0.15 ? `rgba(29,95,214,${(0.22 * fwdGlow).toFixed(3)})` : 'rgba(255,255,255,0.9)',
              });
            }
          });
          if (u > 0.85) {
            const lu = win(u, 0.85, 1.0);
            drawMarkerText(c, 'Input', xs[0], 905, lu, { font: '500 26px UI', color: PALETTE.slate, align: 'center' });
            drawMarkerText(c, 'Hidden Layer', xs[1], 905, lu, { font: '500 26px UI', color: PALETTE.slate, align: 'center' });
            drawMarkerText(c, 'Output', xs[2], 905, lu, { font: '500 26px UI', color: PALETTE.slate, align: 'center' });
          }
          return tip;
        },
      },
      {
        weight: 1.5,
        start: () => [xs[0] + 36, ys[0][0]],
        draw: u => {
          let tip = null;
          conns.forEach((cn, idx) => {
            const cu = win(u, idx / conns.length * 0.85, (idx + 1.1) / conns.length);
            if (cu > 0) {
              const hi = alive > 0 && cn.strong;
              tip = drawInkPolyline(c, cn.pts, cu, {
                color: hi ? PALETTE.cobalt : 'rgba(28,35,49,0.55)',
                width: cn.w,
              });
            }
          });
          return tip;
        },
      },
      {
        weight: 1.0,
        start: () => [targetBox[0], targetBox[1]],
        draw: u => {
          const u1 = win(u, 0, 0.45);
          const linkOut = linePts(xs[2] + 38, 540, targetBox[0], 540, 180);
          drawInkPolyline(c, linkOut, u1, { width: 4.5 });
          drawArrowHead(c, linkOut[linkOut.length - 3], linkOut[linkOut.length - 1], u1, { size: 12 });
          const u2 = win(u, 0.30, 0.96);
          const tip = drawInkPolyline(c, roundRectPts(targetBox[0], targetBox[1], targetBox[2], targetBox[3], 16, 181), u2, {
            width: 4.5,
            fill: 'rgba(255,255,255,0.9)',
          });
          if (u2 > 0.45) {
            const errVal = alive > 0 ? lerp(0.42, 0.04, smooth(win(t, C.training_alive, T.s2.end - 0.8))).toFixed(2) : '0.42';
            drawMarkerText(c, 'Target', targetBox[0] + targetBox[2] / 2, targetBox[1] + 68, win(u2, 0.45, 0.9), { font: '600 32px Display', align: 'center' });
            drawMarkerText(c, `err: ${errVal}`, targetBox[0] + targetBox[2] / 2, targetBox[1] + 132, win(u2, 0.6, 1.0), {
              font: '500 28px UI',
              color: Number(errVal) < 0.15 ? PALETTE.cobalt : PALETTE.terra,
              align: 'center',
            });
          }
          return tip;
        },
      },
    ];

    const tipMain = runStrokeSequence(t, T.s2.start + 0.9, C.error - 0.1, strokes);

    const errArcPts = quadBezierPts(targetBox[0] + 60, targetBox[1] + targetBox[3] + 12, 860, 990, xs[0], 830, 34);
    const errU = win(t, C.error, C.training_alive - 0.15);
    let tipErr = null;
    if (errU > 0) {
      tipErr = drawInkPolyline(c, errArcPts, errU, { color: PALETTE.terra, width: 4.6, dash: [14, 10] });
      drawArrowHead(c, errArcPts[errArcPts.length - 3], errArcPts[errArcPts.length - 1], errU, { color: PALETTE.terra, size: 14 });
      if (errU > 0.35) {
        drawMarkerText(c, 'error signal (nudge weights)', 860, 960, win(errU, 0.35, 0.95), { font: '500 26px UI', color: PALETTE.terra, align: 'center' });
      }
    }

    if (fwd > 0 && t < C.error && targetCtx === ctx) {
      const ph = ((t - C.forward) * 0.75) % 1;
      conns.forEach(cn => {
        const segU = cn.l === 0 ? clamp(ph * 2) : clamp((ph - 0.45) * 2);
        if (segU > 0 && segU < 1) drawPulseDot(cn.pts, segU, PALETTE.cobalt, 7);
      });
    }
    if (alive > 0 && targetCtx === ctx) {
      const cyc = ((t - C.training_alive) * 0.55) % 1;
      if (cyc < 0.48) {
        drawPulseDot(errArcPts, cyc / 0.48, PALETTE.terra, 11);
      } else {
        const fph = (cyc - 0.48) / 0.52;
        conns.filter(cn => cn.strong).forEach(cn => {
          const segU = cn.l === 0 ? clamp(fph * 2) : clamp((fph - 0.45) * 2);
          if (segU > 0 && segU < 1) drawPulseDot(cn.pts, segU, PALETTE.cobalt, 8.5);
        });
      }
    }

    c.restore();
    return (t >= C.error && t < C.training_alive - 0.05) ? (tipErr ? { ...tipErr, drawing: true, lift: 0 } : null) : tipMain;
  }

  // ---------------------------------------------------------------- SCENE 3: TOKENS & VECTORS
  function drawScene3(t, alpha = 1, keepHeaderOnly = false, targetCtx = ctx, headerSlideU = 0) {
    if (alpha <= 0.01) return null;
    const c = targetCtx;
    c.save();
    c.globalAlpha = alpha;
    const { words, wordX, vecNums, mapOrigin } = G.s3;
    const alive = win(t, C.vectors_alive, T.s3.end);
    const slideU = alive > 0 ? smooth(win(t, C.vectors_alive, C.vectors_alive + 1.1)) : 0;

    const rowY = keepHeaderOnly ? lerp(310, 225, smooth(headerSlideU)) : lerp(295, 310, slideU);

    const strokes = [
      {
        weight: 0.8,
        start: () => [140, 105],
        draw: u => keepHeaderOnly ? null : drawMarkerText(c, '3. Tokens & Vectors', 140, 118, u, { font: '600 46px Display' }),
      },
      {
        weight: 1.3,
        start: () => [220, 295],
        draw: u => {
          let tip = null;
          words.forEach((w, i) => {
            const wu = win(u, i / words.length * 0.80, (i + 0.95) / words.length);
            const targetX = lerp(wordX[i], 235 + i * 162, slideU);
            const tTip = drawMarkerText(c, w, targetX, rowY, wu, {
              font: '600 46px Display',
              color: i === 1 && !keepHeaderOnly ? PALETTE.cobalt : PALETTE.ink,
              align: 'center',
              baseline: 'middle',
            });
            if (wu > 0 && wu < 1) tip = tTip;
          });
          return tip;
        },
      },
      {
        weight: 1.1,
        start: () => [200, 250],
        draw: u => {
          let tip = null;
          words.forEach((_, i) => {
            const bu = win(u, i / words.length * 0.78, (i + 0.92) / words.length);
            const cx = lerp(wordX[i], 235 + i * 162, slideU);
            const bw = i === 0 || i === 4 ? 120 : 128;
            const bPts = roundRectPts(cx - bw / 2, rowY - 46, bw, 92, 14, 210 + i);
            const bTip = drawInkPolyline(c, bPts, bu, {
              color: i === 1 && !keepHeaderOnly ? PALETTE.cobalt : PALETTE.ink,
              width: 3.8,
            });
            if (bu > 0 && bu < 1) tip = bTip;
          });
          return tip;
        },
      },
    ];

    if (!keepHeaderOnly) {
      strokes.push(
        {
          weight: 1.2,
          start: () => [455, 360],
          draw: u => {
            const catX = lerp(wordX[1], 235 + 162, slideU);
            const arr = linePts(catX, rowY + 52, 410, 560, 230);
            const u1 = win(u, 0, 0.35);
            drawInkPolyline(c, arr, u1, { color: PALETTE.cobalt, width: 4.2 });
            drawArrowHead(c, arr[arr.length - 3], arr[arr.length - 1], u1, { color: PALETTE.cobalt, size: 12 });

            const u2 = win(u, 0.25, 0.96);
            const boxPts = roundRectPts(195, 570, 515, 285, 16, 231);
            const tip = drawInkPolyline(c, boxPts, u2, { width: 4.2, fill: 'rgba(255,255,255,0.92)' });
            if (u2 > 0.35) {
              drawMarkerText(c, 'vector("cat")', 230, 622, win(u2, 0.35, 0.7), { font: '500 28px UI', color: PALETTE.cobalt });
              vecNums.forEach((n, idx) => {
                const nu = win(u2, 0.5 + idx * 0.12, 0.85 + idx * 0.05);
                const y = 682 + idx * 54;
                drawMarkerText(c, n, 240, y, nu, { font: '500 30px UI' });
                const mag = Math.abs(Number(n));
                const barU = alive > 0 ? smooth(win(t, C.vectors_alive + idx * 0.12, C.vectors_alive + 0.85)) : nu;
                c.save();
                c.fillStyle = Number(n) < 0 ? PALETTE.terra : PALETTE.cobalt;
                c.fillRect(365, y - 22, 290 * mag * barU, 22);
                c.restore();
              });
            }
            return tip;
          },
        },
        {
          weight: 1.2,
          start: () => [mapOrigin[0], mapOrigin[1] + mapOrigin[3]],
          draw: u => {
            const [mx, my, mw, mh] = mapOrigin;
            const axX = linePts(mx, my + mh, mx + mw, my + mh, 240);
            const axY = linePts(mx, my + mh, mx, my, 241);
            const u1 = win(u, 0, 0.35);
            const u2 = win(u, 0.30, 0.65);
            const tip1 = drawInkPolyline(c, axX, u1, { color: PALETTE.slate, width: 3.6 });
            const tip2 = drawInkPolyline(c, axY, u2, { color: PALETTE.slate, width: 3.6 });
            drawArrowHead(c, axX[axX.length - 3], axX[axX.length - 1], u1, { color: PALETTE.slate, size: 10 });
            drawArrowHead(c, axY[axY.length - 3], axY[axY.length - 1], u2, { color: PALETTE.slate, size: 10 });

            const u3 = win(u, 0.55, 1.0);
            const pts = [
              { label: 'cat', x: mx + 310, y: my + 115, c: PALETTE.cobalt },
              { label: 'dog', x: mx + 360, y: my + 155, c: PALETTE.cobalt },
              { label: 'car', x: mx + 115, y: my + 310, c: PALETTE.slate },
            ];
            let tip3 = null;
            pts.forEach((pt, i) => {
              const pu = win(u3, i * 0.25, 0.55 + i * 0.2);
              const pulse = alive > 0 && i < 2 ? 1 + 0.32 * Math.sin((t - C.vectors_alive) * 5.0 - i) : 1;
              tip3 = drawInkPolyline(c, circlePts(pt.x, pt.y, 12 * pulse, 250 + i, 20), pu, { color: pt.c, width: 4, fill: pt.c });
              if (pu > 0.4) drawMarkerText(c, pt.label, pt.x + 22, pt.y, win(pu, 0.4, 1), { font: '500 28px UI', color: pt.c, baseline: 'middle' });
            });
            if (alive > 0) {
              const dashU = win(t, C.vectors_alive, C.vectors_alive + 0.7);
              drawInkPolyline(c, linePts(pts[0].x, pts[0].y, pts[1].x, pts[1].y, 260), dashU, { color: PALETTE.cobalt, width: 2.5, dash: [8, 8] });
            }
            return u3 > 0 ? tip3 : u2 > 0 ? tip2 : tip1;
          },
        },
      );
    }

    const tip = runStrokeSequence(t, C.wipe_tokens + 1.35, C.vectors_alive - 0.05, strokes);
    c.restore();
    return keepHeaderOnly ? null : tip;
  }

  // ---------------------------------------------------------------- SCENE 4: LLM NEXT TOKEN
  function drawScene4(t, alpha = 1, targetCtx = ctx) {
    if (alpha <= 0.01) return null;
    const c = targetCtx;
    c.save();
    c.globalAlpha = alpha;
    const pickU = win(t, C.pick_mat, C.loop_alive);
    const loopU = win(t, C.loop_alive, T.s4.end);
    const loopSlide = smooth(win(t, C.loop_alive, C.loop_alive + 1.4));

    const strokes = [
      {
        weight: 0.7,
        start: () => [140, 105],
        draw: u => drawMarkerText(c, '4. Next-Token Prediction', 140, 118, u, { font: '600 46px Display' }),
      },
      {
        weight: 1.2,
        start: () => [555, 290],
        draw: u => {
          const arr1 = linePts(555, 286, 555, 445, 301);
          const u1 = win(u, 0, 0.25);
          const tip1 = drawInkPolyline(c, arr1, u1, { width: 4.5 });
          drawArrowHead(c, arr1[arr1.length - 3], arr1[arr1.length - 1], u1, { size: 12 });

          const u2 = win(u, 0.2, 0.75);
          const boxPts = roundRectPts(380, 460, 355, 195, 20, 302);
          const tip = drawInkPolyline(c, boxPts, u2, { width: 5.0, fill: 'rgba(255,255,255,0.92)' });
          if (u2 > 0.35) {
            drawMarkerText(c, 'LLM', 557, 542, win(u2, 0.35, 0.75), { font: '600 58px Display', align: 'center', baseline: 'middle' });
            drawMarkerText(c, 'scores vocabulary', 557, 608, win(u2, 0.55, 1.0), { font: '500 24px UI', color: PALETTE.slate, align: 'center' });
          }

          const u3 = win(u, 0.70, 1.0);
          const arr2 = linePts(742, 555, 965, 555, 303);
          const tip3 = drawInkPolyline(c, arr2, u3, { color: PALETTE.cobalt, width: 4.8 });
          drawArrowHead(c, arr2[arr2.length - 3], arr2[arr2.length - 1], u3, { color: PALETTE.cobalt, size: 14 });
          return u3 > 0 ? tip3 : u2 > 0 ? tip : tip1;
        },
      },
      {
        weight: 1.5,
        start: () => [1020, 415],
        draw: u => {
          const cands = [
            { w: 'mat', p: 0.72, y: 415, win: true },
            { w: 'rug', p: 0.14, y: 555, win: false },
            { w: 'floor', p: 0.06, y: 695, win: false },
          ];
          let tip = null;
          cands.forEach((cd, idx) => {
            const cu = win(u, idx * 0.25, 0.45 + idx * 0.25);
            const rowPts = roundRectPts(1000, cd.y - 48, 690, 96, 14, 310 + idx);
            const hi = cd.win && pickU > 0;
            tip = drawInkPolyline(c, rowPts, cu, {
              color: hi ? PALETTE.terra : PALETTE.ink,
              width: hi ? 5.2 : 3.8,
              fill: hi ? 'rgba(214,69,39,0.08)' : 'rgba(255,255,255,0.88)',
            });
            if (cu > 0.25) {
              drawMarkerText(c, `"${cd.w}"`, 1030, cd.y, win(cu, 0.25, 0.6), {
                font: '600 34px Display',
                color: hi ? PALETTE.terra : PALETTE.ink,
                baseline: 'middle',
              });
              const barGrow = smooth(win(cu, 0.45, 1.0));
              c.save();
              c.fillStyle = hi ? PALETTE.terra : cd.win ? PALETTE.cobalt : PALETTE.slate;
              c.fillRect(1220, cd.y - 16, 360 * cd.p * barGrow, 32);
              c.restore();
              drawMarkerText(c, `${Math.round(cd.p * 100)}%`, 1605, cd.y, win(cu, 0.65, 1.0), {
                font: '500 28px UI',
                color: hi ? PALETTE.terra : PALETTE.ink,
                baseline: 'middle',
              });
            }
          });
          if (pickU > 0) {
            const cPts = circlePts(1082, 415, 58, 320, 32, 1.3);
            drawInkPolyline(c, cPts, win(t, C.pick_mat, C.pick_mat + 0.65), { color: PALETTE.terra, width: 4.5 });
          }
          return tip;
        },
      },
    ];

    const tip = runStrokeSequence(t, T.s4.start + 0.85, C.pick_mat - 0.1, strokes);

    if (loopU > 0) {
      const matX = lerp(1082, 1045, loopSlide);
      const matY = lerp(415, 225, loopSlide) - Math.sin(Math.PI * loopSlide) * 140;
      const bw = 128;
      c.save();
      const boxPts = roundRectPts(matX - bw / 2, matY - 46, bw, 92, 14, 330);
      drawInkPolyline(c, boxPts, 1, { color: PALETTE.terra, width: 4.5, fill: 'rgba(214,69,39,0.10)' });
      drawMarkerText(c, 'mat', matX, matY, 1, { font: '600 46px Display', color: PALETTE.terra, align: 'center', baseline: 'middle' });
      c.restore();

      const fbArc = quadBezierPts(1000, 415, 820, 120, 1045, 280, 24);
      drawInkPolyline(c, fbArc, win(t, C.loop_alive, C.loop_alive + 1.0), { color: PALETTE.terra, width: 3.4, dash: [10, 8] });

      const nextCycle = win(t, C.loop_alive + 1.6, T.s4.end - 0.3);
      if (nextCycle > 0) {
        const dotX = 1190;
        const bPts = roundRectPts(dotX - 48, 225 - 46, 96, 92, 14, 331);
        drawInkPolyline(c, bPts, nextCycle, { color: PALETTE.cobalt, width: 4.2, fill: PALETTE.cobaltSoft });
        drawMarkerText(c, '.', dotX, 225, nextCycle, { font: '600 50px Display', color: PALETTE.cobalt, align: 'center', baseline: 'middle' });
      }
    }

    c.restore();
    return tip;
  }

  // ---------------------------------------------------------------- SCENE 5: TRANSFORMER SELF-ATTENTION
  function drawScene5(t, alpha = 1, targetCtx = ctx) {
    if (alpha <= 0.01) return null;
    const c = targetCtx;
    c.save();
    c.globalAlpha = alpha;
    const words = G.s5.words;
    const attnAlive = win(t, C.attn_alive, T.s5.end);
    const stackU = win(t, C.stack_layers, T.s5.end);

    c.font = '600 44px Display';
    const widths = words.map(w => c.measureText(w).width);
    const gap = 28;
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
    let curX = (DESIGN_W - totalW) / 2;
    const wordCenters = words.map((w, i) => {
      const cx = curX + widths[i] / 2;
      curX += widths[i] + gap;
      return cx;
    });
    const sentY = 405;
    const itX = wordCenters[7];
    const animalX = wordCenters[1];
    const streetX = wordCenters[5];

    const arcAnimal = quadBezierPts(itX, sentY - 46, (itX + animalX) / 2, 120, animalX, sentY - 46, 36);
    const arcStreet = quadBezierPts(itX, sentY - 46, (itX + streetX) / 2, 245, streetX, sentY - 46, 28);

    const strokes = [
      {
        weight: 0.7,
        start: () => [140, 105],
        draw: u => drawMarkerText(c, '5. Transformer Self-Attention', 140, 118, u, { font: '600 46px Display' }),
      },
      {
        weight: 1.5,
        start: () => [wordCenters[0], sentY],
        draw: u => {
          let tip = null;
          words.forEach((w, i) => {
            const wu = win(u, i / words.length * 0.85, (i + 1.0) / words.length);
            const color = (i === 7 || (i === 1 && attnAlive > 0)) ? PALETTE.cobalt : PALETTE.ink;
            const wTip = drawMarkerText(c, w, wordCenters[i], sentY, wu, {
              font: '600 44px Display',
              color,
              align: 'center',
              baseline: 'middle',
            });
            if (wu > 0 && wu < 1) tip = wTip;
          });
          return tip;
        },
      },
      {
        weight: 1.3,
        start: () => [itX, sentY - 42],
        draw: u => {
          const uCircle = win(u, 0, 0.25);
          const uArc1 = win(u, 0.2, 0.68);
          const uArc2 = win(u, 0.62, 1.0);
          const pulseA = attnAlive > 0 ? 1 + 0.35 * Math.sin((t - C.attn_alive) * 5.0) : 1;

          const cTip = drawInkPolyline(c, circlePts(itX, sentY, 42, 401), uCircle, { color: PALETTE.cobalt, width: 4.6 });
          const a1Tip = drawInkPolyline(c, arcAnimal, uArc1, {
            color: PALETTE.cobalt,
            width: attnAlive > 0 ? 7.5 * (0.85 + 0.15 * pulseA) : 5.2,
          });
          drawArrowHead(c, arcAnimal[arcAnimal.length - 3], arcAnimal[arcAnimal.length - 1], uArc1, { color: PALETTE.cobalt, width: 5, size: 15 });

          const a2Tip = drawInkPolyline(c, arcStreet, uArc2, {
            color: PALETTE.slate,
            width: attnAlive > 0 ? 2.6 : 3.4,
            alpha: attnAlive > 0 ? 0.65 : 0.85,
          });
          drawArrowHead(c, arcStreet[arcStreet.length - 3], arcStreet[arcStreet.length - 1], uArc2, { color: PALETTE.slate, size: 11, alpha: attnAlive > 0 ? 0.65 : 0.85 });

          if (attnAlive > 0) {
            drawMarkerText(c, '0.84', (itX + animalX) / 2, 200, win(t, C.attn_alive, C.attn_alive + 0.15), {
              font: '500 32px UI',
              color: PALETTE.cobalt,
              align: 'center',
            });
            drawMarkerText(c, '0.11', (itX + streetX) / 2, 344, win(t, C.attn_alive + 0.04, C.attn_alive + 0.18), {
              font: '500 24px UI',
              color: PALETTE.slate,
              align: 'center',
            });
            if (targetCtx === ctx) {
              const ph = ((t - C.attn_alive) * 0.9) % 1;
              drawPulseDot(arcAnimal, ph, PALETTE.cobalt, 11);
            }
          }
          return uArc2 > 0 ? a2Tip : uArc1 > 0 ? a1Tip : cTip;
        },
      },
    ];

    const tipSent = runStrokeSequence(t, C.wipe_attn + 1.35, C.attn_alive - 0.05, strokes);

    let tipStack = null;
    if (stackU > 0) {
      const layerCount = 4;
      const drawStackU = win(t, C.stack_layers, C.stack_layers + 2.2);
      for (let i = 0; i < layerCount; i++) {
        const lu = win(drawStackU, i / layerCount * 0.78, (i + 1) / layerCount);
        const ly = 845 - i * 86;
        const lw = 680 - i * 18;
        const lx = (DESIGN_W - lw) / 2;
        const activeLayer = stackU > 0.45 ? Math.sin((t - C.stack_layers) * 4.5 - i * 0.9) > 0.35 : false;
        const lPts = roundRectPts(lx, ly, lw, 64, 12, 420 + i);
        const tL = drawInkPolyline(c, lPts, lu, {
          color: activeLayer ? PALETTE.cobalt : PALETTE.ink,
          width: activeLayer ? 4.8 : 3.8,
          fill: activeLayer ? PALETTE.cobaltSoft : 'rgba(255,255,255,0.9)',
        });
        if (lu > 0.35) {
          drawMarkerText(c, `Transformer Layer ${i === 3 ? 'N' : i + 1}`, DESIGN_W / 2, ly + 32, win(lu, 0.35, 0.9), {
            font: '500 26px UI',
            color: activeLayer ? PALETTE.cobalt : PALETTE.ink,
            align: 'center',
            baseline: 'middle',
          });
        }
        if (lu > 0 && lu < 1) tipStack = tL;
      }
      if (drawStackU > 0.7) {
        drawMarkerText(c, '× N Layers', 1420, 720, win(drawStackU, 0.7, 1), { font: '600 40px Display', color: PALETTE.cobalt });
      }
    }

    c.restore();
    return (t >= C.stack_layers && t < C.stack_layers + 2.2 && tipStack) ? { ...tipStack, drawing: true, lift: 0 } : tipSent;
  }

  // ---------------------------------------------------------------- SCENE 6: FULL PIPELINE WRAP-UP
  function drawScene6(t) {
    const { stages } = G.s6;
    const aliveU = win(t, C.pipeline_alive, DUR);
    const pulsePos = aliveU > 0 ? smooth(win(t, C.pipeline_alive, 97.1)) * stages.length : -1;

    const strokes = [
      {
        weight: 0.9,
        start: () => [140, 125],
        draw: u => drawMarkerText(ctx, 'From Neuron to Transformer', 140, 138, u, { font: '600 54px Display' }),
      },
      ...stages.map((st, idx) => ({
        weight: 1.0,
        start: () => [st.x, 420],
        draw: u => {
          const lit = pulsePos >= idx - 0.15 && pulsePos <= idx + 1.1;
          const passed = pulsePos > idx;
          const bPts = roundRectPts(st.x, 415, st.w, 190, 18, 500 + idx);
          const tip = drawInkPolyline(ctx, bPts, win(u, 0, 0.75), {
            color: (lit || passed) ? (idx === 4 ? PALETTE.terra : PALETTE.cobalt) : PALETTE.ink,
            width: lit ? 6.0 : 4.5,
            fill: lit ? (idx === 4 ? PALETTE.terraSoft : PALETTE.cobaltSoft) : 'rgba(255,255,255,0.92)',
          });
          if (u > 0.3) {
            drawMarkerText(ctx, st.title, st.x + st.w / 2, 488, win(u, 0.3, 0.75), {
              font: '600 34px Display',
              color: idx === 4 ? PALETTE.terra : PALETTE.ink,
              align: 'center',
              baseline: 'middle',
            });
            drawMarkerText(ctx, st.sub, st.x + st.w / 2, 552, win(u, 0.5, 0.95), {
              font: '500 22px UI',
              color: idx === 4 ? PALETTE.terra : PALETTE.slate,
              align: 'center',
              baseline: 'middle',
            });
          }
          if (idx < stages.length - 1) {
            const nxt = stages[idx + 1];
            const arr = linePts(st.x + st.w + 8, 510, nxt.x - 8, 510, 520 + idx);
            const au = win(u, 0.72, 1.0);
            drawInkPolyline(ctx, arr, au, { color: passed ? PALETTE.cobalt : PALETTE.ink, width: 4.2 });
            drawArrowHead(ctx, arr[arr.length - 3], arr[arr.length - 1], au, { color: passed ? PALETTE.cobalt : PALETTE.ink, size: 12 });
          }
          return tip;
        },
      })),
      {
        weight: 0.8,
        start: () => [960, 770],
        draw: u => {
          const cap = drawMarkerText(ctx, 'Weighted sums  →  Tokens  →  Vectors  →  Attention  →  Next Word', 960, 775, u, {
            font: '500 28px UI',
            color: PALETTE.slate,
            align: 'center',
          });
          return cap;
        },
      },
    ];

    const tip = runStrokeSequence(t, C.wipe_wrap + 1.15, C.cap_on - 0.15, strokes);

    if (aliveU > 0) {
      const fullLine = linePts(stages[0].x + 20, 365, stages[4].x + stages[4].w - 20, 365, 555, 24, 0.5);
      const sweepU = smooth(win(t, C.pipeline_alive, 97.1));
      drawInkPolyline(ctx, fullLine, sweepU, { color: PALETTE.cobalt, width: 5.0 });
      if (sweepU > 0 && sweepU < 0.99) drawPulseDot(fullLine, sweepU, PALETTE.cobalt, 12);
    }

    return tip;
  }

  // ---------------------------------------------------------------- MASTER FRAME DRAW
  async function draw(t) {
    drawWhiteboardBase(ctx, W, H);
    ctx.save();
    ctx.setTransform(K, 0, 0, K, 0, 0);

    let activeTip = null;
    let activeWipe = null;

    if (t < T.s1.end) {
      activeTip = drawScene1(t, 1);
    } else if (t < T.s2.end) {
      const panU = smooth(win(t, T.s2.start, T.s2.start + 0.85));
      if (panU < 1) {
        ctx.save();
        ctx.translate(-DESIGN_W * panU, 0);
        drawScene1(T.s1.end - 0.01, 1 - panU * 0.6);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(DESIGN_W * (1 - panU), 0);
      activeTip = drawScene2(t, 1);
      ctx.restore();
    } else if (t < T.s3.end) {
      const [w0, w1] = T.wipes.tokens;
      if (t < w0) {
        drawScene2(t, 1);
      } else if (t < w1) {
        const wu = win(t, w0, w1);
        activeWipe = computeEraserWipe(wu);
        const wctx = beginWipeLayer(W, H);
        wctx.setTransform(K, 0, 0, K, 0, 0);
        drawScene2(T.s2.end - 0.01, 1, wctx);
        applyWipeLayer(ctx, W, H, K, activeWipe);
      } else {
        activeTip = drawScene3(t, 1, false);
      }
    } else if (t < T.s4.end) {
      const slideUp = win(t, T.s4.start, T.s4.start + 0.9);
      drawScene3(T.s3.end - 0.01, 1, true, ctx, slideUp);
      activeTip = drawScene4(t, 1);
    } else if (t < T.s5.end) {
      const [w0, w1] = T.wipes.attn;
      if (t < w0) {
        drawScene3(T.s3.end - 0.01, 1, true, ctx, 1);
        drawScene4(t, 1);
      } else if (t < w1) {
        const wu = win(t, w0, w1);
        activeWipe = computeEraserWipe(wu);
        const wctx = beginWipeLayer(W, H);
        wctx.setTransform(K, 0, 0, K, 0, 0);
        drawScene3(T.s3.end - 0.01, 1, true, wctx, 1);
        drawScene4(T.s4.end - 0.01, 1, wctx);
        applyWipeLayer(ctx, W, H, K, activeWipe);
      } else {
        activeTip = drawScene5(t, 1);
      }
    } else {
      const [w0, w1] = T.wipes.wrap;
      if (t < w0) {
        drawScene5(t, 1);
      } else if (t < w1) {
        const wu = win(t, w0, w1);
        activeWipe = computeEraserWipe(wu);
        const wctx = beginWipeLayer(W, H);
        wctx.setTransform(K, 0, 0, K, 0, 0);
        drawScene5(T.s5.end - 0.01, 1, wctx);
        applyWipeLayer(ctx, W, H, K, activeWipe);
      } else {
        activeTip = drawScene6(t);
      }
    }

    // ---- Layer Blender RGBA Hand / Eraser over the board ----
    if (activeWipe) {
      const f = 73 + (Math.floor(t * 24) % 24);
      const img = await getSprite(f);
      drawBlenderSprite(ctx, img, anchors.eraser[String(f)], activeWipe.x, activeWipe.y, {
        spriteSize: 2240,
        spriteH: 1680,
        lift: 0.05,
        alpha: 1,
      });
    } else if (t < T.capOff[1]) {
      // Cap pops off at start (frames 1..24)
      const u = win(t, T.capOff[0], T.capOff[1]);
      const f = 1 + Math.round(u * 23);
      const img = await getSprite(f);
      const enter = smooth(win(t, 0, 0.35));
      drawBlenderSprite(ctx, img, anchors.tip[String(f)], lerp(420, 140, enter), lerp(420, 105, enter), {
        spriteSize: 2360,
        spriteH: 1770,
        lift: (1 - u) * 0.4,
        alpha: enter,
      });
    } else if (t >= T.capOn[0]) {
      // Cap snaps back on and hand lifts out of frame (frames 24..1)
      const u = win(t, T.capOn[0], T.capOn[1]);
      const exit = smooth(win(t, T.capOn[1], T.capOn[1] + 0.9));
      const f = 24 - Math.round(u * 23);
      const img = await getSprite(f);
      drawBlenderSprite(
        ctx,
        img,
        anchors.tip[String(f)],
        lerp(1360, 2150, exit),
        lerp(760, 1180, exit),
        { spriteSize: 2360, spriteH: 1770, lift: 0.25 + exit * 0.8, alpha: 1 - exit },
      );
    } else if (activeTip) {
      const f = activeTip.drawing
        ? 25 + (Math.floor(t * 24) % 24)
        : 49 + Math.round(clamp(activeTip.lift) * 11);
      const img = await getSprite(f);
      drawBlenderSprite(ctx, img, anchors.tip[String(f)], activeTip.x, activeTip.y, {
        spriteSize: 2360,
        spriteH: 1770,
        lift: activeTip.lift || 0,
      });
    } else {
      // During living animations, rest the hand smoothly at bottom-right edge so board is unobstructed
      const f = 58;
      const img = await getSprite(f);
      drawBlenderSprite(ctx, img, anchors.tip[String(f)], 1740, 910, {
        spriteSize: 2360,
        spriteH: 1770,
        lift: 0.65,
        alpha: 0.92,
      });
    }

    ctx.restore();

    // ---- Shared subtle studio grade ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    vignette(ctx, W, H, 0.14);
    grain(ctx, W, H, t, plan.fps, 0.015);
    dip(ctx, W, H, Math.max(1 - win(t, 0, 0.35), win(t, DUR - 0.65, DUR)));
  }

  window.seek = async t => { await draw(t); return true; };
  await draw(0);
  window.__ready = true;

  if (!navigator.webdriver) {
    const t0 = performance.now();
    const loop = async () => {
      await draw(((performance.now() - t0) / 1000) % DUR);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
