const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const settle = () => page.waitForTimeout(120);
  const errors = [], external = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (!r.url().startsWith('http://localhost:8765')) external.push(r.url()); });
  await page.goto('http://localhost:8765/');
  await page.screenshot({ path: `${SP}/0-empty.png` });
  for (const n of ['Mood','Sleep','Water','Exercise','Spending']) await page.click(`.chip >> text=${n}`); await page.click('text=Add 5 trackers');
  // Seed 60 days of history directly via the UI's day navigation would be slow; instead log today + a few past days via UI
  await page.click('.rate >> text=4'); await settle();
  await page.fill('input[aria-label="Water value"]', '3'); await page.click('form:has(input[aria-label="Water value"]) >> text=Add'); await settle();
  await page.fill('input[aria-label="Sleep value"]', '7.5'); await page.click('form:has(input[aria-label="Sleep value"]) >> text=Log'); await settle();
  await page.click('text=Mark done'); await settle();
  for (let d = 1; d <= 20; d++) {
    await page.click('[aria-label="Previous day"]'); await settle();
    const mood = 1 + (d * 7) % 5;
    await page.click(`.rate >> text=${mood}`); await settle();
    await page.fill('input[aria-label="Sleep value"]', String(5 + mood * 0.7)); await page.click('form:has(input[aria-label="Sleep value"]) >> text=Log'); await settle();
    await page.fill('input[aria-label="Water value"]', String(2 + d % 6)); await page.click('form:has(input[aria-label="Water value"]) >> text=Add'); await settle();
    if (d % 3) await page.click('text=Mark done'); await settle();
    if (d % 2) { await page.fill('input[aria-label="Spending value"]', String(10 + d * 3)); await page.click('form:has(input[aria-label="Spending value"]) >> text=Add'); await settle(); }
  }
  await page.click('text=Back to today');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SP}/1-today.png`, fullPage: true });
  await page.click('.tab >> text=Insights');
  await page.screenshot({ path: `${SP}/2-insights.png`, fullPage: true });
  await page.click('.tab >> text=Insights'); await page.click('.seg .chip >> text=History');
  await page.screenshot({ path: `${SP}/3-history.png` });
  await page.click('.tab >> text=Settings');
  await page.click('text=Set passcode');
  await page.fill('input[placeholder="Passcode"]', 'hunter22');
  await page.fill('input[placeholder="Repeat passcode"]', 'hunter22');
  await page.click('text=Continue');
  await page.waitForSelector('text=Passcode set');
  await page.screenshot({ path: `${SP}/4-settings.png`, fullPage: true });
  const raw = await page.evaluate(() => new Promise(r => { const q = indexedDB.open('pocket-stats'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('vault'); g.onsuccess = () => r({ locked: g.result.locked, hasData: 'data' in g.result, ctLen: g.result.ct?.length }); }; }));
  console.log('stored vault:', JSON.stringify(raw));
  await page.reload();
  await page.waitForSelector('text=Enter your passcode');
  await page.fill('input[aria-label="Passcode"]', 'wrong'); await page.click('text=Unlock');
  await page.waitForSelector('text=Wrong passcode.');
  await page.screenshot({ path: `${SP}/5-lock.png` });
  await page.fill('input[aria-label="Passcode"]', 'hunter22'); await page.click('button:has-text("Unlock")');
  await page.waitForSelector('.tab');
  console.log('unlocked, entries:', await page.locator('.tab').count());
  await page.click('.tab >> text=Insights');
  console.log('connections:', await page.locator('.rels li').allInnerTexts());
  // dark mode screenshot
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.tab >> text=Today');
  await page.screenshot({ path: `${SP}/6-dark.png` });
  console.log('errors:', errors); console.log('external requests:', external);
  await browser.close();
})();
