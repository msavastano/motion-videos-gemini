// node tools/still.mjs --film films/x --w 1080 --h 1920 --t 1.2,3.4 --out out/still  -> PNG per time
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') && a.push([v.slice(2), arr[i + 1]]), a), []));
const root = path.resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const page = await b.newPage({ viewport: { width: +(args.w ?? 1080), height: +(args.h ?? 1920) } });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/${args.film}/index.html`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
if (args.timing) console.log(JSON.stringify(await page.evaluate(() => window.TIMING)));
const out = args.out ?? `${args.film}/out/still`; fs.mkdirSync(path.dirname(out), { recursive: true });
for (const t of (args.t ?? '0').split(',').map(Number)) {
  await page.evaluate(t => window.seek(t), t);
  await (await page.$('canvas')).screenshot({ path: `${out}_${t.toFixed(2)}.png` });
}
await b.close(); server.close();
