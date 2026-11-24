// Deterministic whiteboard surface, dry-erase ink strokes, progressive text,
// eraser wipes, and Blender RGBA hand/eraser compositing locked to tracked anchors.
import { clamp, lerp, smooth, easeOut, win, mulberry32 } from './layers.js';

export const PALETTE = {
  board: '#F7F8FA',
  boardEdge: '#E3E7EE',
  ink: '#1C2331',
  slate: '#5B6577',
  cobalt: '#1D5FD6',
  cobaltSoft: 'rgba(29, 95, 214, 0.14)',
  terra: '#D64527',
  terraSoft: 'rgba(214, 69, 39, 0.14)',
};

const boardCache = new Map();

export function drawWhiteboardBase(ctx, W, H) {
  const key = `${W}x${H}`;
  if (!boardCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    // Porcelain enamel base
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#FAFBFC');
    grad.addColorStop(0.45, '#F7F8FA');
    grad.addColorStop(1, '#EFF2F7');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Subtle overhead-left studio specular sheen
    const sheen = g.createRadialGradient(W * 0.24, H * 0.14, W * 0.04, W * 0.28, H * 0.20, W * 0.62);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
    sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.18)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);

    // Faint seeded dry-erase ghost residue (barely perceptible texture, never distracting)
    const rnd = mulberry32(9021);
    g.save();
    for (let i = 0; i < 18; i++) {
      const gx = rnd() * W;
      const gy = rnd() * H;
      const rx = 60 + rnd() * 190;
      const ry = 18 + rnd() * 55;
      const ang = (rnd() - 0.5) * 0.6;
      g.translate(gx, gy);
      g.rotate(ang);
      const rg = g.createRadialGradient(0, 0, 2, 0, 0, rx);
      rg.addColorStop(0, 'rgba(130, 145, 170, 0.028)');
      rg.addColorStop(1, 'rgba(130, 145, 170, 0)');
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.restore();

    // Clean subtle aluminum marker-tray lip at very bottom edge
    const trayH = Math.max(8, Math.round(H * 0.012));
    const trayGrad = g.createLinearGradient(0, H - trayH, 0, H);
    trayGrad.addColorStop(0, '#DCE1EA');
    trayGrad.addColorStop(0.35, '#EDF0F5');
    trayGrad.addColorStop(1, '#BCC4D2');
    g.fillStyle = trayGrad;
    g.fillRect(0, H - trayH, W, trayH);
    g.fillStyle = 'rgba(28, 35, 49, 0.10)';
    g.fillRect(0, H - trayH, W, 1);

    boardCache.set(key, c);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(boardCache.get(key), 0, 0);
  ctx.restore();
}

// Sample a polyline at normalized arc-length progress u in [0, 1], returning { x, y, drawnPts }
export function samplePolyline(pts, u) {
  u = clamp(u);
  if (pts.length === 0) return { x: 0, y: 0, pts: [] };
  if (pts.length === 1 || u <= 0) return { x: pts[0][0], y: pts[0][1], pts: [pts[0]] };
  const segLens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segLens.push(l);
    total += l;
  }
  if (total < 1e-4) return { x: pts[0][0], y: pts[0][1], pts: [pts[0]] };
  const target = total * u;
  const out = [pts[0]];
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const l = segLens[i];
    if (acc + l >= target) {
      const f = l > 1e-5 ? (target - acc) / l : 0;
      const p = [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
      out.push(p);
      return { x: p[0], y: p[1], pts: out };
    }
    out.push(pts[i + 1]);
    acc += l;
  }
  const last = pts[pts.length - 1];
  return { x: last[0], y: last[1], pts: out };
}

// Generate deterministic dry-erase slightly organic polyline points between A and B
export function linePts(x0, y0, x1, y1, seed = 1, steps = 10, jitter = 1.1) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const edge = Math.sin(Math.PI * u);
    pts.push([
      lerp(x0, x1, u) + (rnd() - 0.5) * 2 * jitter * edge,
      lerp(y0, y1, u) + (rnd() - 0.5) * 2 * jitter * edge,
    ]);
  }
  return pts;
}

export function circlePts(cx, cy, r, seed = 1, steps = 40, jitter = 1.0, startAngle = -Math.PI * 0.75) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = startAngle + u * Math.PI * 2;
    const rr = r + (rnd() - 0.5) * 2 * jitter * Math.sin(Math.PI * u);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

