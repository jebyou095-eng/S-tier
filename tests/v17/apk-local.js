const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  const errs = [], external = [], local = new Set();
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.host === 'localhost:8766') { local.add(u.pathname.split('/').slice(0, 3).join('/')); return r.continue(); }
    if (u.protocol === 'blob:' || u.protocol === 'data:') return r.continue();
    external.push(u.host); return r.abort();
  });
  await p.goto('http://localhost:8766/index.html'); await p.waitForSelector('.chip');
  await p.click('.tab >> text=Food'); await p.waitForTimeout(800);
  await p.click('.add-tile:has-text("Moroccan")'); await p.waitForSelector('.browse .result');
  await p.fill('.browse input[type=search]', 'jaouda'); await p.waitForTimeout(2500);
  console.log('foods:', await p.locator('.browse .muted.small').first().innerText(), '| photos shown:', await p.locator('.browse .thumb.has-photo').count());
  await p.locator('.browse .result').first().click(); await p.waitForSelector('text=Grams');
  const ing = p.locator('details.ing-box summary:has-text("label")');
  if (await ing.count()) { await ing.click(); await p.waitForTimeout(800); console.log('label ingredients:', (await p.locator('.label-ing').innerText()).slice(0, 60) + '…'); }
  await p.click('dialog >> text=Cancel');
  await p.click('.tab >> text=Settings'); await p.waitForTimeout(300);
  console.log('settings text:', await p.locator('text=Built into the app').first().innerText());
  console.log('update button present:', await p.locator('text=Update food list now').count());
  await p.click('.tab >> text=Food');
  await p.click('.add-tile:has-text("Scan food")'); await p.waitForSelector('button:has-text("Use photos instead")', { timeout: 120000 });
  const chooser = p.waitForEvent('filechooser'); await p.click('button:has-text("Use photos instead")'); await (await chooser).setFiles(process.argv[2] + '/portion-m.jpg');
  await p.waitForSelector('.sheet-body .ai-photo', { timeout: 120000 });
  console.log('scanner worked offline:', await p.locator('.sheet-body h2').first().innerText());
  console.log('local paths used:', [...local].sort().join(', '));
  console.log('EXTERNAL requests:', [...new Set(external)], '| errors:', errs);
  await b.close();
})();
