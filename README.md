# Pocket Stats

A private, offline analytics app for your phone. Track anything (mood, sleep, water, workouts, spending, your own trackers), then see charts, streaks, trends, weekday patterns and connections between trackers.

It also has a **gym section** (exercise library with muscle maps, animated form demos, a workout logger and a safety & evidence guide) and a **food scanner and calorie counter** with a **bulking / body-recomposition planner**: scan a barcode with your camera, check the calories and macros against more than one trusted source, and follow a meal plan sized to your body and goal.

## Privacy, by design

- **Data never leaves your phone.** No accounts, cloud, server, or sync. Everything is stored in the browser's on-device storage (IndexedDB).
- **Network access is locked down.** A strict Content-Security-Policy allows exactly two hosts, the USDA and Open Food Facts food databases, and nothing else. The app contacts them **only after you allow it**, and sends **only a barcode number or the words you typed**: no cookies, referrer, device ID, diary entries or body stats. You can turn lookups off in Settings, and the built-in food table still works offline.
- **The camera stays on the phone.** Barcodes are decoded on the device; frames are never saved or uploaded.
- **No third-party services.** No CDNs, fonts, analytics or ads. Two libraries are bundled in `js/vendor/`: [ZXing](https://github.com/zxing-js/library) (Apache-2.0), the barcode decoder for phones without a built-in one, and the official [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) (Apache-2.0), used only by the optional photo recognition.
- **Optional passcode encryption.** Data is encrypted at rest with AES-256-GCM, using a key derived from your passcode (PBKDF2-SHA256, 600,000 iterations). The key exists only in memory while the app is unlocked. You can set the app to auto-lock, and its screen goes blank in the app switcher.
- **Works offline.** After the first load, a service worker serves the app with no connection.

> There is no passcode recovery, by design. If you forget it, the only option is to erase and start over. Export an encrypted backup from time to time.

## Put it on your phone

**Android app: `dist/PocketStats.apk`.** Download it on your phone, open it, and allow "install unknown apps" for your browser or Files app when Android asks. Data stays in the app's private storage, is excluded from Google cloud backup, and the screen is hidden from screenshots and the app switcher while a passcode is set. Build it yourself with `PS_KS_PASS=… ./android/build.sh` (no Gradle or Android Studio needed; see the script header). Keep your signing key private and out of this public repo.

**Quickest: download one file.** `dist/PocketStats.html` is the whole app in a single file (about 550 KB) with every feature. Save it on your phone and open it in your browser (Android: Chrome or Firefox). Rebuild it with `python3 tools/build.py`.

**Or host it** (best for installing to the home screen with offline mode):

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
- **Gym → Workout:** evidence-based programs (full body 3×/week, upper/lower 4×, push/pull/legs), set logging with rest timer, last-session recall and progressive-overload hints.
- **Gym → Exercises:** 33 exercises. Tap a muscle on the front/back body map to see what trains it. Each exercise has an animated start ↔ end demonstration, highlighted main and helper muscles, starting position, step-by-step technique, cues, common mistakes, safety notes, sets/reps/rest by goal, and alternatives.
- **Gym → Progress:** workouts per week, estimated 1-rep-max trend per exercise, weekly hard sets per muscle vs. the 10–20 set target, personal bests.
- **Gym → Safety:** PAR-Q+-based health check, red-flag symptoms (with Moroccan emergency numbers), soreness vs. injury, guidance for high blood pressure/heart disease, pregnancy, teens, back pain, diabetes and Ramadan, plus the research and guidelines used (WHO, ACSM, AHA, ACOG, NSCA and peer-reviewed meta-analyses), each linked to PubMed.
- **Food → Diary:** scan a barcode or search, pick a portion, and see calories, protein, carbs, fat and fiber against your targets. It suggests protein-rich foods to close the day's gap.
- **Food → Ingredients:** home and street dishes (harira, msemen, tagines, bocadillo, atay…) are calculated from real recipes. Open one to see each ingredient in your portion, then remove it, halve it or double it ("no smen", "½ sugar") and watch the calories change.
- **Food → Recognise from a photo (optional, off by default):** Claude identifies each food in the photo, Moroccan dishes included, estimates grams and ingredients, and matches it to the food list. You review and adjust everything before logging. This is the only feature that sends a photo off the phone: with your own Anthropic API key in the app and downloaded file, or through your claude.ai account in the web link. Nothing else is sent.
- **Food → Scan & teach (on your phone):** point the camera at a food and move slowly around it; the app captures 10 views and turns them into visual fingerprints with a small on-device network (MobileNetV2, TensorFlow.js). Link a scan to a food once and it recognises that food next time, with your usual portion prefilled. Nothing leaves the phone; fingerprints are encrypted with your passcode and included in backups. Calibrated on 40 product photos: new views of a taught food matched correctly 40/40, and different foods stay well below the "Likely" threshold. (It is a multi-angle scan, not a depth/3D model: browsers can't reach the phone's depth sensor.) **Portion size:** fit the plate or bowl inside the scan circle, which then works as a ruler. The app measures how much of the plate the food covers (plate colour is read from the circle's rim) and, from the portions you've logged for that food, estimates the grams; with portions at different sizes it learns how grams grow with coverage for that food. Packaged products use their package serving instead.
- **Your own photos:** add a photo to any food from its page. It is stored only on your phone (encrypted with your passcode).
- **Food → Plan:** your calorie and macro targets (Mifflin–St Jeor × activity, adjusted for bulk, lean bulk, recomp or cut; protein 1.8–2.2 g/kg), a sample day scaled to hit them (omnivore or vegetarian), and evidence-based training and nutrition tips.
- **Food → Progress:** weekly weight-change rate vs. the right range for your goal, with a suggested calorie adjustment, plus 14-day calorie and protein charts.
- **Settings:** manage trackers, set the passcode and auto-lock, export an encrypted backup, restore, export CSV, erase everything.

## Food data sources

| Source | Used for | Network |
| --- | --- | --- |
| **Moroccan food list** (`data/foods-morocco.json`, served from this repo) | ~9,000 packaged products sold in Moroccan supermarkets (Open Food Facts) plus souk, street, café, bakery and home foods with French and Darija names. Downloaded about once a week, then searched offline; product photos load on demand. See `data/README.md`. | Download of a public list only |
| Built-in table (`js/foods.js`) | ~75 common foods (USDA reference values) plus Moroccan dishes (khobz, msemen, harira, tagine, bissara…) as clearly labelled typical-recipe *estimates* | None, works offline |
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
| `js/gym.js` | Gym tab: workout logger, library, progress, safety |
| `js/exercises.js` | Exercise library, muscles, programs, references |
| `js/body.js` | 2D front/back muscle maps |
| `js/poses.js` | Animated exercise demonstrations |
| `js/fooddb.js` | Downloads and caches the Moroccan food list and photos from this repo |
| `js/recognize.js` | Optional photo recognition with Claude |
| `js/ui.js` | Shared UI helpers |
| `sw.js` | Offline cache (app files only) |
| `tools/build.py` | Bundles everything into the single-file `dist/` builds |
| `android/` | Android app: WebView host (`MainActivity.java`), manifest, icons, `build.sh` |
