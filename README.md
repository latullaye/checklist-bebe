# THOMAS911

Petite application web (PWA) pour les sorties et les nuits de Thomas.

- **Accueil** (`index.html`) : météo du jour, alertes pluie / neige / vent et prévisions sur 6 jours.
- **Météo** (`meteo.html`) : pluie par 15 min sur 4 h (si de la pluie arrive), heure par heure, 10 jours.
- **Checklist sortie** (`checklist.html`) : tout ce qu'il faut avant de partir en poussette.
- **Boîte à bruit** (`bruit.html`) : bruit blanc, rose, brun, chut-chut, cœur, sèche-cheveux… avec minuteur et decrescendo.
- **Bonnes habitudes** (`habitudes.html`) : exercices de bouche de Thomas et rééducation périnéenne d'Edith (matin, midi, soir), vitamine D de Thomas (une fois par jour, dans le rappel du matin), bain de Thomas. Cases partagées entre les téléphones, rappels à 9 h, 12 h 30 et 17 h 30.

En ligne : https://latullaye.github.io/checklist-bebe/ — sur téléphone, l'ajouter à l'écran d'accueil.

## Partage et rappels

Les cases et les abonnements aux notifications sont dans le projet Supabase `checklist-bebe` (région Canada). `config.js` contient son URL et sa clé publique.

- **Rappels** : `pg_cron` appelle la fonction `rappels` (`supabase/functions/rappels/index.ts`) à 9 h, 12 h 30 et 17 h 30, heure de Montréal. Un rappel n'est envoyé que s'il reste une case à cocher pour ce moment-là.
- **Clés de notification** : la fonction les a générées elle-même. La clé privée reste dans la table `prive`, que l'app ne peut pas lire.
- **Installation** : le SQL appliqué est dans `supabase/setup.sql`.
- **Sur chaque téléphone** : ouvrir *Bonnes habitudes* et autoriser les notifications. Sur iPhone, l'app doit d'abord être ajoutée à l'écran d'accueil.
