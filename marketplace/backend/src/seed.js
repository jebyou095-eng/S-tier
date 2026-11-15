// Demo data so the marketplace looks alive on first run.
// Run "npm run seed" to wipe and re-create it.
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { db, load, reset, flush, id } from './db.js';

const img = (pid) => `https://images.unsplash.com/photo-${pid}?w=1200&q=80&auto=format&fit=crop`;
const face = (pid) => `https://images.unsplash.com/photo-${pid}?w=200&h=200&q=80&auto=format&fit=crop&crop=faces`;
const daysAgo = (d) => new Date(Date.now() - d * 864e5 - Math.random() * 36e5).toISOString();

const SELLERS = [
  { key: 'maya', name: 'Maya Laurent', avatar: face('1494790108377-be9c29b29330'), location: 'Paris, FR', bio: 'Vintage hunter & interior stylist. Everything is cleaned and photographed in daylight.', rating: 4.9, ratingCount: 128, verified: true },
  { key: 'leo', name: 'Leo Martins', avatar: face('1507003211169-0a1dd7228f2d'), location: 'Lisbon, PT', bio: 'Photographer upgrading gear. I ship fast and pack like it is going to the moon.', rating: 4.8, ratingCount: 76, verified: true },
  { key: 'sofia', name: 'Sofia Chen', avatar: face('1438761681033-6461ffad8d80'), location: 'Amsterdam, NL', bio: 'Minimal wardrobe, maximal quality. Pre-loved designer pieces.', rating: 5.0, ratingCount: 54, verified: true },
  { key: 'noah', name: 'Noah Bennett', avatar: face('1500648767791-00dcc994a43e'), location: 'Berlin, DE', bio: 'Tech reseller. All devices factory reset and tested.', rating: 4.7, ratingCount: 203, verified: false },
  { key: 'amara', name: 'Amara Okafor', avatar: face('1534528741775-53994a69daeb'), location: 'London, UK', bio: 'Musician and bookworm clearing shelves for new finds.', rating: 4.9, ratingCount: 41, verified: true },
];

const L = [
  ['maya', 'home', 'Velvet Emerald Three-Seater Sofa', 'Deep green velvet sofa with solid oak legs. Incredibly comfortable, no stains or tears. Pet-free, smoke-free home. Dimensions: 210 × 90 × 85 cm.', 890, 1450, 'like-new', ['1555041469-a586c61ea9bc', '1586023492125-27b2c045efd7']],
  ['maya', 'home', 'Mid-Century Lounge Armchair', 'Classic mid-century armchair in caramel tones. Re-upholstered last year. A statement piece for any reading corner.', 340, 520, 'good', ['1567538096630-e0c55bd6374c']],
  ['maya', 'home', 'Handmade Oak Stool', 'Solid oak stool, hand-finished with natural oil. Works as a side table or plant stand.', 75, null, 'new', ['1503602642458-232111445657']],
  ['maya', 'home', 'Brass Arc Floor Lamp', 'Warm brushed-brass floor lamp with a linen shade. Dimmable LED bulb included.', 160, 260, 'like-new', ['1507473885765-e6ed057f782c']],
  ['leo', 'cameras', 'Vintage Polaroid OneStep Camera', 'Fully working, tested with fresh film. Comes with a strap and one pack of colour film.', 95, null, 'good', ['1526170375885-4d8ecf77b99f']],
  ['leo', 'cameras', 'Mirrorless Camera Body + Kit Lens', 'Low shutter count (approx. 4,200). Includes 2 batteries, charger, and original box.', 720, 1100, 'like-new', ['1502920917128-1aa500764cbd', '1516035069371-29a1b244cc32']],
  ['leo', 'cameras', '50mm f/1.8 Prime Lens', 'Tack-sharp prime, perfect for portraits. Clean glass, no fungus or haze. Caps included.', 140, 210, 'good', ['1516035069371-29a1b244cc32']],
  ['leo', 'electronics', 'Studio Over-Ear Headphones', 'Closed-back wireless headphones with active noise cancelling. 30h battery. Case included.', 180, 349, 'like-new', ['1505740420928-5e560c06d30e']],
  ['sofia', 'fashion', 'Classic Leather Biker Jacket', 'Genuine lambskin leather jacket, size M. Soft, broken in perfectly, silver hardware.', 210, 480, 'good', ['1551028719-00167b16eac5']],
  ['sofia', 'fashion', 'Structured Leather Tote', 'Tan leather tote with a laptop sleeve. Worn twice. Dust bag included.', 260, 420, 'like-new', ['1584917865442-de89df76afd3']],
  ['sofia', 'fashion', 'Red Running Sneakers', 'Lightweight running shoes, EU 42. Barely used, still have the box.', 85, 140, 'like-new', ['1542291026-7eec264c27ff']],
  ['sofia', 'fashion', 'Tortoiseshell Sunglasses', 'Polarised lenses, acetate frame. Comes with the original hard case.', 65, 150, 'new', ['1572635196237-14b3f281503f']],
  ['sofia', 'fashion', 'Minimal White Sneakers', 'Clean white leather sneakers, EU 39. Worn a handful of times, freshly cleaned.', 70, 120, 'good', ['1491553895911-0055eca6402d']],
  ['noah', 'electronics', 'Ultrabook 14" — 16GB / 512GB', 'Aluminium ultrabook, battery health 94%. Factory reset, includes charger. No dents.', 950, 1499, 'like-new', ['1517336714731-489689fd1ca8', '1496181133206-80ce9b88a853']],
  ['noah', 'electronics', 'Smartphone 128GB — Unlocked', 'Unlocked, works with any carrier. Screen protector applied since day one. Battery 91%.', 420, 799, 'good', ['1511707171634-5f897ff02aa9', '1510557880182-3d4d3cba35a5']],
  ['noah', 'electronics', 'Wireless Game Controller', 'Works perfectly, no drift. Includes USB-C cable.', 45, 69, 'good', ['1606144042614-b2417e99c4e3']],
  ['noah', 'watches', 'Smartwatch with Sport Band', 'Fitness tracking, GPS, heart-rate. Comes with two bands and the magnetic charger.', 190, 399, 'like-new', ['1546868871-7041f2a55e12']],
  ['noah', 'electronics', '4K Smart TV 55"', 'Stunning picture, HDR, all smart apps. Pickup only or local delivery.', 380, 649, 'good', ['1593359677879-a4bb92f829d1']],
  ['amara', 'music', 'Acoustic Dreadnought Guitar', 'Solid spruce top, warm and loud. New strings fitted. Soft case included.', 240, 399, 'good', ['1510127034890-ba27508e9f1c']],
  ['amara', 'music', 'Electric Guitar — Sunburst', 'Plays beautifully, low action, setup done last month. Gig bag included.', 460, 699, 'like-new', ['1520523839897-bd0b52f945a0']],
  ['amara', 'books', 'Curated Bundle of 12 Novels', 'A dozen modern classics in great condition. Perfect starter library.', 48, null, 'good', ['1512820790803-83ca734da794', '1495446815901-a7297e633e8d']],
  ['amara', 'books', 'Hardcover Design Book Collection', 'Five coffee-table design books on architecture and typography.', 90, 180, 'like-new', ['1544816155-12df9643f363']],
  ['maya', 'watches', 'Automatic Field Watch — 38mm', 'Swiss automatic movement, sapphire crystal, serviced 2025. Box & papers.', 1250, 1900, 'like-new', ['1524805444758-089113d48a6d', '1522312346375-d1a52e2b99b3']],
  ['sofia', 'watches', 'Minimalist Gold Wristwatch', 'Clean dial, quartz movement, leather strap. New battery fitted.', 135, 220, 'good', ['1523275335684-37898b6baf30']],
  ['leo', 'sports', 'Steel Road Bike — 56cm', 'Lugged steel frame, 2×9 gearing, new tyres and bar tape. Rides like a dream.', 520, null, 'good', ['1485965120184-e220f721d03e', '1571068316344-75bc76f77890']],
  ['noah', 'sports', 'City Commuter Bicycle', 'Comfortable upright city bike with basket and lights. Recently serviced.', 260, 450, 'good', ['1558618666-fcd25c85cd64']],
  ['maya', 'home', 'Pour-Over Coffee Set', 'Glass pour-over brewer, ceramic dripper and gooseneck kettle. Barely used.', 55, 95, 'like-new', ['1495474472287-4d71bcdd2085']],
  ['amara', 'music', 'Studio Monitor Headphones', 'Flat response, ideal for mixing. Detachable cable. Ear pads replaced.', 85, 160, 'good', ['1560343090-f0409e92791a']],
];

