// ============================================================
//  Toutes les infos du restaurant au même endroit.
//  Modifiez ce fichier pour changer le téléphone, l'adresse, les photos…
// ============================================================

export const API_URL = `${location.protocol}//${location.hostname || 'localhost'}:4100`;

const U = (id, w = 1600) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

export const RESTAURANT = {
  name: 'Dar Naji',
  nameAr: 'دار ناجي',
  city: 'Rabat',
  cuisine: 'Cuisine marocaine',
  rating: 4.2,            // Note Google (capture du 15/11/2026)
  reviews: 6600,          // Nombre d'avis Google
  priceRange: '50 – 300 MAD',
  // ⚠ À COMPLÉTER : numéro et adresse exacts du restaurant.
  phone: '',              // ex. '+212 5 37 00 00 00'  (vide = le bouton "Appeler" ouvre la fiche Google)
  address: 'Rabat, Maroc',
  mapsQuery: 'Dar Naji Rabat',
  instagram: '',          // ex. 'https://instagram.com/…'
  // Horaires affichés (seule la fermeture à 23:00 est confirmée).
  hours: [
    ['Lundi – Dimanche', '12:00 – 23:00'],
  ],
  open: '12:00',
  close: '23:00',
};

// Photos : remplacez par les vraies photos du restaurant (mettez-les dans frontend/images/ puis écrivez 'images/mon-fichier.jpg').
export const PHOTOS = {
  hero: [U('1517248135467-4c7edcad34c4'), U('1541518763669-27fef04b14ea'), U('1414235077428-338989a2e8c0')],
  about: [U('1559339352-11d035aa65de', 1000), U('1541518763669-27fef04b14ea', 800)],
  tea: U('1576092768241-dec231879fc3', 1200),
  signature: [
    { title: 'Tajine de poulet au citron confit', text: 'Olives violettes, safran et citron confit maison.', img: U('1541518763669-27fef04b14ea', 900) },
    { title: 'Brochettes au feu de bois', text: 'Bœuf, poulet et kefta, marinés aux épices du souk.', img: U('1555939594-58d7cb561ad1', 900) },
    { title: 'Cocktails de la maison', text: 'Des créations du bar, avec ou sans alcool, sur la terrasse.', img: U('1551024709-8f23befc6f87', 900) },
  ],
  gallery: [
    { img: U('1559339352-11d035aa65de', 1000), alt: 'La salle' },
    { img: U('1504674900247-0877df9cc836', 1000), alt: 'Assiette du chef' },
    { img: U('1514933651103-005eec06c04b', 1000), alt: 'Le bar' },
    { img: U('1540189549336-e6e99c3679fe', 1000), alt: 'Salades marocaines' },
    { img: U('1414235077428-338989a2e8c0', 1000), alt: 'Table dressée' },
    { img: U('1600891964092-4316c288032e', 1000), alt: 'Grillades' },
  ],
};
