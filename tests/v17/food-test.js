const { chromium, devices } = require('playwright');
const SP = process.argv[2];
const OFF = { status: 1, product: { code: '3017624010046', product_name: 'Nutella', brands: 'Ferrero', serving_quantity: 15, serving_size: '15 g',
  nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, fiber_100g: 0 } } };
const FDC = { foods: [{ fdcId: 2041155, description: 'NUTELLA HAZELNUT SPREAD', gtinUpc: '3017624010046', brandOwner: 'Ferrero', dataType: 'Branded', servingSize: 37, servingSizeUnit: 'g', householdServingFullText: '2 Tbsp',
  foodNutrients: [{ nutrientNumber: '208', value: 541 }, { nutrientNumber: '203', value: 5.41 }, { nutrientNumber: '205', value: 59.5 }, { nutrientNumber: '204', value: 29.7 }, { nutrientNumber: '291', value: 2.7 }] }] };
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${SP}/barcode.y4m`] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [], hosts = new Set(), sent = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { const u = new URL(r.url()); if (u.host !== 'localhost:8765') { hosts.add(u.host); sent.push(u.pathname + u.search); } });
  await page.route('https://world.openfoodfacts.org/**', r => r.fulfill({ json: r.request().url().includes('search') ? { products: [OFF.product] } : OFF, headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://api.nal.usda.gov/**', r => r.fulfill({ json: FDC, headers: { 'access-control-allow-origin': '*' } }));
  const settle = () => page.waitForTimeout(150);

  await page.goto('http://localhost:8765/');
  // unit checks of pure logic
  console.log('unit:', JSON.stringify(await page.evaluate(async () => {
    const n = await import('./js/nutrition.js'); const s = await import('./js/scanner.js');
    const t = n.targets({ sex: 'male', age: 25, heightCm: 180, weightKg: 70, activity: 1.55, goal: 'lean' });
    const plan = n.buildPlan('omnivore', t);
    const vplan = n.buildPlan('vegetarian', t);
    return { t, plan: { kcal: Math.round(plan.n.kcal), p: Math.round(plan.n.p) }, vplan: { kcal: Math.round(vplan.n.kcal), p: Math.round(vplan.n.p) },
      ean: s.validBarcode('3017624010046'), bad: s.validBarcode('3017624010047'), upce: s.expandUpcE('04252614'), upceOk: s.validBarcode('04252614') };
  })));
  await page.click('.tab >> text=Food');
  await page.screenshot({ path: `${SP}/f0.png` });
  await page.click('.seg .chip >> text=Progress'); await page.click('text=Update weight, goal or details');
  await page.click('text=lb / ft');
  await page.locator('dialog .field:has-text("Weight") input').fill('155');
  await page.click('text=Calculate my targets'); await settle();
  await page.click('.seg .chip >> text=Diary'); await settle();

  // Scan with the fake camera (ZXing path in headless Chromium)
  console.log('native BarcodeDetector:', await page.evaluate(() => 'BarcodeDetector' in window));
  await page.click('.add-tile:has-text("Barcode")');
  await page.waitForSelector('text=Look up foods online?', { timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: `${SP}/f-fail.png` }); console.log('ERRS', errors.filter((x) => !x.includes('404'))); throw e; });
  await page.screenshot({ path: `${SP}/f1-consent.png` });
  await page.click('text=Allow lookups');
  await page.waitForSelector('text=Found it', { timeout: 15000 });
  await page.screenshot({ path: `${SP}/f2-found.png` });
  await page.click('.result >> nth=0');
  await page.waitForSelector('text=Grams');
  await page.click('.chip >> text=15 g');
  await page.screenshot({ path: `${SP}/f3-portion.png` });
  await page.click('dialog button[type=submit]'); await settle();

  // Built-in search
  await page.click('.add-tile:has-text("Search")');
  await page.fill('input[type=search]', 'chicken br');
  await page.click('.result >> nth=0');
  await page.fill('input[aria-label="Amount in grams"]', '200');
  await page.selectOption('dialog select', 'lunch');
  await page.click('dialog button[type=submit]'); await settle();
  // Online search
  await page.click('.add-tile:has-text("Search")');
  await page.fill('input[type=search]', 'hazelnut spread');
  await page.click('text=Search online');
  await page.waitForSelector('text=from online sources');
  await page.screenshot({ path: `${SP}/f4-search.png` });
  await page.click('dialog >> text=Close');
  // Label entry
  await page.click('.add-tile:has-text("Search")');
  await page.click('text=Enter from label');
  await page.locator('dialog .field:has-text("Name") input').fill('Protein bar');
  await page.locator('dialog .field:has-text("Serving size") input').fill('60');
  for (const [l, v] of [['Calories', '210'], ['Protein', '20'], ['Carbs', '22'], ['Fat', '7']]) await page.locator(`dialog .field:has-text("${l}") input`).fill(v);
  await page.click('text=Save food');
  await page.click('dialog button[type=submit]'); await settle();
  await page.screenshot({ path: `${SP}/f5-diary.png`, fullPage: true });
  // Rescan: should be instant from saved foods, no new network
  const before = sent.length;
  await page.click('.add-tile:has-text("Barcode")');
  await page.waitForSelector('text=Grams', { timeout: 20000 });
  console.log('rescan network calls:', sent.length - before);
  await page.click('dialog >> text=Cancel');
  await page.click('.seg .chip >> text=Meals'); await settle();
  await page.screenshot({ path: `${SP}/f6-plan.png`, fullPage: true });
  await page.click('.chip >> text=Progress'); await settle();
  await page.screenshot({ path: `${SP}/f7-progress.png`, fullPage: true });
  await page.click('.tab >> text=Settings'); await settle();
  await page.screenshot({ path: `${SP}/f8-settings.png`, fullPage: true });
  console.log('trackers:', await page.evaluate(() => 0) , await page.locator('.manage li').allInnerTexts());
  // Persistence check
  await page.reload(); await page.click('.tab >> text=Food'); await page.click('.seg .chip >> text=Diary');
  console.log('diary after reload:', await page.locator('.meal .entry').allInnerTexts());
  console.log('errors:', errors); console.log('hosts contacted:', [...hosts]); console.log('requests sent:', sent);
  await browser.close();
})();
