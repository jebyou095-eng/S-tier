// La carte du restaurant. Modifiez ici les plats et les prix (en dirhams).
// ⚠ Carte indicative préparée pour la démo : à vérifier avec le restaurant avant la mise en ligne.
export const MENU = [
  {
    id: 'entrees', title: 'Entrées', subtitle: 'Pour commencer',
    items: [
      { name: 'Harira', desc: 'Soupe traditionnelle aux lentilles, pois chiches, tomates et coriandre, servie avec dattes et chebakia.', price: 40, tags: ['végétarien'] },
      { name: 'Salades marocaines', desc: 'Assortiment de zaalouk, taktouka, carottes au cumin et betteraves à la fleur d’oranger.', price: 60, tags: ['végétarien', 'à partager'] },
      { name: 'Briouates', desc: 'Feuilles croustillantes farcies à la viande hachée, au poulet ou au fromage.', price: 65, tags: [] },
      { name: 'Pastilla au poulet', desc: 'Feuilleté sucré-salé au poulet, amandes et cannelle.', price: 120, tags: ['signature'] },
    ],
  },
  {
    id: 'tajines', title: 'Tajines', subtitle: 'Mijotés lentement',
    items: [
      { name: 'Tajine de poulet au citron confit', desc: 'Poulet fermier, olives violettes, citron confit et safran.', price: 110, tags: ['signature'] },
      { name: 'Tajine d’agneau aux pruneaux', desc: 'Épaule d’agneau fondante, pruneaux caramélisés, amandes grillées et sésame.', price: 145, tags: [] },
      { name: 'Tajine de kefta aux œufs', desc: 'Boulettes de bœuf épicées dans une sauce tomate, œufs cuits au four.', price: 95, tags: [] },
      { name: 'Tajine de poisson à la chermoula', desc: 'Poisson du jour, pommes de terre, poivrons et marinade chermoula.', price: 135, tags: [] },
    ],
  },
  {
    id: 'couscous', title: 'Couscous & grillades', subtitle: 'Les grands classiques',
    items: [
      { name: 'Couscous royal', desc: 'Semoule fine, sept légumes, agneau, poulet et merguez.', price: 150, tags: ['à partager'] },
      { name: 'Couscous tfaya', desc: 'Agneau, oignons caramélisés aux raisins secs et à la cannelle.', price: 140, tags: ['signature'] },
      { name: 'Couscous aux sept légumes', desc: 'Légumes de saison et bouillon parfumé.', price: 95, tags: ['végétarien'] },
      { name: 'Brochettes mixtes', desc: 'Bœuf, poulet et kefta grillés au feu de bois, frites maison et salade.', price: 120, tags: [] },
      { name: 'Méchoui', desc: 'Épaule d’agneau rôtie lentement, cumin et sel. Sur commande 24 h à l’avance.', price: 290, tags: ['sur commande'] },
    ],
  },
  {
    id: 'desserts', title: 'Douceurs', subtitle: 'Pour finir',
    items: [
      { name: 'Pastilla au lait', desc: 'Feuilles croustillantes, crème à la fleur d’oranger et amandes.', price: 60, tags: ['signature'] },
      { name: 'Assiette de pâtisseries', desc: 'Cornes de gazelle, ghriba et chebakia.', price: 50, tags: [] },
      { name: 'Oranges à la cannelle', desc: 'Oranges fraîches, cannelle et eau de fleur d’oranger.', price: 40, tags: ['végétarien'] },
    ],
  },
  {
    id: 'boissons', title: 'Thé & boissons', subtitle: 'Le rituel',
    items: [
      { name: 'Thé à la menthe', desc: 'Servi à la théière, versé de haut comme le veut la tradition.', price: 25, tags: ['signature'] },
      { name: 'Jus d’orange pressé', desc: 'Oranges fraîches pressées minute.', price: 30, tags: [] },
      { name: 'Jus d’avocat aux fruits secs', desc: 'Avocat, lait, dattes et amandes.', price: 45, tags: [] },
      { name: 'Cocktails de la maison', desc: 'Créations du bar, avec ou sans alcool. Demandez la carte du moment.', price: 90, tags: [] },
    ],
  },
];
