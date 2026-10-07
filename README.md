# THOMAS911

Petite application web (PWA) pour les sorties et les nuits de Thomas.

- **Accueil** (`index.html`) : météo du jour, alertes pluie / neige / vent et prévisions sur 6 jours.
- **Checklist sortie** (`checklist.html`) : tout ce qu'il faut avant de partir en poussette.
- **Boîte à bruit** (`bruit.html`) : bruit blanc, rose, brun, chut-chut, cœur, sèche-cheveux… avec minuteur et decrescendo.
- **Bonnes habitudes** (`habitudes.html`) : exercices de bouche de Thomas et rééducation périnéenne d'Edith (matin, midi, soir), bain de Thomas. Cases partagées entre les téléphones, rappels à 9 h, 12 h 30 et 17 h 30.

En ligne : https://latullaye.github.io/checklist-bebe/ — sur téléphone, l'ajouter à l'écran d'accueil.

## Partage et rappels : mise en place (une seule fois)

1. **Supabase** (gratuit) : créer un projet sur https://supabase.com, ouvrir *SQL Editor*, coller `scripts/supabase.sql` et l'exécuter.
2. Dans *Project Settings → API*, copier l'URL du projet et la clé publique (*publishable* / *anon*) dans `config.js`.
3. **GitHub** : *Settings → Secrets and variables → Actions → New repository secret*, nom `VAPID_PRIVATE_KEY`, valeur : la clé privée qui va avec `VAPID_PUBLIC` de `config.js`.
4. Sur chaque téléphone : ouvrir *Bonnes habitudes* et autoriser les notifications. Sur iPhone, l'app doit d'abord être ajoutée à l'écran d'accueil.

Les rappels sont envoyés par `.github/workflows/rappels.yml` (onglet *Actions*, où on peut aussi en envoyer un tout de suite avec *Run workflow*). Un rappel n'est envoyé que s'il reste une case à cocher pour ce moment-là. GitHub peut le livrer avec quelques minutes de retard.