export async function seedIfEmpty() {
  load();
  if (db.users.length) return false;
  await seed();
  console.log('[backend] Seeded demo data. Demo login: demo@agora.test / demo1234');
  return true;
}

export async function seed() {
  reset();
  const hash = await bcrypt.hash('demo1234', 10);
  const users = {};
  for (const [i, s] of SELLERS.entries()) {
    const { key, ...rest } = s;
    users[key] = { id: id('usr'), email: `${key}@agora.test`, passwordHash: hash, ...rest, createdAt: daysAgo(400 - i * 50) };
    db.users.push(users[key]);
  }
  const demo = { id: id('usr'), name: 'Demo Buyer', email: 'demo@agora.test', passwordHash: hash, avatar: face('1519345182560-3f2917c472ef'), location: 'Madrid, ES', bio: 'Just here for good finds.', rating: 0, ratingCount: 0, verified: false, createdAt: daysAgo(30) };
  db.users.push(demo);

  L.forEach(([seller, category, title, description, price, originalPrice, condition, pics], i) => {
    db.listings.push({
      id: id('lst'), title, description, price, originalPrice, category, condition,
      quantity: 1, images: pics.map(img), sellerId: users[seller].id, location: users[seller].location,
      status: 'active', views: Math.floor(20 + Math.random() * 400), createdAt: daysAgo(i * 0.8), updatedAt: daysAgo(i * 0.8),
    });
  });

  const reviewTexts = ['Exactly as described, super well packed.', 'Fast shipping and lovely communication!', 'Great seller, would buy again.', 'Item was even better in person.'];
  for (const s of Object.values(users)) {
    for (let k = 0; k < 3; k++) {
      const author = Object.values(users).filter(u => u !== s)[k];
      db.reviews.push({ id: id('rev'), sellerId: s.id, authorId: author.id, rating: 5 - (k === 2 ? 1 : 0), text: reviewTexts[(k + s.name.length) % 4], createdAt: daysAgo(10 + k * 7) });
    }
  }

  const lamp = db.listings.find(l => l.title.includes('Floor Lamp'));
  const tid = `${lamp.id}__${demo.id}`;
  db.messages.push(
    { id: id('msg'), threadId: tid, listingId: lamp.id, from: demo.id, to: lamp.sellerId, text: 'Hi Maya! Is the lamp still available? Could you ship to Madrid?', read: true, createdAt: daysAgo(1.2) },
    { id: id('msg'), threadId: tid, listingId: lamp.id, from: lamp.sellerId, to: demo.id, text: 'Hi! Yes it is, and I ship all over Europe. It would arrive in 3–4 days 😊', read: false, createdAt: daysAgo(1.1) },
  );
  flush();
}

// Allow "node src/seed.js --reset"
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await seed();
  console.log('[backend] Database reset with demo data. Demo login: demo@agora.test / demo1234');
}
