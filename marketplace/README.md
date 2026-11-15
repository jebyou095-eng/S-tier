# Agora: a buy & sell marketplace

A complete marketplace website where people can **sell** items (with photos), and **buy** them through a bag and checkout. It also has favourites, buyer–seller messaging, offers, order tracking and seller profiles.

The **frontend** and **backend** are in separate folders, so when something breaks you know where to look.

```
marketplace/
├── backend/            ← REST API (Node.js + Express), data, uploaded photos
│   ├── src/
│   │   ├── server.js       app setup, logging, error handler
│   │   ├── routes/         one file per area: auth, listings, orders, favorites, messages, users, meta
│   │   ├── middleware/     login check (JWT), photo uploads
│   │   ├── db.js           JSON-file database (backend/data/db.json)
│   │   ├── seed.js         demo sellers, listings, reviews
│   │   └── smoke-test.js   end-to-end API test (npm test)
│   ├── uploads/        photos people upload
│   └── .env.example
├── frontend/           ← the website (plain HTML/CSS/JS, no build step)
│   ├── index.html
│   ├── css/styles.css  design system + all animations
│   ├── js/
│   │   ├── app.js          nav, bag drawer, global buttons
│   │   ├── router.js       page switching + page transitions
│   │   ├── api.js          every call to the backend goes through here
│   │   ├── store.js        login session + bag (saved in the browser)
│   │   ├── ui.js           cards, toasts, modals, scroll reveal, parallax, confetti…
│   │   ├── config.js       backend address
│   │   └── pages/          one file per page: home, shop, item, sell, checkout, account, messages…
│   └── server.js       tiny static server (port 5173)
└── dev.js              runs both together
```

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd marketplace
npm run install:all     # installs backend packages (the frontend needs none)
npm run dev             # starts backend on :4000 and frontend on :5173
```

Open **http://localhost:5173**. Log in with the demo account **demo@agora.test / demo1234** (or create your own). The demo sellers (`maya@`, `leo@`, `sofia@`, `noah@`, `amara@agora.test`) use the same password.

To run them separately, use two terminals:

```bash
cd marketplace/backend && npm start      # API  → http://localhost:4000/api
cd marketplace/frontend && npm start     # site → http://localhost:5173
```

Other commands: `npm test` (backend API test, with the backend running) and `npm run seed` (reset the demo data; stop the backend first).

## Finding problems

| What you see | Where the problem is |
|---|---|
| Red banner at the top: *"Frontend can't reach the backend…"* | The backend isn't running, or `frontend/js/config.js` points to the wrong address. |
| A toast that says *"Problem in: backend POST /api/…"* | The backend refused the request. Its terminal shows a `[backend] warn` or `[backend] ERROR` line for that route. Look in `backend/src/routes/<area>.js`. |
| Browser console line starting with `[frontend]` | A bug in the website code (`frontend/js/…`). |
| Console line starting with `[backend error]` | The backend answered with an error. The message names the route. |
| Grey box instead of a photo | The image link is broken (it is logged as `[frontend] Image failed to load`). |
| `npm test` shows `FAIL  <step>` | That API feature is broken. The step name tells you which one. |

Every backend error comes back as `{ "error": "...", "where": "backend METHOD /api/..." }`.

## Features

- **Buy**: browse with category chips, search, condition and price filters, sorting and pagination; listing pages with a photo gallery (zoom on hover, swipe on phones, full-screen view); bag drawer; checkout with live card preview; order confirmation; order history with a shipping timeline; cancel before shipping.
- **Sell**: drag & drop photo upload (or paste image links), category, condition, price, quantity; edit, pause, resume and delete listings; sales dashboard with revenue; mark orders shipped and delivered.
- **Community**: save favourites, message sellers, make offers, unread message dot, seller profiles with reviews and ratings.
- **Accounts**: register and log in (passwords hashed with bcrypt, JWT sessions), profile settings.
- **Animations**: word-by-word hero headline, floating cards, parallax, scrolling marquee, scroll-reveal on every section, image reveal, hover lift and zoom on cards with a second photo on hover, fill-sweep buttons, magnetic buttons, heart pop, fly-to-bag, skeleton loaders, page transitions, sliding drawer and modals, animated counters, sliding tab indicator, check-mark draw and confetti after purchase. All motion is turned off for people who set "reduce motion" on their device.
- **Responsive**: works from phones (390px) to large desktops.

## Notes

- **Payments are simulated.** The checkout checks that card details look valid but never charges or stores them. Use `4242 4242 4242 4242`, any future date, any CVC. To take real payments, connect a provider such as Stripe in `backend/src/routes/orders.js`.
- **Photos** come from [Unsplash](https://unsplash.com) (free to use) and load from their servers.
- **Data** is stored in `backend/data/db.json`. That's fine for a demo or small site. For a busy site, swap `backend/src/db.js` for a real database (PostgreSQL, MongoDB…). The routes don't need to change much.
- **Before going live**: set `JWT_SECRET` and `CORS_ORIGIN` in `backend/.env` (see `.env.example`), and point `frontend/js/config.js` at your API address.
