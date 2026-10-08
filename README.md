# THOMAS911

Petite application web (PWA) familiale pour les sorties et les nuits de bébé.

- **Accueil** (`index.html`) : météo du jour, alertes pluie / neige / vent et prévisions sur 6 jours.
- **Météo** (`meteo.html`) : pluie par 15 min sur 4 h (si de la pluie arrive), heure par heure, 10 jours.
- **Checklist sortie** (`checklist.html`) : tout ce qu'il faut avant de partir en poussette.
- **Boîte à bruit** (`bruit.html`) : bruit blanc, rose, brun, chut-chut, cœur, sèche-cheveux… avec minuteur et decrescendo.
- **Bonnes habitudes** (`habitudes.html`) : petites routines quotidiennes à cocher (matin, midi, soir ou une fois par jour), avec rappels.
- **Comment l'habiller** (`habiller.html`) : tenue conseillée selon la température, à l'intérieur (éveil et dodo, avec gigoteuse adaptée) et à l'extérieur (d'après la météo).

En ligne : https://latullaye.github.io/checklist-bebe/ — sur téléphone, l'ajouter à l'écran d'accueil.

## Partage et rappels

La checklist, les habitudes et la température intérieure sont partagées entre les téléphones de la famille via un projet Supabase. `config.js` contient son URL et sa clé publique (publiques par nature).

- **Rappels** : `pg_cron` appelle toutes les demi-heures la fonction `rappels` (`supabase/functions/rappels/index.ts`). Chaque téléphone reçoit ses rappels à 9 h, 12 h 30 et 17 h 30 dans son propre fuseau horaire, seulement s'il reste quelque chose à cocher.
- **Clés de notification** : générées par la fonction elle-même. La clé privée reste dans une table que l'app ne peut pas lire.
- **Installation** : le SQL appliqué est dans `supabase/setup.sql`.
- **Sur chaque téléphone** : ouvrir *Bonnes habitudes* et autoriser les notifications. Sur iPhone, l'app doit d'abord être ajoutée à l'écran d'accueil.
