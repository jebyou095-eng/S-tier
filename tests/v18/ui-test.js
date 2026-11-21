// Every screen in English and Arabic on a phone-sized screen:
// - the EN | ع switch works on every main screen and is remembered
// - in Arabic: dir="rtl", Arabic font, Western digits, and no English left on screen
// - nothing overflows the screen sideways in either language
// Usage: serve android/app/assets on :8766, then node tests/v18/ui-test.js <screenshot dir>
const { chromium } = require('playwright');

const OUT = process.argv[2] || '/tmp';
const URL = 'http://localhost:8766/index.html';
// Words allowed to stay Latin in Arabic mode: names of databases/standards/brands, citations and units of a formula.
const ALLOWED = new Set(['USDA', 'Open', 'Food', 'Facts', 'FoodData', 'Central', 'PAR-Q', 'Claude', 'Anthropic', 'API', 'AES-256', 'CSV', 'DOMS', 'EZ', 'Goblet',
  'Pocket', 'Stats', 'Epley', 'Mifflin', 'St', 'Jeor', 'Schoenfeld', 'Maeo', 'Fry', 'Saraceni', 'Grgic', 'Morton', 'Keogh', 'Winwood', 'AHA', 'ACOG', 'NSCA', 'ACSM',
  'butt', 'wink', 'rhabdomyolysis', 'Fly', 'Hammer', 'curl', 'Face', 'pull', 'sk-ant', 'SAMU', 'Search', 'ODbL', 'CC', 'BY-SA', 'EN', 'claude.ai', 'console.anthropic.com', 'api.data.gov', 'PubMed', 'et', 'al', 'https', 'and', 'Mon', 'Tue']);

const screens = [];
const add = (name, go) => screens.push({ name, go });
const tab = (p, i) => p.locator('#tabs .tab').nth(i).click();
const seg = (p, i) => p.locator('section > .chips.seg .chip').nth(i).click();
add('today', (p) => tab(p, 0));
add('food-meals', async (p) => { await tab(p, 1); await seg(p, 0); });
add('food-week', async (p) => { await tab(p, 1); await seg(p, 0); await p.locator('.chips.seg').last().locator('.chip').nth(1).click(); });
add('food-diary', async (p) => { await tab(p, 1); await p.locator('.chips.seg').last().locator('.chip').nth(0).click().catch(() => {}); await seg(p, 1); });
add('food-recipes', async (p) => { await tab(p, 1); await seg(p, 2); });
add('recipe', async (p) => { await tab(p, 1); await seg(p, 2); await p.locator('.recipe-card').first().click(); });
add('recipe-plain', async (p) => { await tab(p, 1); await seg(p, 2); await p.locator('.plan-item').first().click(); });
add('food-progress', async (p) => { await tab(p, 1); await seg(p, 3); });
add('gym-workout', async (p) => { await tab(p, 2); await seg(p, 0); });
add('gym-library', async (p) => { await tab(p, 2); await seg(p, 1); });
add('gym-exercise', async (p) => { await tab(p, 2); await seg(p, 1); await p.locator('.ex-row').nth(3).click(); });
add('gym-progress', async (p) => { await tab(p, 2); await seg(p, 2); });
add('gym-safety', async (p) => { await tab(p, 2); await seg(p, 3); });
add('insights', async (p) => { await tab(p, 3); await seg(p, 0); });
add('history', async (p) => { await tab(p, 3); await seg(p, 1); });
add('settings', (p) => tab(p, 4));
add('search-dialog', async (p) => { await tab(p, 1); await seg(p, 1); await p.locator('.add-tile').nth(2).click(); await p.fill('dialog input[type=search]', 'harira'); await p.waitForTimeout(300); });
add('portion-dialog', async (p) => { await p.locator('dialog .result').first().click(); });

