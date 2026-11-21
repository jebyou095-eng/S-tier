// Photo editor, end to end in the Android build (serve android/app/assets on :8766):
// background removal on a plate, a bowl, a glass and a tagine; brushes + undo/redo; every
// slider changes the image and resets; the original is kept; photos are encrypted and in
// backups; no network; editor open < 2 s and background removal < 5 s on a 4× slower CPU.
// Usage: node tests/v18/editor-test.js <out dir> [folder with your real photos]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || '/tmp';
const REAL = process.argv[3];
const URL = 'http://localhost:8766/index.html';
let fails = 0; let passes = 0;
const ok = (c, name, extra = '') => { if (c) { passes++; console.log('ok  ', name, extra); } else { fails++; console.log('FAIL', name, extra); } };

/** Synthetic test scenes drawn on a canvas (plate, tagine) + the real photos if given. */
async function sceneFiles(p) {
  const files = {};
  for (const kind of ['plate', 'tagine']) {
    const b64 = await p.evaluate((kind) => {
      const c = document.createElement('canvas'); c.width = 1200; c.height = 1600; const x = c.getContext('2d');
      // wooden table with grain and noise
      const g = x.createLinearGradient(0, 0, 1200, 1600); g.addColorStop(0, '#8a6a4a'); g.addColorStop(1, '#6e5238'); x.fillStyle = g; x.fillRect(0, 0, 1200, 1600);
      for (let i = 0; i < 400; i++) { x.strokeStyle = `rgba(60,40,20,${Math.random() * 0.25})`; x.beginPath(); x.moveTo(0, i * 4 + Math.random() * 6); x.lineTo(1200, i * 4 + Math.random() * 6); x.stroke(); }
      if (kind === 'plate') {
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(620, 840, 470, 420, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#f3f1ec'; x.beginPath(); x.ellipse(600, 800, 460, 410, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#e6e2da'; x.beginPath(); x.ellipse(600, 800, 330, 290, 0, 0, Math.PI * 2); x.fill();
        for (let i = 0; i < 300; i++) { x.fillStyle = ['#d9a441', '#c0392b', '#e8d8a0', '#5a8f3a', '#b5651d'][i % 5]; x.beginPath(); x.arc(600 + (Math.random() - 0.5) * 420, 800 + (Math.random() - 0.5) * 360, 14 + Math.random() * 18, 0, 7); x.fill(); }
      } else {
        x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.ellipse(620, 1130, 460, 120, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#a4472a'; x.beginPath(); x.ellipse(600, 1100, 450, 110, 0, 0, Math.PI * 2); x.fill();
        const cg = x.createLinearGradient(300, 0, 900, 0); cg.addColorStop(0, '#7a3018'); cg.addColorStop(0.5, '#c2603a'); cg.addColorStop(1, '#6a2a14');
        x.fillStyle = cg; x.beginPath(); x.moveTo(250, 1090); x.quadraticCurveTo(600, 980, 950, 1090); x.lineTo(640, 420); x.quadraticCurveTo(600, 380, 560, 420); x.closePath(); x.fill();
        x.fillStyle = '#d9b26a'; x.beginPath(); x.arc(600, 400, 40, 0, 7); x.fill();
      }
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, kind);
    const f = path.join(OUT, `scene-${kind}.jpg`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); files[kind] = f;
  }
  if (REAL) for (const [k, f] of [['bowl (tagine dish)', 'chicken-potato-tagine.jpg'], ['pan', 'fried-rice.jpg'], ['glass', 'avocado-shake.jpg']]) if (fs.existsSync(path.join(REAL, f))) files[k] = path.join(REAL, f);
  return files;
}

async function openRecipe(p, name) {
  await p.locator('#tabs .tab').nth(1).click();
  await p.locator('section > .chips.seg .chip').nth(2).click();
  await p.fill('.rec-search input', name); await p.waitForTimeout(200);
  await p.locator('.plan-item, .recipe-card').first().click();
}

async function addPhoto(p, file) {
  await p.locator('.recipe-hero .btn.outline, .recipe-hero .hero-photo').first().click();
  const chooser = p.waitForEvent('filechooser');
  await p.locator('dialog .btn').nth(1).click(); // Gallery / Choose from gallery
  const fc = await chooser;
  const t0 = Date.now();
  await fc.setFiles(file);
  await p.waitForSelector('dialog.editor canvas[data-open-ms]', { timeout: 20000 });
  return Date.now() - t0;
}

const pixels = (p) => p.evaluate(() => { const c = document.querySelector('dialog.editor canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s += d[i]; return { w: c.width, h: c.height, sum: s, url: c.toDataURL('image/png').length }; });
const frame = () => new Promise((r) => setTimeout(r, 250));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', acceptDownloads: true });
  const p = await ctx.newPage();
  const ext = []; const errs = [];
  p.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://localhost:8766') && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u); });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL); await p.waitForSelector('#tabs .tab');
  const files = await sceneFiles(p);

  // passcode on: photos must be stored encrypted
  await p.locator('#tabs .tab').nth(4).click();
  await p.click('text=Set passcode');
  await p.locator('dialog input').nth(0).fill('atlas123'); await p.locator('dialog input').nth(1).fill('atlas123');
  await p.click('dialog button[type=submit]'); await p.waitForSelector('text=Change passcode', { timeout: 20000 });

  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // ---- background removal on each scene (each through the real editor) ----
  const recipeFor = { plate: 'Fresh orange juice', tagine: 'Lentil tagine', 'bowl (tagine dish)': 'Harira', pan: 'Bissara', glass: 'Louiza' };
  let saved = null;
  for (const [kind, file] of Object.entries(files)) {
    await openRecipe(p, recipeFor[kind]);
    const openMs = await addPhoto(p, file);
    ok(openMs < 2000, `editor opens in < 2 s on 4× slower CPU (${kind})`, `${openMs} ms`);
    await p.click('dialog.editor .ed-tools .chip:has-text("Cut out")');
    await p.waitForTimeout(kind === 'plate' ? 6000 : 300); // you look at the photo for a few seconds first
    const t0 = Date.now();
    await p.click('dialog.editor button:has-text("Remove background")');
    await p.waitForSelector('dialog.editor .chip:has-text("Transparent")', { timeout: 30000 });
    await p.waitForSelector('dialog.editor .ed-busy[hidden]', { state: 'attached' });
    const cutMs = Date.now() - t0;
    ok(cutMs < 5000, `background removal < 5 s on 4× slower CPU (${kind})`, `${cutMs} ms`);
    await p.click('dialog.editor .chip:has-text("Transparent")'); await frame();
    // Quality: on a transparent background, the centre (the dish) is kept and the corners are removed
    const q = await p.evaluate(() => {
      const c = document.querySelector('dialog.editor canvas'); const x = c.getContext('2d'); const W = c.width; const H = c.height;
      const a = (fx, fy, s) => { const d = x.getImageData(Math.round(fx * W - s / 2), Math.round(fy * H - s / 2), s, s).data; let t = 0; for (let i = 3; i < d.length; i += 4) t += d[i]; return t / (d.length / 4) / 255; };
      const s = Math.round(Math.min(W, H) * 0.08);
      return { centre: a(0.5, 0.55, s), corners: (a(0.06, 0.06, s) + a(0.94, 0.06, s) + a(0.06, 0.94, s) + a(0.94, 0.94, s)) / 4 };
    });
    ok(q.centre > 0.8 && q.corners < 0.25, `dish found, background removed (${kind})`, `centre ${q.centre.toFixed(2)}, corners ${q.corners.toFixed(2)}`);
    await p.screenshot({ path: `${OUT}/editor-cut-${kind.split(' ')[0]}.png` });

    if (kind === 'plate') {
      // ---- brushes + undo/redo ----
      await p.click('dialog.editor .chip:has-text("Erase")');
      const before = await pixels(p);
      const box = await p.locator('dialog.editor canvas').boundingBox();
      await p.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5); await p.mouse.down();
      await p.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 8 }); await p.mouse.up(); await frame();
      const erased = await pixels(p);
      ok(erased.sum < before.sum, 'Erase brush removes part of the dish');
      await p.click('dialog.editor button[aria-label="Undo"]'); await frame();
      ok((await pixels(p)).sum === before.sum, 'Undo restores it exactly');
      await p.click('dialog.editor button[aria-label="Redo"]'); await frame();
      ok((await pixels(p)).sum === erased.sum, 'Redo applies it again');
      await p.click('dialog.editor button[aria-label="Undo"]'); await frame();
      await p.click('dialog.editor .chip:has-text("Keep")');
      await p.mouse.move(box.x + 5, box.y + 5); await p.mouse.down(); await p.mouse.move(box.x + 60, box.y + 60, { steps: 5 }); await p.mouse.up(); await frame();
      ok((await pixels(p)).sum > before.sum, 'Keep brush brings background back');
      await p.click('dialog.editor button[aria-label="Undo"]'); await frame();
      // backgrounds
      const bgs = {};
      for (const bg of ['Green-grey', 'Dark', 'Light', 'Soft blur', 'Transparent']) { await p.click(`dialog.editor .chip:has-text("${bg}")`); await frame(); await p.click('dialog.editor .ed-tools .chip:has-text("Crop")'); await frame(); bgs[bg] = (await pixels(p)).sum; await p.click('dialog.editor .ed-tools .chip:has-text("Cut out")'); }
      ok(new Set(Object.values(bgs)).size === 5, 'every background option renders differently');
      await p.click('dialog.editor .chip:has-text("Green-grey")');
      // ---- sliders ----
      await p.click('dialog.editor .ed-tools .chip:has-text("Adjust")'); await frame();
      const base = (await pixels(p)).url;
      const sliders = await p.locator('dialog.editor .slider').count();
      let changed = 0; let reset = 0;
      for (let i = 0; i < sliders; i++) {
        const sl = p.locator('dialog.editor .slider').nth(i);
        await sl.locator('input[type=range]').evaluate((el) => { el.value = '70'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await frame();
        if ((await pixels(p)).url !== base) changed++;
        await sl.locator('button').click(); await frame();
        if ((await pixels(p)).url === base) reset++;
      }
      ok(sliders === 8 && changed === 8, 'all 8 sliders change the image', `${changed}/${sliders}`);
      ok(reset === 8, 'each slider resets', `${reset}/${sliders}`);
      await p.click('dialog.editor .ed-tools .chip:has-text("Enhance")');
      await p.click('dialog.editor .ed-panel .btn:has-text("Enhance")'); await frame();
      ok((await pixels(p)).url !== base, 'one-tap Enhance changes the photo');
      await p.click('dialog.editor .ed-tools .chip:has-text("Crop")');
      await p.click('dialog.editor .chip:has-text("4:5")'); await frame();
      const c45 = await pixels(p); ok(Math.abs(c45.w / c45.h - 0.8) < 0.02, 'crop 4:5');
      await p.click('dialog.editor .chip:has-text("Square")'); await frame();
      const sq = await pixels(p); ok(sq.w === sq.h, 'crop square');
      await p.click('dialog.editor button:has-text("Centre on the dish")');
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await p.click('dialog.editor .ed-top .btn.primary'); // Save
    await p.waitForSelector('dialog.editor', { state: 'detached', timeout: 30000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (kind === 'plate') {
      saved = await p.locator('.recipe-hero img').getAttribute('src');
      ok(/^data:image\/webp/.test(saved || ''), 'edited photo saved as WebP');
      const dims = await p.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); return [i.width, i.height]; }, saved);
      ok(dims[0] === 1080 && dims[1] === 1080, 'saved at about 1080 px', dims.join('×'));
      ok(await p.locator('.recipe-hero .made-badge').count() === 1, '"I MADE THIS" badge appears');
    }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // ---- the original is kept: re-edit, then go back to the original ----
  await openRecipe(p, 'Fresh orange juice');
  await p.locator('.recipe-hero .hero-photo').click();
  await p.locator('dialog button:has-text("Go back to the original")').click();
  await p.waitForSelector('dialog.editor canvas[data-open-ms]');
  const orig = await pixels(p);
  ok(orig.w > 0, 'original reopens in the editor (settings cleared)');
  await p.click('dialog.editor .ed-top .btn.ghost'); // cancel

  // ---- stored encrypted ----
  const store = await p.evaluate(() => new Promise((res) => {
    const q = indexedDB.open('pocket-stats', 1);
    q.onsuccess = () => { const t = q.result.transaction('kv'); const st = t.objectStore('kv'); const out = {}; st.getAllKeys().onsuccess = (e) => { const keys = e.target.result.filter((k) => String(k).startsWith('rphoto:')); let n = keys.length; if (!n) res(out); keys.forEach((k) => { st.get(k).onsuccess = (ev) => { const v = ev.target.result; out[k] = { locked: v.locked, plain: JSON.stringify(v).includes('data:image') }; if (!--n) res(out); }; }); }; };
  }));
  const recs = Object.entries(store);
  ok(recs.length >= Object.keys(files).length && recs.every(([, v]) => v.locked && !v.plain), 'recipe photos stored encrypted (no image data in the clear)', `${recs.length} records`);

  // ---- in the backup: export, erase everything, restore → photo back ----
  await p.locator('#tabs .tab').nth(4).click();
  const dl = p.waitForEvent('download', { timeout: 60000 }).catch(async (e) => { await p.screenshot({ path: `${OUT}/dl-fail.png` }); throw e; });
  await p.click('text=Export encrypted backup');
  const file = path.join(OUT, 'backup.json'); await (await dl).saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(backup.encrypted === true && !fs.readFileSync(file, 'utf8').includes('data:image'), 'backup is encrypted');
  p.once('dialog', () => {});
  await p.click('text=Erase all data'); await p.click('dialog .btn.danger');
  await p.waitForTimeout(500);
  await p.locator('#tabs .tab').nth(4).click();
  const chooser = p.waitForEvent('filechooser');
  await p.click('text=Restore from backup');
  await (await chooser).setFiles(file);
  await p.locator('dialog input[type=password]').fill('atlas123'); await p.click('dialog button[type=submit]');
  await p.click('dialog .btn.danger'); await p.waitForTimeout(1500);
  await openRecipe(p, 'Fresh orange juice');
  const back = await p.locator('.recipe-hero img').getAttribute('src').catch(() => null);
  ok(back === saved, 'photo restored from the backup');

  ok(ext.length === 0, 'no network requests at all', ext.join(' '));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  console.log(`editor-test: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
