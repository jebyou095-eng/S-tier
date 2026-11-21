const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path'); const ROOT = process.cwd();
const [SP, step] = process.argv.slice(2);
(async () => {
  const video = step === 'B' ? 'scanB' : 'scanA';
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
  const ctx = await chromium.launchPersistentContext(`${SP}/profile`, { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch, permissions: ['camera'],
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/${video}.y4m`, '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs = [], ext = [];
  p.on('pageerror', e => { errs.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 300)); }); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  p.on('request', r => { const u = new URL(r.url()); if (!/localhost|githubusercontent|api\.github/.test(u.host) && u.protocol.startsWith('http')) ext.push(u.host); });
  await p.route(/raw\.githubusercontent\.com|api\.github\.com/, r => {
    const u = new URL(r.request().url());
    if (u.host === 'api.github.com') return r.fulfill({ body: 'd'.repeat(40), headers: { 'access-control-allow-origin': '*' } });
    const f = path.join(ROOT, u.pathname.replace(/^\/jebyou095-eng\/S-tier\/[^/]+\//, ''));
    r.fulfill({ body: fs.existsSync(f) ? fs.readFileSync(f) : '', status: fs.existsSync(f) ? 200 : 404, headers: { 'access-control-allow-origin': '*' } });
  });
  await p.goto('http://localhost:8765/');
  if (step === 'unlock' || step === 'B') { await p.fill('input[aria-label="Passcode"]', 'atlas123'); await p.click('button:has-text("Unlock")'); }
  await p.waitForSelector('.tab');
  await p.click('.tab >> text=Food'); await p.click('.seg .chip >> text=Diary'); await p.waitForTimeout(1500);
  await p.click('.add-tile:has-text("Scan food")');
  await p.waitForSelector('button:has-text("Start scan"):not([disabled])', { timeout: 60000 });
  await p.click('text=Start scan');
  await p.waitForSelector('.sheet-body .ai-photo', { timeout: 120000 });
  const heading = await p.locator('.sheet-body h2').first().innerText();
  const matches = await p.locator('.sheet-body .result').allInnerTexts();
  console.log(`[${step}] result: "${heading}"`, matches.map(m => m.replace(/\n/g, ' ')));
  if (step === 'teach') await p.screenshot({ path: `${SP}/scan-new.png` });
  if (step === 'teach') {
    await p.click('button:has-text("Link this scan to a food")'); await p.waitForTimeout(1500); await p.screenshot({ path: SP + '/after-link.png' }); console.log('dialogs open:', await p.locator('dialog[open]').count(), await p.locator('dialog[open] h2').allInnerTexts());
    await p.fill('input[type=search]', 'assiri danone'); await p.waitForTimeout(500);
    await p.locator('.result').first().click();
    await p.waitForSelector('text=Log & remember'); await p.click('text=Log & remember'); await p.waitForTimeout(500);
  } else if (step === 'match') {
    await p.screenshot({ path: `${SP}/scan-match.png` });
    await p.locator('.sheet-body .result').first().click();
    await p.waitForSelector('text=Log & remember');
    console.log('  grams prefilled:', await p.inputValue('input[aria-label="Amount in grams"]'));
    await p.click('text=Log & remember'); await p.waitForTimeout(500);
    // set a passcode so learned scans get re-encrypted
    await p.click('.tab >> text=Settings'); await p.click('text=Set passcode');
    await p.fill('input[placeholder="Passcode"]', 'atlas123'); await p.fill('input[placeholder="Repeat passcode"]', 'atlas123'); await p.click('text=Continue');
    await p.waitForSelector('text=Passcode set');
    const recs = await p.evaluate(() => new Promise(r => { const q = indexedDB.open('pocket-stats'); q.onsuccess = () => { const t = q.result.transaction('kv'); const s = t.objectStore('kv'); const g = s.getAll(); const k = s.getAllKeys(); t.oncomplete = () => r(k.result.map((key, i) => key + ':' + (g.result[i].locked ? 'encrypted' : 'PLAIN')).filter(x => !x.startsWith('cache:'))); }; }));
    console.log('  records:', recs.join(', '));
    console.log('  learned list:', (await p.locator('text=views').allInnerTexts()).join(' | '));
  } else {
    await p.click('text=Cancel'); 
  }
  if (step !== 'teach' && step !== 'match' && step !== 'unlock' ) {}
  console.log(`  diary: ${(await p.locator('.meal .entry').allInnerTexts().catch(() => [])).map(t => t.split('\n')[0]).join(' / ')} | errors:`, errs, 'external:', [...new Set(ext)]);
  await ctx.close();
})();
