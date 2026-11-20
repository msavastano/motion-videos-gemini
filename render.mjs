// Usage: node render.mjs --film films/chronovisor --fps 60 --dur 20 --sub 4 --start 0 --w 1080 --h 1920 --out out/silent.mp4
//        [--img jpeg]  capture frames as JPEG q95 instead of PNG (several times faster for big noisy WebGL frames)
//        [--query a=1&b=2]  query string for the film page (e.g. render options)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  (v.startsWith('--') && a.push([v.slice(2), arr[i + 1]]), a), []));
const fps = +(args.fps ?? 60), sub = +(args.sub ?? 4), dur = +(args.dur ?? 20);
const start = +(args.start ?? 0), W = +(args.w ?? 1080), H = +(args.h ?? 1920);
const film = args.film ?? '.';
const img = args.img === 'jpeg' ? { type: 'jpeg', quality: 95 } : { type: 'png' };
const out = args.out ?? path.join(film, 'out/silent.mp4');
fs.mkdirSync(path.dirname(out), { recursive: true });

const root = path.resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', m => m.type() === 'error' && console.error('[page]', m.text()));
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/${film}/index.html${args.query ? '?' + args.query : ''}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

const rate = fps * sub;
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(rate), '-i', '-',
  '-vf', `tmix=frames=${sub},select='eq(mod(n\\,${sub})\\,${sub - 1})',setpts=N/${fps}/TB`,
  '-r', String(fps), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const canvas = await page.$('canvas');
const n = Math.round(dur * rate);
for (let i = 0; i < n; i++) {
  await page.evaluate(t => window.seek(t), start + i / rate);
  const buf = await canvas.screenshot(img);
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % rate === 0) process.stdout.write(`\r${(i / rate).toFixed(0)}s / ${dur}s`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close(); server.close();
console.log(`\nwrote ${out}`);
