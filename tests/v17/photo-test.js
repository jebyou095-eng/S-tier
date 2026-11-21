const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path'); const ROOT = process.cwd(); const SP = process.argv[2];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/raw\.githubusercontent\.com|api\.github\.com/, r => {
    const u = new URL(r.request().url());
    if (u.host === 'api.github.com') return r.fulfill({ body: 'b'.repeat(40), headers: { 'access-control-allow-origin': '*' } });
    const f = path.join(ROOT, u.pathname.replace(/^\/jebyou095-eng\/S-tier\/[^/]+\//, ''));
    r.fulfill({ body: fs.existsSync(f) ? fs.readFileSync(f) : '', status: fs.existsSync(f) ? 200 : 404, headers: { 'access-control-allow-origin': '*' } });
  });
  // Simulate data from v1.2: a photo stored inside the main record
  await p.goto('http://localhost:8765/'); await p.waitForSelector('.chip');
  await p.evaluate(async () => {
    const data = { v: 1, trackers: [], entries: [], settings: { autoLock: 1 }, food: { myPhotos: { 'ma:harcha': 'data:image/jpeg;base64,' + btoa('legacy') }, log: [], saved: [] } };
    await new Promise((res) => { const q = indexedDB.open('pocket-stats', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ v: 1, locked: false, data }, 'vault'); t.oncomplete = res; }; });
  });
  await p.reload(); await p.waitForSelector('.tab');
  const migrated = await p.evaluate(async () => { const v = await import('./js/db.js'); return Object.keys(await v.loadPhotos()); });
  console.log('legacy photo moved to own record:', migrated);
  // Add a photo through the UI to harira
  await p.click('.tab >> text=Food'); await p.waitForTimeout(800);
  await p.click('.add-tile:has-text("Search")'); await p.fill('input[type=search]', 'harira'); await p.waitForTimeout(300); await p.click('.result >> nth=0');
  const chooser = p.waitForEvent('filechooser'); await p.click('text=Add photo'); await (await chooser).setFiles(`${SP}/plate.jpg`);
  await p.waitForSelector('text=Photo saved on your phone'); await p.click('dialog >> text=Cancel');
  // Passcode, reload, unlock
  await p.click('.tab >> text=Settings'); await p.click('text=Set passcode');
  await p.fill('input[placeholder="Passcode"]', 'atlas123'); await p.fill('input[placeholder="Repeat passcode"]', 'atlas123'); await p.click('text=Continue');
  await p.waitForSelector('text=Passcode set');
  const stored = await p.evaluate(() => new Promise(r => { const q = indexedDB.open('pocket-stats'); q.onsuccess = () => { const t = q.result.transaction('kv'); const s = t.objectStore('kv'); const g = s.getAll(); const k = s.getAllKeys();
    t.oncomplete = () => r(k.result.map((key, i) => key + ':' + (g.result[i].locked ? 'encrypted' : 'PLAIN'))); }; }));
  console.log('records:', stored.filter(s => !s.startsWith('cache:')).join(', '));
  const dl = p.waitForEvent('download'); await p.click('text=Export encrypted backup'); const file = await (await dl).path();
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  await p.reload(); await p.fill('input[aria-label="Passcode"]', 'atlas123'); await p.click('button:has-text("Unlock")'); await p.waitForSelector('.tab');
  await p.click('.tab >> text=Food'); await p.waitForTimeout(800);
  await p.click('.add-tile:has-text("Search")'); await p.fill('input[type=search]', 'harira'); await p.waitForTimeout(300);
  console.log('photo shown after unlock:', await p.locator('.result').first().locator('.thumb.has-photo').count() === 1);
  const inBackup = await p.evaluate(async (bk) => { const v = await import('./js/db.js'); const d = await v.readBackup(bk, 'atlas123'); return Object.keys(d.food.myPhotos || {}); }, backup);
  console.log('photos inside encrypted backup:', inBackup);
  console.log('errors:', errs);
  await b.close();
})();
