// node tools/sfx.mjs cues.json out.wav [dur]  — cues: [{t, type, gain?, dur?, len?}], types click|pop|thump|whoosh|tick|riser|crack|stamp|chirp|scratch|rewind|clank|key|carriage|bell|strike|ding|pencil|blip|paper|tear
import fs from 'node:fs';
import { mulberry32 } from '../lib/motion.js';
const [, , cuesPath, outPath, durArg] = process.argv;
const cues = JSON.parse(fs.readFileSync(cuesPath, 'utf8'));
const SR = 48000;
const dur = +(durArg ?? Math.max(...cues.map(c => c.t)) + 2);
const L = new Float32Array(Math.ceil(dur * SR)), R = new Float32Array(L.length);
const add = (i, v, pan = 0) => { if (i >= 0 && i < L.length) { L[i] += v * (1 - pan) ; R[i] += v * (1 + pan); } };
const gens = {
  click(s, g, rnd) { for (let i = 0; i < 0.03 * SR; i++) { const e = Math.exp(-i / (0.003 * SR)); add(s + i, g * 0.5 * e * ((rnd() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 2400 * i / SR))); } },
  tick(s, g, rnd) { for (let i = 0; i < 0.02 * SR; i++) add(s + i, g * 0.25 * Math.exp(-i / (0.002 * SR)) * Math.sin(2 * Math.PI * 3800 * i / SR)); },
  pop(s, g) { for (let i = 0; i < 0.12 * SR; i++) { const t = i / SR, f = 300 + 900 * Math.exp(-t * 40); add(s + i, g * 0.45 * Math.exp(-t * 30) * Math.sin(2 * Math.PI * f * t)); } },
  thump(s, g, rnd) { let ph = 0; for (let i = 0; i < 0.6 * SR; i++) { const t = i / SR, f = 40 + 110 * Math.exp(-t * 18); ph += 2 * Math.PI * f / SR; add(s + i, g * 0.9 * Math.exp(-t * 6) * Math.sin(ph) + g * 0.15 * Math.exp(-t * 60) * (rnd() * 2 - 1)); } },
  whoosh(s, g, rnd) { const n = 0.45 * SR; let lp = 0; for (let i = 0; i < n; i++) { const x = i / n, env = Math.sin(Math.PI * x) ** 2, a = 0.02 + 0.25 * x; lp += a * ((rnd() * 2 - 1) - lp); add(s + i - n * 0.6, g * 0.8 * env * lp, (x - 0.5) * 0.6); } },
  // typewriter: sharp type-bar strike + platen thunk + a little metal
  key(s, g, rnd) { for (let i = 0; i < 0.06 * SR; i++) { const t = i / SR; add(s + i, g * (0.32 * Math.exp(-t * 900) * (rnd() * 2 - 1) + 0.22 * Math.exp(-t * 70) * Math.sin(2 * Math.PI * 170 * t) + 0.05 * Math.exp(-t * 120) * Math.sin(2 * Math.PI * 3150 * t)), (rnd() - 0.5) * 0.2); } },
  // carriage return: ratchet clicks then the carriage hitting home
  carriage(s, g, rnd) { for (let k = 0; k < 7; k++) gens.tick(s + Math.round(k * 0.024 * SR), g * 0.6, rnd); let lp = 0; for (let i = 0; i < 0.22 * SR; i++) { const x = i / (0.22 * SR); lp += 0.08 * ((rnd() * 2 - 1) - lp); add(s + i, g * 0.25 * Math.sin(Math.PI * x) * lp); } gens.thump(s + Math.round(0.2 * SR), g * 0.35, rnd); },
  // carriage bell
  bell(s, g) { for (let i = 0; i < 1.6 * SR; i++) { const t = i / SR, e = Math.exp(-t * 3.2); add(s + i, g * 0.22 * e * (Math.sin(2 * Math.PI * 2093 * t) + 0.5 * Math.sin(2 * Math.PI * 5776 * t) * Math.exp(-t * 6) + 0.3 * Math.sin(2 * Math.PI * 4186 * t))); } },
  riser(s, g, rnd, c) { const n = (c?.dur ?? 1.2) * SR; let lp = 0; for (let i = 0; i < n; i++) { const x = i / n; lp += (0.01 + 0.3 * x * x) * ((rnd() * 2 - 1) - lp); add(s + i - n, g * 0.6 * x * x * lp); } },
  // ink/glass crack: transient, crackles, resonant body, low thud
  crack(s, g, rnd) {
    let prev = 0;
    for (let i = 0; i < 0.5 * SR; i++) {
      const t = i / SR, n = rnd() * 2 - 1, hp = n - prev; prev = n;
      let v = hp * Math.exp(-t * 90) * 0.9;
      v += (Math.sin(2 * Math.PI * 1830 * t) * 0.5 + Math.sin(2 * Math.PI * 2950 * t) * 0.35 + Math.sin(2 * Math.PI * 4370 * t) * 0.25) * Math.exp(-t * 28) * 0.35;
      v += Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-t * 20)) * t) * Math.exp(-t * 9) * 0.6;
      add(s + i, g * v, 0.15);
    }
    for (let k = 0; k < 9; k++) { const o = Math.floor((0.01 + rnd() * 0.12) * SR), pan = rnd() * 0.8 - 0.4, a = 0.2 + rnd() * 0.4; for (let i = 0; i < 0.006 * SR; i++) add(s + o + i, g * a * (rnd() * 2 - 1) * Math.exp(-i / (0.0012 * SR)), pan); }
  },
  stamp(s, g, rnd) { let ph = 0, lp = 0; for (let i = 0; i < 0.3 * SR; i++) { const t = i / SR, f = 50 + 70 * Math.exp(-t * 35); ph += 2 * Math.PI * f / SR; lp += 0.25 * ((rnd() * 2 - 1) - lp); add(s + i, g * (0.8 * Math.sin(ph) * Math.exp(-t * 14) + 0.7 * lp * Math.exp(-t * 55))); } },
  // three quick FM sweeps
  chirp(s, g, rnd) {
    for (let k = 0; k < 3; k++) { const o = Math.floor(k * 0.075 * SR), len = 0.055 * SR, f0 = 3300 + rnd() * 500; let ph = 0;
      for (let i = 0; i < len; i++) { const x = i / len, f = f0 + 1500 * Math.sin(Math.PI * x) + 120 * Math.sin(2 * Math.PI * 38 * x); ph += 2 * Math.PI * f / SR; add(s + o + i, g * 0.32 * Math.sin(Math.PI * x) ** 1.5 * Math.sin(ph), 0.2); } }
  },
  // pen on paper: band-limited grainy noise for c.dur seconds
  scratch(s, g, rnd, c) { const n = (c?.dur ?? 0.8) * SR; let lp = 0, lp2 = 0, hp = 0, gr = 0, tg = 0.5;
    for (let i = 0; i < n; i++) { const x = i / n, w = rnd() * 2 - 1; lp += 0.3 * (w - lp); lp2 += 0.3 * (lp - lp2); const b = lp2 - hp; hp += 0.1 * (lp2 - hp);
      if (i % 600 === 0) tg = 0.3 + rnd() * 0.7; gr += 0.004 * (tg - gr);
      add(s + i, g * 0.13 * b * gr * Math.min(1, x * 12, (1 - x) * 8)); } },
  // tape rewind: rising chirp under noise, swelling into a zip
  rewind(s, g, rnd, c) { const n = (c?.dur ?? 0.9) * SR; let ph = 0, lp = 0;
    for (let i = 0; i < n; i++) { const x = i / n, f = 180 * Math.pow(14, x); ph += 2 * Math.PI * f / SR; lp += (0.05 + 0.4 * x) * ((rnd() * 2 - 1) - lp);
      add(s + i, g * (0.25 * Math.sin(ph) + 0.18 * Math.sign(Math.sin(ph * 0.5)) * 0.4 + 0.3 * lp) * x * x * Math.min(1, (1 - x) * 30)); } },
  clank(s, g) { for (let i = 0; i < 0.5 * SR; i++) { const t = i / SR; add(s + i, g * 0.22 * (Math.sin(2 * Math.PI * 523 * t) + 0.7 * Math.sin(2 * Math.PI * 1187 * t) + 0.5 * Math.sin(2 * Math.PI * 1913 * t) + 0.3 * Math.sin(2 * Math.PI * 2711 * t)) * Math.exp(-t * 11), -0.1); } },
  // typewriter key (ij-good): type-bar slap + platen thud + a little metal
  strike(s, g, rnd) { let hp = 0, prev = 0; const pan = (rnd() - 0.5) * 0.3, f = 160 + rnd() * 50; for (let i = 0; i < 0.06 * SR; i++) { const t = i / SR, n = rnd() * 2 - 1; hp = 0.6 * (hp + n - prev); prev = n; add(s + i, g * (0.55 * hp * Math.exp(-t * 900) + 0.5 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 80) + 0.08 * Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 120)), pan); } },
  // typewriter carriage bell (ij-good)
  ding(s, g) { for (let i = 0; i < 1.4 * SR; i++) { const t = i / SR; add(s + i, g * 0.28 * Math.min(1, t / 0.001) * (Math.sin(2 * Math.PI * 2480 * t) * Math.exp(-t * 3.2) + 0.45 * Math.sin(2 * Math.PI * 5930 * t) * Math.exp(-t * 6) + 0.2 * Math.sin(2 * Math.PI * 1240 * t) * Math.exp(-t * 4))); } },
  // graphite on paper: band-limited noise with grain, `len` seconds
  pencil(s, g, rnd, c) { const n = (c.len ?? 0.3) * SR; let lp = 0, hp = 0, prev = 0; for (let i = 0; i < n; i++) { const x = i / n, nz = rnd() * 2 - 1; lp += 0.35 * (nz - lp); hp = 0.7 * (hp + lp - prev); prev = lp; const grainAm = 0.55 + 0.45 * Math.sin(i * 0.013 + Math.sin(i * 0.0031) * 4); add(s + i, g * 0.5 * hp * grainAm * Math.sin(Math.PI * Math.min(1, x * 1.1)) ** 0.6, 0.15); } },
  // a sheet of card sliding in and landing: airy swish that ends on s, then a soft papery tap
  paper(s, g, rnd, c) {
    const n = (c?.dur ?? 0.16) * SR, pan = c?.pan ?? 0; let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < n; i++) { const x = i / n, w = rnd() * 2 - 1; lp += 0.35 * (w - lp); hp = 0.85 * (hp + lp - prev); prev = lp; add(s + i - Math.round(n), g * 0.5 * hp * Math.sin(Math.PI * Math.min(1, x * 1.4)) ** 2 * x, pan); }
    for (let i = 0; i < 0.12 * SR; i++) { const t = i / SR; add(s + i, g * (0.32 * Math.sin(2 * Math.PI * (85 + 70 * Math.exp(-t * 40)) * t) * Math.exp(-t * 26) + 0.22 * (rnd() * 2 - 1) * Math.exp(-t * 110)), pan); }
  },
  // paper ripping: bursts of crackle over c.dur seconds
  tear(s, g, rnd, c) {
    const n = (c?.dur ?? 0.5) * SR, pan = c?.pan ?? 0; let lp = 0, hp = 0, prev = 0, burst = 0;
    for (let i = 0; i < n; i++) { const x = i / n; if (i % 80 === 0) burst = rnd() < 0.55 ? 0.35 + rnd() * 0.9 : 0.1; const w = rnd() * 2 - 1; lp += 0.55 * (w - lp); hp = 0.82 * (hp + lp - prev); prev = lp; add(s + i, g * 0.75 * hp * burst * Math.min(1, x * 25) * Math.sqrt(1 - x), pan); }
  },
  blip(s, g) { for (let i = 0; i < 0.12 * SR; i++) { const t = i / SR; add(s + i, g * 0.22 * Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 30) * Math.min(1, t / 0.002)); } },
};
cues.forEach((c, k) => { const rnd = mulberry32(1000 + k); (gens[c.type] ?? gens.click)(Math.round(c.t * SR), c.gain ?? 1, rnd, c); });
const buf = Buffer.alloc(44 + L.length * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + L.length * 4, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(L.length * 4, 40);
for (let i = 0; i < L.length; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
fs.writeFileSync(outPath, buf);
console.log(`${outPath}: ${cues.length} cues, ${dur.toFixed(1)}s`);
