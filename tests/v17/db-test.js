const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path');
const SP = process.argv[2]; const ROOT = process.cwd();
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
  const errs = [], gh = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.route('https://raw.githubusercontent.com/**', r => {
    const u = new URL(r.request().url()); gh.push(u.pathname);
    const rel = u.pathname.replace(/^\/jebyou095-eng\/S-tier\/[^/]+\//, '');
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*', 'content-type': f.endsWith('.json') ? 'application/json' : 'image/jpeg' } });
  });
  await p.goto('http://localhost:8765/');
  await p.click('.tab >> text=Food'); await p.waitForTimeout(800); await p.click('.seg .chip >> text=Diary');
  await p.click('.add-tile:has-text("Moroccan")'); await p.waitForSelector('.browse .result');
  console.log('browse status:', await p.locator('.browse .muted.small').first().innerText());
  await p.click('.browse .chip >> text=Street food'); await p.waitForTimeout(200);
  await p.screenshot({ path: `${SP}/db1-street.png` });
  await p.click('.browse .chip >> text=Supermarket'); await p.fill('.browse input[type=search]', 'jaouda'); await p.waitForTimeout(200);
  console.log('jaouda results:', await p.locator('.browse .result').count());
  await p.screenshot({ path: `${SP}/db2-super.png` });
  await p.locator('.browse .result').first().click(); await p.waitForSelector('text=Grams');
  await p.screenshot({ path: `${SP}/db3-portion.png` });
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(200);
  // search dialog with Darija
  await p.click('.add-tile:has-text("Search")'); await p.fill('input[type=search]', 'مسمن'); await p.waitForTimeout(200);
  console.log('darija search:', (await p.locator('.result .r-name').first().innerText()).replace(/\n/g, ' '));
  await p.click('dialog >> text=Close');
  // offline: block GitHub, reload, list still there from cache
  await p.unroute('https://raw.githubusercontent.com/**'); await p.route('https://raw.githubusercontent.com/**', r => r.abort());
  await p.reload(); await p.click('.tab >> text=Food'); await p.click('.add-tile:has-text("Search")'); await p.fill('input[type=search]', 'harira'); await p.waitForTimeout(300);
  console.log('offline search after reload:', await p.locator('.result').count(), 'results');
  await p.click('dialog >> text=Close');
  await p.click('.tab >> text=Settings'); await p.waitForTimeout(200);
  console.log('settings:', await p.locator('text=foods · list from').innerText());
  console.log('GitHub requests:', gh.length, gh.slice(0, 3), 'errors:', errs);
  await b.close();
})();