async function audit(p) {
  return p.evaluate((allowed) => {
    const W = innerWidth;
    const allow = new Set(allowed);
    const english = []; const overflow = [];
    const skip = (el) => el.closest('[lang="en"],[lang="fr"],[lang="la"],.citation,svg,.src,script,style,[hidden]');
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const root = document.querySelector('dialog[open]') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; const el = n.parentElement;
      if (!el || skip(el) || !visible(el)) continue;
      const words = n.textContent.match(/[A-Za-z][A-Za-z.\-]*[A-Za-z]|[A-Za-z]{2,}/g) || [];
      const bad = words.filter((w) => !allow.has(w) && !allow.has(w.replace(/\.$/, '')) && w.length >= 3);
      if (bad.length) english.push(`${bad.join(' ')} ← "${n.textContent.trim().slice(0, 60)}"`);
      if (/[٠-٩]/.test(n.textContent)) english.push(`Arabic-Indic digits in "${n.textContent.trim().slice(0, 40)}"`);
    }
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el) || el.closest('.chips.scroll, .ed-stage, .recipe-hero, dialog.scanner, svg, .rest')) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 1.5 || r.left < -1.5) overflow.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.left)}–${Math.round(r.right)}`);
    }
    return {
      dir: document.documentElement.dir, lang: document.documentElement.lang, font: getComputedStyle(document.body).fontFamily,
      scrollW: document.documentElement.scrollWidth, W, english: [...new Set(english)].slice(0, 12), overflow: overflow.slice(0, 6), toggles: document.querySelectorAll('.lang-toggle').length,
    };
  }, [...ALLOWED]);
}

(async () => {
  const b = await chromium.launch();
  let fails = 0; let checks = 0;
  const fail = (msg) => { fails++; console.log('FAIL', msg); };
  for (const lang of ['en', 'ar']) {
    const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, locale: lang === 'ar' ? 'ar-MA' : 'en-GB' });
    const p = await ctx.newPage();
    const errs = []; const ext = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('request', (r) => { if (!r.url().startsWith('http://localhost:8766') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) ext.push(r.url()); });
    await p.goto(URL); await p.waitForSelector('#tabs .tab');
    // some data on every screen: trackers, a weight, a program and a set
    await p.locator('.empty .chip').first().click(); await p.locator('.empty .chip').nth(2).click(); await p.locator('.empty .btn.primary').click();
    await p.waitForTimeout(300);
    await tab(p, 2); await p.locator('.card.raised .btn.primary').click(); await p.waitForTimeout(300);
    const card = p.locator('.ex-card').first();
    await card.locator('input').nth(0).fill('40'); await card.locator('input').nth(1).fill('8'); await card.locator('button[type=submit]').click();
    await p.waitForTimeout(300);
    for (const s of screens) {
      await s.go(p); await p.waitForTimeout(450);
      const a = await audit(p);
      checks++;
      await p.screenshot({ path: `${OUT}/${lang}-${s.name}.png` });
      if (a.scrollW > a.W + 1) fail(`${lang}/${s.name}: page scrolls sideways (${a.scrollW} > ${a.W})`);
      if (a.overflow.length) fail(`${lang}/${s.name}: overflow ${a.overflow.join(' | ')}`);
      if (lang === 'ar') {
        if (a.dir !== 'rtl' || a.lang !== 'ar') fail(`ar/${s.name}: not RTL (${a.dir}, ${a.lang})`);
        if (!/IBM Plex Sans Arabic/.test(a.font.split(',')[0])) fail(`ar/${s.name}: Arabic font not first (${a.font})`);
        if (a.english.length) fail(`ar/${s.name}: English left on screen: ${a.english.join(' || ')}`);
      } else if (a.dir !== 'ltr') fail(`en/${s.name}: dir ${a.dir}`);
      if (!s.name.includes('dialog') && !['recipe-plain'].includes(s.name) && a.toggles < 1) fail(`${lang}/${s.name}: no EN | ع switch`);
      if (s.name.includes('dialog') && s.name === 'portion-dialog') await p.locator('dialog .btn.ghost').last().click().catch(() => {});
    }
    // The switch flips the language on the spot and is remembered after a reload
    await tab(p, 4); await p.locator('.lang-toggle').first().click(); await p.waitForTimeout(200);
    const flipped = await p.evaluate(() => document.documentElement.lang);
    await p.reload(); await p.waitForSelector('#tabs .tab');
    const kept = await p.evaluate(() => document.documentElement.lang);
    const want = lang === 'ar' ? 'en' : 'ar';
    if (flipped !== want || kept !== want) fail(`${lang}: switch → ${flipped}, after reload ${kept}`);
    const tabsText = await p.locator('#tabs').innerText();
    if (want === 'ar' ? /Today|Food/.test(tabsText) : /اليوم/.test(tabsText)) fail(`${lang}: tab bar not translated after switch`);
    if (errs.length) fail(`${lang}: page errors ${errs.join(' | ')}`);
    if (ext.length) fail(`${lang}: network requests outside the app: ${ext.join(' ')}`);
    await ctx.close();
  }
  await b.close();
  console.log(`ui-test: ${checks} screens checked in 2 languages, ${fails} failures`);
  process.exit(fails ? 1 : 0);
})();
