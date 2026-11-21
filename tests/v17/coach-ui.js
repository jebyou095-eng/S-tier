const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/github/, r => r.abort());
  await p.goto('http://localhost:8765/'); await p.waitForSelector('.chip');
  // Seed realistic history: Full body, user stops after ~3 exercises and skips lateral raises
  await p.evaluate(async () => {
    const c = await import('./js/coach.js');
    const T = (day, min) => new Date(`${day}T18:00`).getTime() + min * 60000;
    const days = ['2026-10-22', '2026-10-24', '2026-10-27', '2026-10-29', '2026-10-31', '2026-11-03', '2026-11-05', '2026-11-08'];
    const log = [];
    days.forEach((day, k) => { const pday = `fb3:${k % 2}`; let t = 0;
      c.planned(pday).filter(([id]) => id !== 'lateral-raise').slice(0, 3).forEach(([id, n]) => { for (let i = 0; i < n; i++) { log.push({ id: day + id + i, day, ts: T(day, t), ex: id, kg: 40, reps: 9, pday }); t += 2.6; } }); });
    const data = { v: 1, trackers: [], entries: [], settings: { autoLock: 1 }, food: {}, gym: { program: 'fb3', log, screen: { date: '2026-10-20', yes: 0 }, sessions: [] } };
    await new Promise((res) => { const q = indexedDB.open('pocket-stats', 1); q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ v: 1, locked: false, data }, 'vault'); t.oncomplete = res; }; });
  });
  await p.reload(); await p.waitForSelector('.tab');
  await p.click('.tab >> text=Gym'); await p.waitForSelector('.coach');
  console.log('header:', await p.locator('.gym h1').first().innerText(), '|', await p.locator('.gym .page-head .date').first().innerText());
  console.log('coach:', (await p.locator('.coach-list li').allInnerTexts()).map(t => t.replace(/\n/g, ' ')));
  console.log('stats:', await p.locator('.coach > p.muted').last().innerText());
  await p.screenshot({ path: process.argv[2] + '/coach.png', fullPage: false });
  // Accept the swap suggestion if present
  const swap = p.locator('.coach button:has-text("Swap for")');
  if (await swap.count()) { await swap.first().click(); await p.waitForTimeout(300); console.log('after swap:', (await p.locator('.coach-list li').allInnerTexts()).map(t => t.replace(/\n/g, ' ')).join(' || ')); }
  // Time chip 45
  await p.click('.coach .chip:has-text("45")'); await p.waitForTimeout(200);
  console.log('with 45 min:', await p.locator('.gym .page-head .date').first().innerText());
  // Log a set and finish
  const card = p.locator('.ex-card').first();
  await card.locator('input').nth(0).fill('40'); await card.locator('input').nth(1).fill('8'); await card.locator('button[type=submit]').click(); await p.waitForTimeout(300);
  await p.click('text=Finish workout'); await p.waitForSelector('.feel');
  await p.screenshot({ path: process.argv[2] + '/coach-finish.png' });
  console.log('finish:', await p.locator('.sheet-body p').first().innerText());
  await p.click('.feel-btn:has-text("Too much")'); await p.waitForTimeout(300);
  await p.reload(); await p.click('.tab >> text=Gym'); await p.waitForSelector('.coach');
  console.log('after reload, time chip on:', await p.locator('.coach .chip.on').innerText(), '| errors:', errs);
  await b.close();
})();
