const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path'); const ROOT = process.cwd(); const SP = process.argv[2];
(async () => {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
  fs.rmSync(`${SP}/profile2`, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(`${SP}/profile2`, { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/raw\.githubusercontent\.com|api\.github\.com/, r => {
    const u = new URL(r.request().url());
    if (u.host === 'api.github.com') return r.fulfill({ body: 'e'.repeat(40), headers: { 'access-control-allow-origin': '*' } });
    const f = path.join(ROOT, u.pathname.replace(/^\/jebyou095-eng\/S-tier\/[^/]+\//, ''));
    r.fulfill({ body: fs.existsSync(f) ? fs.readFileSync(f) : '', status: fs.existsSync(f) ? 200 : 404, headers: { 'access-control-allow-origin': '*' } });
  });
  await p.goto('http://localhost:8765/'); await p.waitForSelector('.tab');
  await p.click('.tab >> text=Food'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SP}/food-after.png` });
  const scan = async (file) => {
    await p.click('.add-tile:has-text("Scan food")');
    await p.waitForSelector('button:has-text("Use photos instead")');
    const chooser = p.waitForEvent('filechooser'); await p.click('button:has-text("Use photos instead")'); await (await chooser).setFiles(`${SP}/${file}.jpg`);
    await p.waitForSelector('.sheet-body .ai-photo', { timeout: 120000 });
    const cover = await p.locator('text=of the plate').first().innerText().catch(() => '');
    const top = await p.locator('.sheet-body .result').first().innerText().catch(() => '(no match)');
    return { cover, top: top.replace(/\n/g, ' ') };
  };
  // 1) teach: medium portion = harira 200 g
  let r = await scan('portion-m'); console.log('M scan:', r.cover, '|', r.top);
  await p.click('button:has-text("Link this scan to a food")');
  await p.fill('input[type=search]', 'harira'); await p.waitForTimeout(400); await p.locator('.result').first().click();
  await p.waitForSelector('text=Log & remember');
  console.log('  note:', await p.locator('.tip').first().innerText());
  await p.fill('input[aria-label="Amount in grams"]', '200'); await p.click('text=Log & remember'); await p.waitForTimeout(500);
  // 2) larger portion
  for (const f of ['portion-l', 'portion-s']) {
    r = await scan(f); console.log(`${f} scan:`, r.cover, '|', r.top);
    await p.locator('.sheet-body .result').first().click(); await p.waitForSelector('text=Log & remember');
    console.log('  grams prefilled:', await p.inputValue('input[aria-label="Amount in grams"]'), '| note:', await p.locator('.tip').first().innerText());
    if (f === 'portion-l') await p.screenshot({ path: `${SP}/portion-dialog.png` });
    await p.click('text=Log & remember'); await p.waitForTimeout(500);
  }
  console.log('errors:', errs);
  await ctx.close();
})();
