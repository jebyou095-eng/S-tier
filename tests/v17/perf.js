const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path'); const ROOT = process.cwd();
async function run(label, url, setup) {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.route(/raw\.githubusercontent\.com|api\.github\.com/, r => {
    const u = new URL(r.request().url());
    if (u.host === 'api.github.com') return r.fulfill({ body: 'a'.repeat(40), headers: { 'access-control-allow-origin': '*' } });
    const f = path.join(ROOT, u.pathname.replace(/^\/jebyou095-eng\/S-tier\/[^/]+\//, ''));
    r.fulfill({ body: fs.existsSync(f) ? fs.readFileSync(f) : '', headers: { 'access-control-allow-origin': '*' } });
  });
  const t = {};
  let t0 = Date.now(); await p.goto(url); await p.waitForSelector('#tabs:not([hidden]), .card.empty, .chip'); t.firstRender = Date.now() - t0;
  // wait for food db warm (first launch downloads + parses)
  t0 = Date.now(); await p.click('.tab >> text=Food'); await p.click('.seg .chip >> text=Diary'); await p.waitForFunction(() => document.querySelector('.add-tile'));
  await p.click('.add-tile:has-text("Moroccan")'); await p.waitForSelector('.browse .result', { timeout: 60000 }); t.browseFirst = Date.now() - t0;
  await p.click('dialog >> text=Close');
  // second launch (from cache)
  t0 = Date.now(); await p.reload(); await p.waitForSelector('.tab'); t.reloadRender = Date.now() - t0;
  t0 = Date.now(); await p.click('.tab >> text=Food'); await p.click('.seg .chip >> text=Diary'); await p.click('.add-tile:has-text("Moroccan")'); await p.waitForSelector('.browse .result'); t.browseCached = Date.now() - t0;
  await p.click('dialog >> text=Close');
  // search latency per keystroke
  await p.click('.add-tile:has-text("Search")');
  const per = [];
  for (const q of ['d', 'da', 'dan', 'dano', 'danone']) { const s = Date.now(); await p.fill('input[type=search]', q); await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); per.push(Date.now() - s); }
  t.searchKeystrokes = per;
  await p.click('dialog >> text=Close');
  // save cost: log a food (commit -> encrypt? no passcode) 
  const m = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null); t.heapMB = m;
  console.log(label, JSON.stringify(t));
  await b.close();
}
(async () => {
  await run('FILE', 'file://' + ROOT + '/dist/PocketStats.html');
})();
