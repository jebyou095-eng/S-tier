# Pocket Stats

A private, offline analytics app for your phone. Track anything (mood, sleep, water, workouts, spending, your own trackers), then see charts, streaks, trends, weekday patterns and connections between trackers.

## Privacy, by design

- **Data never leaves your phone.** No accounts, cloud, server, or sync. Everything is stored in the browser's on-device storage (IndexedDB).
- **Network requests are blocked.** A strict Content-Security-Policy (`connect-src 'none'`) means the app cannot send data anywhere, even by accident.
- **No third-party code.** The app has no dependencies, CDNs, fonts, analytics or ads. It is about 1,000 lines of plain HTML/CSS/JS you can read yourself.
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
- **Settings:** manage trackers, set the passcode and auto-lock, export an encrypted backup, restore, export CSV, erase everything.

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
| `sw.js` | Offline cache (app files only) |
