const { chromium, devices } = require('playwright');
const SP = process.argv[2];
const OFF = { status: 1, product: { code: '3017624010046', product_name: 'Nutella', brands: 'Ferrero', serving_quantity: 15, serving_size: '15 g', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } } };
async function run(url, label, hosted) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/barcode.y4m`, '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['camera'], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], ext = [];
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('http://localhost')) ext.push(u.slice(0, 80)); });
  await page.route('https://world.openfoodfacts.org/**', r => r.fulfill({ json: OFF, headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://api.nal.usda.gov/**', r => r.fulfill({ json: { foods: [] }, headers: { 'access-control-allow-origin': '*' } }));
  const settle = () => page.waitForTimeout(150);
  await page.goto(url);
  for (const n of ['Mood', 'Water']) await page.click(`.chip >> text=${n}`);
  await page.click('text=Add 2 trackers'); await settle();
  await page.click('.rate >> text=4'); await settle();
  // Food: scan
  await page.click('.tab >> text=Food'); await settle();
  await page.click('.add-tile:has-text("Barcode")');
  if (hosted) {
    await page.waitForSelector('text=Take photo');
    console.log(label, 'scanner says:', await page.locator('.scan-status').innerText());
    await page.locator('dialog input[type=file]').setInputFiles(`${SP}/barcode.png`);
    await page.waitForSelector('text=Barcode 3017624010046 read', { timeout: 15000 });
    await page.waitForSelector('text=Enter from the label');
    console.log(label, 'photo barcode decoded → label entry offered (offline mode)');
    await page.click('dialog >> text=Cancel');
  } else {
    await page.waitForSelector('text=Look up foods online?', { timeout: 20000 });
    await page.click('text=Allow lookups');
    await page.waitForSelector('text=Grams', { timeout: 15000 });
    await page.click('dialog button[type=submit]'); await settle();
    console.log(label, 'live camera scan + online lookup OK:', await page.locator('.meal .entry').first().innerText());
  }
  await page.click('.add-tile:has-text("Search")'); await page.fill('input[type=search]', 'msemen'); await page.waitForTimeout(400);
  await page.click('.result >> nth=0'); await page.click('dialog button[type=submit]'); await settle();
  // Gym
  await page.click('.tab >> text=Gym'); await settle();
  await page.click('.seg .chip >> text=Exercises'); await settle();
  await page.click('.ex-row >> text=Barbell back squat'); await page.waitForSelector('text=How to do it');
  // Passcode + reload persistence
  await page.click('.tab >> text=Settings'); await settle();
  await page.click('text=Set passcode');
  await page.fill('input[placeholder="Passcode"]', 'atlas123'); await page.fill('input[placeholder="Repeat passcode"]', 'atlas123');
  await page.click('text=Continue'); await page.waitForSelector('text=Passcode set');
  // Backup export
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('text=Export encrypted backup');
  const d = await dl; console.log(label, 'backup download:', d ? d.suggestedFilename() : 'none');
  await page.screenshot({ path: `${SP}/${label}-settings.png` });
  await page.reload();
  await page.fill('input[aria-label="Passcode"]', 'atlas123'); await page.click('button:has-text("Unlock")');
  await page.waitForSelector('.tab'); await page.click('.tab >> text=Food');
  console.log(label, 'after reload+unlock diary:', (await page.locator('.meal .entry').allInnerTexts()).map(s => s.split('\n')[0]));
  console.log(label, 'errors:', errors, 'external:', [...new Set(ext)]);
  await browser.close();
}
(async () => {
  
  await run(`file://${process.cwd()}/dist/PocketStats.html`, 'FILE', false);

})();
