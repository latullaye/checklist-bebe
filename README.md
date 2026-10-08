# THOMAS911

Petite application web (PWA) familiale pour les sorties et les nuits de bébé.

- **Accueil** (`index.html`) : la météo en une ligne (avec les alertes pluie / neige / vent), une carte « Thomas aujourd'hui » (âge et prochaine fête, dernier poids et gain par jour, habitudes du moment à cocher, bouton + Pesée), puis les écrans en grille : *Sortir*, *Au quotidien*, *Suivi*.
- **Météo** (`meteo.html`) : pluie par 15 min sur 4 h (si de la pluie arrive), heure par heure, 10 jours.
- **Checklist sortie** (`checklist.html`) : tout ce qu'il faut avant de partir en poussette.
- **Boîte à bruit** (`bruit.html`) : bruit blanc, rose, brun, chut-chut, cœur, sèche-cheveux… avec minuteur et decrescendo.
- **Bonnes habitudes** (`habitudes.html`) : petites routines quotidiennes à cocher (matin, midi, soir ou une fois par jour), avec rappels.
- **Comment habiller Thomas** (`habiller.html`) : tenue conseillée selon la température, à l'intérieur (éveil et dodo, avec gigoteuse adaptée) et à l'extérieur (d'après la météo).
- **Réglages** (`reglages.html`) : notifications du téléphone, température de la pièce, cible de lait, état du partage, version de l'app.
- **L'âge de Thomas** (`age.html`) : son âge en jours, semaines, mois, mois et semaines, et toutes les occasions de faire la fête (100 jours, 4 mois, 10 millions de secondes…), avec animation le jour J et la liste des prochaines.
- **Croissance** (`croissance.html`) : poids (au gramme), taille et périmètre crânien sur les courbes de l'OMS 2006, avec percentiles, score-z et gain par jour calculé à l'heure de pesée près, plus le lait par jour conseillé selon son poids et un poids cible. Graphique en plein écran, portrait ou paysage, avec zoom au pincement sur l'axe du temps, et export en image (PNG) des trois courbes et du tableau. Saisie possible hors ligne : la mesure part au retour du réseau. Les tables OMS (garçons) sont dans `who-boys.js`.

En ligne : https://latullaye.github.io/checklist-bebe/ — sur téléphone, l'ajouter à l'écran d'accueil.

## Partage et rappels

La checklist, les habitudes, la température intérieure et les mesures de croissance sont partagées entre les téléphones de la famille via un projet Supabase. `config.js` contient son URL et sa clé publique (publiques par nature).

- **Rappels** : `pg_cron` appelle toutes les demi-heures la fonction `rappels` (`supabase/functions/rappels/index.ts`). Chaque téléphone reçoit ses rappels à 9 h, 12 h 30 et 17 h 30 dans son propre fuseau horaire, seulement s'il reste quelque chose à cocher.
- **Clés de notification** : générées par la fonction elle-même. La clé privée reste dans une table que l'app ne peut pas lire.
- **Installation** : le SQL appliqué est dans `supabase/setup.sql`.
- **Sur chaque téléphone** : ouvrir *Réglages* (roue dentée de l'accueil) et autoriser les notifications. Sur iPhone, l'app doit d'abord être ajoutée à l'écran d'accueil.

## Organisation du code

- `common.css` : styles communs (deux polices : Bricolage Grotesque pour les titres, Atkinson Hyperlegible pour le texte), transitions entre écrans.
- `app.js` : hors ligne et mises à jour (service worker `sw.js`), flèche retour, retour haptique (`data-buzz`).
- `sync.js` : pastille « À jour / Hors ligne / en attente » en haut des écrans partagés.
- `prefs.js` : réglages partagés (table `reglages`) ; `habits.js` + `notifs.js` : habitudes et rappels ; `growth.js` : mesures, percentiles OMS et file d'attente hors ligne.
- `splash/` : écrans de lancement iPhone (pris en compte quand l'app est ajoutée à l'écran d'accueil).
