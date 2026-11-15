# Dar Naji · site du restaurant (démo)

Site vitrine avec réservation en ligne pour **Dar Naji**, restaurant de cuisine marocaine à Rabat.

```
dar-naji/
├── frontend/              ← le site (HTML/CSS/JS, sans build)
│   ├── index.html             page d'accueil (une seule page)
│   ├── admin.html             espace gérant : réservations et messages
│   ├── css/styles.css         design et animations
│   ├── js/config.js           ⭐ TÉLÉPHONE, ADRESSE, HORAIRES, PHOTOS : à modifier ici
│   ├── js/main.js             fonctionnement du site
│   └── images/                mettez ici les vraies photos
├── backend/               ← le serveur (Node.js + Express)
│   ├── src/menu.js            ⭐ LA CARTE (plats et prix) : à modifier ici
│   ├── src/server.js          API : carte, réservations, contact, espace gérant
│   ├── src/smoke-test.js      tests (npm test)
│   └── data/                  réservations enregistrées (créé au 1er lancement)
├── start-windows.bat      ← double-clic pour lancer sur Windows
└── start-mac-linux.sh
```

## Lancer

Il faut [Node.js](https://nodejs.org). Sous Windows : **double-cliquez sur `start-windows.bat`**. Sinon :

```bash
npm run install:all
npm run dev
```

- Site : http://localhost:5180
- Espace gérant : http://localhost:5180/admin.html. Le mot de passe s'affiche dans la fenêtre au démarrage (il est aussi dans `backend/data/admin-password.txt`). Pour choisir le vôtre, créez `backend/.env` avec `ADMIN_PASSWORD=votre-mot-de-passe`.

## Ce que fait le site

- Accueil plein écran avec diaporama, nom en arabe et en français, note Google, badge « Ouvert / Fermé » en direct
- La maison : terrasse, salon privé, cocktails
- Plats signatures, carte complète par onglets (entrées, tajines, couscous et grillades, desserts, thé et boissons)
- Le rituel du thé à la menthe (avec animation du thé versé)
- Galerie avec agrandissement des photos
- **Réservation en 2 étapes** : personnes, date, heure (créneaux de 30 min jusqu'à 22h30), espace (salle, terrasse ou salon privé), coordonnées ; un code de réservation est donné au client
- Carte Google Maps, boutons Itinéraire et Appeler, formulaire de contact pour les événements privés
- Barre d'actions fixe sur mobile (Appeler, Itinéraire, Réserver)
- **Espace gérant** : réservations du jour, couverts, à confirmer ; boutons Confirmer, Venue et Annuler ; messages reçus

## À compléter avant la mise en ligne

1. **Téléphone et adresse exacte** dans `frontend/js/config.js` (vides pour l'instant : le bouton Appeler ouvre la fiche Google).
2. **Horaires d'ouverture** : seule la fermeture à 23:00 est confirmée. L'ouverture à 12:00 est une hypothèse (`config.js` et `HOURS` dans `backend/src/server.js`).
3. **La carte et les prix** dans `backend/src/menu.js`. C'est une carte type, dans la fourchette 50–300 MAD de Google, à remplacer par la vraie.
4. **Les photos** : ce sont des photos libres Unsplash en attendant. Utilisez les vraies photos du restaurant (avec leur accord), dans `frontend/images/`.

## En cas de problème

| Ce que vous voyez | Où regarder |
|---|---|
| Bandeau rouge « Le site n'arrive pas à joindre le serveur » | Le backend n'est pas lancé (fenêtre fermée ?) |
| Message d'erreur dans le formulaire | Ligne `[backend] erreur` dans la fenêtre du serveur |
| Ligne `[frontend]` dans la console du navigateur (F12) | Problème dans `frontend/js/` |
| Une photo remplacée par un motif vert | Lien de photo cassé (`[frontend] Photo introuvable` dans la console) |