export function roundRectPts(x, y, w, h, r = 14, seed = 1) {
  const pts = [];
  const rr = Math.min(r, w / 2, h / 2);
  const addArc = (cx, cy, a0, a1, n = 5) => {
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  addArc(x + w - rr, y + rr, -Math.PI / 2, 0);
  addArc(x + w - rr, y + h - rr, 0, Math.PI / 2);
  addArc(x + rr, y + h - rr, Math.PI / 2, Math.PI);
  addArc(x + rr, y + rr, Math.PI, Math.PI * 1.5);
  pts.push(pts[0]);
  // subtle organic hand jitter
  const rnd = mulberry32(seed);
  return pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : [p[0] + (rnd() - 0.5) * 1.2, p[1] + (rnd() - 0.5) * 1.2]));
}

export function quadBezierPts(x0, y0, cx, cy, x1, y1, steps = 28) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const inv = 1 - u;
    pts.push([
      inv * inv * x0 + 2 * inv * u * cx + u * u * x1,
      inv * inv * y0 + 2 * inv * u * cy + u * u * y1,
    ]);
  }
  return pts;
}

export function drawInkPolyline(ctx, pts, u, { color = PALETTE.ink, width = 4.5, alpha = 1, dash = null, fill = null } = {}) {
  u = clamp(u);
  if (u <= 0) return null;
  const { x, y, pts: sub } = samplePolyline(pts, u);
  if (sub.length < 2) return { x, y };

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);

  ctx.beginPath();
  ctx.moveTo(sub[0][0], sub[0][1]);
  for (let i = 1; i < sub.length; i++) ctx.lineTo(sub[i][0], sub[i][1]);
  if (fill && u >= 0.99) {
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
  return { x, y };
}

// Draw arrowhead at end of polyline once progress reaches > 0.92
export function drawArrowHead(ctx, pPrev, pEnd, u, { color = PALETTE.ink, width = 4.2, size = 14, alpha = 1 } = {}) {
  if (u < 0.85) return;
  const au = smooth(win(u, 0.85, 1.0));
  const ang = Math.atan2(pEnd[1] - pPrev[1], pEnd[0] - pPrev[0]);
  ctx.save();
  ctx.globalAlpha = alpha * au;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pEnd[0] - size * Math.cos(ang - 0.48), pEnd[1] - size * Math.sin(ang - 0.48));
  ctx.lineTo(pEnd[0], pEnd[1]);
  ctx.lineTo(pEnd[0] - size * Math.cos(ang + 0.48), pEnd[1] - size * Math.sin(ang + 0.48));
  ctx.stroke();
  ctx.restore();
}

// Progressive text reveal synced with a dry-erase hand motion trace
export function drawMarkerText(ctx, text, x, y, u, {
  font = '600 42px Display',
  color = PALETTE.ink,
  align = 'left',
  baseline = 'alphabetic',
  alpha = 1,
} = {}) {
  u = clamp(u);
  if (u <= 0) return null;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = baseline;
  const m = ctx.measureText(text);
  const w = m.width;
  const h = (m.actualBoundingBoxAscent || 40) + (m.actualBoundingBoxDescent || 14) + 18;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const top = baseline === 'middle' ? y - h / 2 : baseline === 'top' ? y - 6 : y - (m.actualBoundingBoxAscent || 38) - 8;

  const revealW = (w + 8) * u;
  ctx.beginPath();
  ctx.rect(left - 4, top, revealW, h + 8);
  ctx.clip();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillText(text, left, y);
  ctx.restore();

  // Hand zig-zag trace along character baseline while writing
  const charH = (m.actualBoundingBoxAscent || 28) * 0.45;
  const osc = Math.sin(u * text.length * Math.PI * 1.4) * charH * 0.45;
  const midY = baseline === 'middle' ? y : baseline === 'top' ? y + charH : y - charH * 0.65;
  return { x: left + w * u, y: midY + osc };
}

// Sequenced stroke scheduler: executes a list of draw items sequentially inside [t0, t1],
// returning the active marker tip { x, y, drawing, lift } for the Blender hand layer.
const toXY = p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);

