const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [], ext = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (!r.url().startsWith('http://localhost:8765')) ext.push(r.url()); });
  const settle = () => page.waitForTimeout(150);
  await page.goto('http://localhost:8765/');
  await page.click('.tab >> text=Gym'); await settle();
  await page.screenshot({ path: `${SP}/g0.png`, fullPage: true });
  // Health check
  await page.click('text=Take the health check'); await settle();
  for (let i = 0; i < 7; i++) await page.locator('.parq li').nth(i).locator('.chip >> text=No').click();
  await page.waitForSelector('text=cleared to start');
  await page.screenshot({ path: `${SP}/g1-safety.png`, fullPage: true });
  // Program + log sets
  await page.click('.seg .chip >> text=Workout'); await settle();
  await page.locator('.card:has-text("Full body") >> text=Start this program').click(); await settle();
  const card = page.locator('.ex-card').first();
  await card.locator('input').nth(0).fill('20'); await card.locator('input').nth(1).fill('10');
  await card.locator('button[type=submit]').click(); await settle();
  await card.locator('button[type=submit]').click(); await settle();
  const bench = page.locator('.ex-card').nth(1);
  await bench.locator('input').nth(0).fill('50'); await bench.locator('input').nth(1).fill('8');
  await bench.locator('button[type=submit]').click(); await settle();
  await page.screenshot({ path: `${SP}/g2-workout.png` });
  console.log('rest timer visible:', await page.locator('.rest').isVisible(), await page.locator('.rest').innerText());
  // Seed history across weeks for progress via direct sets on earlier days isn't possible through UI; log is enough
  // Library + muscle filter
  await page.click('.seg .chip >> text=Exercises'); await settle();
  await page.locator('.body-map').nth(1).locator('[data-muscle="lats"] path').first().click(); await settle();
  console.log('lats exercises:', (await page.locator('.ex-row strong').allInnerTexts()).join(', '));
  await page.screenshot({ path: `${SP}/g3-library.png`, fullPage: true });
  await page.click('.ex-row >> text=Pull-up'); await settle();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SP}/g4-detail.png`, fullPage: true });
  await page.click('.link.back'); await settle();
  // Every exercise detail renders without error
  const n = await page.evaluate(async () => (await import('./js/exercises.js')).EXERCISES.length);
  for (let i = 0; i < n; i++) {
    await page.click('.seg .chip >> text=Exercises'); await settle();
    if (await page.locator('text=Clear').count()) await page.click('text=Clear');
    await page.locator('.ex-row').nth(i).click(); await page.waitForSelector('text=How to do it');
  }
  console.log('details rendered:', n);
  await page.click('.seg .chip >> text=Progress'); await settle();
  await page.screenshot({ path: `${SP}/g5-progress.png`, fullPage: true });
  // Moroccan food search
  await page.click('.tab >> text=Food'); await settle();
  await page.click('.seg .chip >> text=Diary'); await settle();
  await page.click('.add-tile:has-text("Search")');
  await page.fill('input[type=search]', 'harira');
  console.log('harira search:', await page.locator('.result').first().innerText());
  await page.click('dialog >> text=Close');
  await page.click('.tab >> text=Insights'); await settle();
  await page.click('.seg .chip >> text=History'); await settle();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.tab >> text=Gym'); await settle();
  await page.click('.seg .chip >> text=Exercises'); await settle();
  await page.click('.ex-row >> text=Barbell back squat'); await page.waitForTimeout(700);
  await page.screenshot({ path: `${SP}/g6-dark.png` });
  await page.reload(); await page.click('.tab >> text=Gym');
  console.log('sets after reload:', await page.locator('.sets li').count());
  console.log('errors:', errors, 'external:', ext);
  await browser.close();
})();
