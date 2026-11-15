# Velora 360 · the 360° car showroom (demo)

Explore every car in 360°, inside and out, compare models side by side, and request a test drive or price quote.

```
velora-360/
├── frontend/                  ← the website (HTML/CSS/JS, no build step)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/car3d.js            ⭐ the 3D car generator + 360° viewer (three.js)
│   ├── js/app.js              router, API calls, cards, compare list
│   ├── js/pages/              home, cars, brands, car (360° page), compare, admin
│   └── js/vendor/three/       three.js (MIT licence), bundled so no CDN is needed
├── backend/                   ← the server (Node.js + Express)
│   ├── src/catalog.js         ⭐ demo brands and cars (copied to data/db.json on first run)
│   ├── src/server.js          API: brands, cars, filters, leads, admin
│   ├── src/smoke-test.js      API tests (npm test)
│   └── data/                  live database + admin password (created on first run)
├── start-windows.bat          ← double-click to run on Windows
└── start-mac-linux.sh
```

## Run it

Needs [Node.js](https://nodejs.org) 18+. On Windows, **double-click `start-windows.bat`**. Otherwise:

```bash
npm run install:all
npm run dev
```

- Site: http://localhost:5190
- Dealer admin: http://localhost:5190/#/admin. The password is printed in the server window at start-up and saved in `backend/data/admin-password.txt`. To choose your own, create `backend/.env` with `ADMIN_PASSWORD=your-password`.

## Features

- **360° viewer for every car**:
  - drag to spin, scroll to zoom, auto-rotate
  - front, side, rear, top and ¾ views
  - live paint colour change
  - night mode with working headlights
  - full screen
  - **interior view**: sit in the driver's seat and look around
- **Home page** with a live 3D car, quick finder (brand, body, budget), brands, body types and top-rated cars.
- **Browse** with filters for brand, body type, energy, max price and seats, plus sorting.
- **Brand pages.**
- **Car page** with:
  - key figures, full specs and highlights
  - trim selector
  - **monthly payment calculator**
  - **book a test drive** and **get a quote** forms
  - similar cars
- **Compare up to 3 cars** side by side; the best value on each line is highlighted in green.
- **Dealer admin**:
  - see test-drive and quote requests and update their status
  - **add, edit and delete cars** (the 3D model updates from the body type and dimensions you enter)

## About the 3D cars

There are no 360° photo sets here. Each car is **generated in 3D in the browser** from its body type (hatchback, sedan, SUV, coupé, pickup) and its real dimensions. That gives every model a real 360° and interior view, but the cars are **stylised**, not exact replicas of real vehicles.

To show real cars later you can:

- load a real 3D model per car (`.glb` file) into the same viewer, or
- swap the viewer for a 360° photo spin (a series of 24–36 photos taken around the car).

## Demo data

The brands (Aurex, Novara, Kestrel, Solano, Vantor, Hadley) are **fictional**, so no specs or prices pretend to describe real cars. Replace them from the admin page, or edit `backend/src/catalog.js` and run `npm run seed` with the server stopped.

## When something goes wrong

| What you see | Where to look |
|---|---|
| Red banner "can't reach the backend" | The backend isn't running (window closed?) |
| Error inside a form | `[backend] error` line in the server window names the route |
| `[frontend]` line in the browser console (F12) | A bug in `frontend/js/` |
| "Your browser can't show 3D" | WebGL is off: use a recent Chrome, Edge or Firefox, with hardware acceleration on |
