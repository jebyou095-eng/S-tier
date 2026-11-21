// Run your starter dish photos through the app's own "Enhance" (js/photoedit.js) and save them
// for the Android build. Output goes to private/ (git-ignored): your photos never go into the repo.
// Usage: python3 -m http.server 8765 (in the repo root), then
//        node tools/make_starter_photos.js <photos dir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAP = { 'fried-rice.jpg': 'fried-rice', 'chicken-potato-tagine.jpg': 'chicken-potato-tagine', 'avocado-shake.jpg': 'avocado-shake' };

(async () => {
  const dir = process.argv[2];
  const out = path.join(ROOT, 'private', 'starter');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:8765/manifest.webmanifest');
  await p.setContent('<div id="toast"></div>');
  const index = [];
  for (const [file, id] of Object.entries(MAP)) {
    const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
    const rec = await p.evaluate(async (data) => {
      const m = await import('http://localhost:8765/js/photoedit.js');
      return m.quickEdit(`data:image/jpeg;base64,${data}`, { ...m.freshEdit(), enhance: true, crop: 'square' });
    }, b64);
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(rec));
    index.push({ id, file: `${id}.json` });
    console.log(id, `edited ${Math.round(rec.edited.length / 1024)} KB, original ${Math.round(rec.orig.length / 1024)} KB`);
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
  await b.close();
})();
