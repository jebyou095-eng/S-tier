# Pocket Stats

A private, offline analytics app for your phone. Track anything (mood, sleep, water, workouts, spending, your own trackers), then see charts, streaks, trends, weekday patterns and connections between trackers.

It also has a **food scanner and calorie counter** with a **bulking / body-recomposition planner**: scan a barcode with your camera, check the calories and macros against more than one trusted source, and follow a meal plan sized to your body and goal.

## Privacy, by design

- **Data never leaves your phone.** No accounts, cloud, server, or sync. Everything is stored in the browser's on-device storage (IndexedDB).
- **Network access is locked down.** A strict Content-Security-Policy allows exactly two hosts, the USDA and Open Food Facts food databases, and nothing else. The app contacts them **only after you allow it**, and sends **only a barcode number or the words you typed**: no cookies, referrer, device ID, diary entries or body stats. You can turn lookups off in Settings, and the built-in food table still works offline.
- **The camera stays on the phone.** Barcodes are decoded on the device; frames are never saved or uploaded.
- **No third-party services.** No CDNs, fonts, analytics or ads. The only bundled library is [ZXing](https://github.com/zxing-js/library) (Apache-2.0, `js/vendor/`), the barcode decoder used on phones without a built-in one (e.g. iPhone).
- **Optional passcode encryption.** Data is encrypted at rest with AES-256-GCM, using a key derived from your passcode (PBKDF2-SHA256, 600,000 iterations). The key exists only in memory while the app is unlocked. You can set the app to auto-lock, and its screen goes blank in the app switcher.
- **Works offline.** After the first load, a service worker serves the app with no connection.

> There is no passcode recovery, by design. If you forget it, the only option is to erase and start over. Export an encrypted backup from time to time.

## Put it on your phone

The app is a set of static files. It has to be served over **https** (needed for encryption and offline mode). The easiest way is GitHub Pages:

1. In this repo on GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick your branch and `/ (root)`.
2. Open the Pages URL on your phone.
3. Add it to your home screen:
   - **iPhone (Safari):** Share → *Add to Home Screen*
   - **Android (Chrome):** ⋮ → *Install app* / *Add to Home screen*
4. Open it from the home-screen icon. It now runs full-screen and offline.

The host only ever serves the app's code. Your entries are created and stored on the phone and are never uploaded. Installing to the home screen matters on iPhone: Safari can clear storage for websites you haven't visited in a while, but home-screen apps are exempt.

## Features

- **Today:** quick logging (yes/no toggles, 1–5 ratings, numbers with units and daily goals). You can step back to log past days, and undo.
- **Insights:** week, month, 3-month and year views. Averages, totals, ranges, trend vs. the earlier half of the period, daily bar charts, calendar heatmaps, weekday patterns, streaks, goal hit-rate, and *Connections* (correlations between trackers).
- **History:** every entry, filterable, with deletion.
- **Food → Diary:** scan a barcode or search, pick a portion, and see calories, protein, carbs, fat and fiber against your targets. It suggests protein-rich foods to close the day's gap.
- **Food → Plan:** your calorie and macro targets (Mifflin–St Jeor × activity, adjusted for bulk, lean bulk, recomp or cut; protein 1.8–2.2 g/kg), a sample day scaled to hit them (omnivore or vegetarian), and evidence-based training and nutrition tips.
- **Food → Progress:** weekly weight-change rate vs. the right range for your goal, with a suggested calorie adjustment, plus 14-day calorie and protein charts.
- **Settings:** manage trackers, set the passcode and auto-lock, export an encrypted backup, restore, export CSV, erase everything.

## Food data sources

| Source | Used for | Network |
| --- | --- | --- |
| Built-in table (`js/foods.js`) | ~70 common whole foods, USDA reference values | None, works offline |
| [USDA FoodData Central](https://fdc.nal.usda.gov/) | Generic and branded foods (US government) | Opt-in |
| [Open Food Facts](https://world.openfoodfacts.org/) | Packaged products by barcode, worldwide | Opt-in |
| You | Values typed from a nutrition label | None |

A scanned barcode goes to both online databases at once. If they disagree on calories by more than about 10%, the app warns you to compare against the label on the pack. Products you add are saved on the phone, so rescanning them later is instant and offline. USDA's shared demo key is rate-limited; you can paste a free personal key from api.data.gov in Settings.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Shell + Content-Security-Policy |
| `js/app.js` | UI and app logic |
| `js/db.js` | On-device storage and encryption |
| `js/stats.js` | Date helpers and statistics |
| `js/charts.js` | Dependency-free SVG charts |
| `js/food.js` | Food tab: diary, scan/search flows, plan, progress |
| `js/foods.js` | Built-in food table + meal-plan templates |
| `js/nutrition.js` | Targets, plan scaling, USDA / Open Food Facts lookups |
| `js/scanner.js` | On-device camera barcode scanner |
| `js/ui.js` | Shared UI helpers |
| `sw.js` | Offline cache (app files only) |