export function runStrokeSequence(t, t0, t1, items) {
  const totalW = items.reduce((s, it) => s + (it.weight || 1), 0);
  let cur = t0;
  const span = Math.max(0.01, t1 - t0);
  let activeTip = null;
  let lastTip = null;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const wDur = ((it.weight || 1) / totalW) * span;
    const drawDur = wDur * 0.84;
    const u = win(t, cur, cur + drawDur);
    const tip = toXY(it.draw(u));
    if (tip && Number.isFinite(tip.x)) lastTip = tip;
    if (t >= cur && t < cur + wDur) {
      if (t < cur + drawDur && tip && Number.isFinite(tip.x)) {
        activeTip = { x: tip.x, y: tip.y, drawing: true, lift: 0 };
      } else if (i + 1 < items.length) {
        // Lift and glide smoothly to next stroke start
        const rawNext = items[i + 1].start ? items[i + 1].start() : (tip || { x: 960, y: 540 });
        const nextTip = toXY(rawNext) || { x: 960, y: 540 };
        const fromTip = (tip && Number.isFinite(tip.x)) ? tip : (lastTip || nextTip);
        const gu = smooth(win(t, cur + drawDur, cur + wDur));
        const lift = Math.sin(Math.PI * gu);
        activeTip = {
          x: lerp(fromTip.x, nextTip.x, gu),
          y: lerp(fromTip.y, nextTip.y, gu) - lift * 22,
          drawing: false,
          lift,
        };
      }
    }
    cur += wDur;
  }
  return activeTip;
}

// Compute 3-pass diagonal eraser path & draw spatial mask onto an offscreen canvas
export function getEraserWipePath(bounds = { x0: 140, y0: 110, x1: 1780, y1: 960 }) {
  const { x0, y0, x1, y1 } = bounds;
  const ym1 = lerp(y0, y1, 0.16);
  const ym2 = lerp(y0, y1, 0.50);
  const ym3 = lerp(y0, y1, 0.84);
  return [
    [x0 - 140, ym1],
    [x1 + 120, ym1],
    [x0 - 120, ym2],
    [x1 + 120, ym2],
    [x0 - 120, ym3],
    [x1 + 200, ym3],
  ];
}

export function computeEraserWipe(u, bounds) {
  u = clamp(u);
  const pts = getEraserWipePath(bounds);
  const { x, y } = samplePolyline(pts, smooth(u));
  return { x, y, clearU: smooth(u), pts };
}

let wipeCanvas = null;
export function beginWipeLayer(W, H) {
  if (!wipeCanvas || wipeCanvas.width !== W || wipeCanvas.height !== H) {
    wipeCanvas = document.createElement('canvas');
    wipeCanvas.width = W;
    wipeCanvas.height = H;
  }
  const wctx = wipeCanvas.getContext('2d');
  wctx.setTransform(1, 0, 0, 1, 0, 0);
  wctx.clearRect(0, 0, W, H);
  return wctx;
}

export function applyWipeLayer(mainCtx, W, H, K, wipe) {
  if (!wipeCanvas || !wipe) return;
  const wctx = wipeCanvas.getContext('2d');
  const { pts } = samplePolyline(wipe.pts, wipe.clearU);
  if (pts.length >= 2) {
    wctx.save();
    wctx.setTransform(K, 0, 0, K, 0, 0);
    wctx.globalCompositeOperation = 'destination-out';
    wctx.strokeStyle = '#000';
    wctx.lineWidth = 360;
    wctx.lineCap = 'round';
    wctx.lineJoin = 'round';
    wctx.beginPath();
    wctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) wctx.lineTo(pts[i][0], pts[i][1]);
    wctx.stroke();
    wctx.restore();
  }
  mainCtx.save();
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  mainCtx.drawImage(wipeCanvas, 0, 0);
  mainCtx.restore();
}

// Draw Blender RGBA hand or eraser frame so tracked anchor pixel lands exactly at (targetX, targetY)
export function drawBlenderSprite(ctx, img, anchor, targetX, targetY, {
  spriteSize = 1024,
  spriteH = null,
  lift = 0,
  alpha = 1,
  angle = 0,
} = {}) {
  if (!img || !anchor || alpha <= 0.005) return;
  const sw = spriteSize;
  const sh = spriteH || spriteSize;
  const ax = anchor[0] * sw;
  const ay = anchor[1] * sh;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.translate(targetX, targetY);
  if (angle) ctx.rotate(angle);

  // Dynamic contact shadow cast onto the whiteboard from upper-left studio key light
  const shOff = 14 + lift * 44;
  ctx.shadowColor = `rgba(22, 30, 46, ${(0.24 - lift * 0.10).toFixed(3)})`;
  ctx.shadowBlur = 16 + lift * 28;
  ctx.shadowOffsetX = shOff;
  ctx.shadowOffsetY = shOff * 1.15;

  ctx.drawImage(img, -ax, -ay, sw, sh);
  ctx.restore();
}
