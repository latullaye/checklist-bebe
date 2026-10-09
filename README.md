# THOMAS911

Petite application web (PWA) familiale pour les sorties et les nuits de bébé.

- **Accueil** (`index.html`) : la météo en une ligne (avec les alertes pluie / neige / vent), une carte « Thomas aujourd'hui » (âge et prochaine fête, dernier poids et gain par jour, habitudes du moment à cocher, bouton + Pesée), puis les écrans en grille : *Sortir*, *Au quotidien*, *Suivi*.
- **Météo** (`meteo.html`) : pluie par 15 min sur 4 h (si de la pluie arrive), heure par heure, 10 jours.
- **Checklist sortie** (`checklist.html`) : tout ce qu'il faut avant de partir en poussette.
- **Boîte à bruit** (`bruit.html`) : bruit blanc, rose, brun, chut-chut, cœur, sèche-cheveux… avec minuteur et decrescendo.
- **Bonnes habitudes** (`habitudes.html`) : petites routines quotidiennes à cocher (matin, midi, soir ou une fois par jour), avec rappels.
- **Comment habiller Thomas** (`habiller.html`) : tenue conseillée selon la température, à l'intérieur (éveil et dodo, avec gigoteuse adaptée) et à l'extérieur (d'après la météo).
- **Réglages** (`reglages.html`) : notifications du téléphone, température de la pièce, cible de lait, état du partage, version de l'app.
- **Santé** (`sante.html`) : le suivi des problèmes de santé, des rendez-vous et des médicaments, reliés entre eux.
  - *Problèmes* : on commence par noter ce qu'on voit (symptômes à cocher, nombre de selles ou de vomissements, température, couches mouillées, ce qu'on observe, ce qu'on fait) et depuis quand. Le problème se crée tout seul (« Diarrhée ») et prend son diagnostic au rendez-vous (« Gastro-entérite »). Jour par jour, et un résumé prêt à lire ou à envoyer au médecin.
  - *Rendez-vous* : passés ou à venir, avec le compte rendu, le diagnostic et la suite ; ceux de l'agenda Google « Family » qui ressemblent à de la santé sont proposés (« Pour Thomas » ou « Ignorer ») et suivent l'agenda s'ils sont déplacés ; un rendez-vous noté dans l'app s'ajoute à l'agenda en un geste.
  - *Médicaments* : dose et rythme tels que prescrits (toutes les N heures, à heures fixes ou au besoin), durée, prochaine prise, chaque prise avec qui l'a donnée ; l'app prévient si c'est trop tôt. Elle ne calcule aucune dose.
  - Rappels : chaque prise (avec « Donné » dans la notification sur Android), les rendez-vous la veille à 19 h et une heure avant, et à 20 h un rappel pour noter la journée tant qu'un problème dure.
- **L'âge de Thomas** (`age.html`) : son âge en jours, semaines, mois, mois et semaines, et toutes les occasions de faire la fête (100 jours, 4 mois, 10 millions de secondes…), avec animation le jour J et la liste des prochaines.
- **Croissance** (`croissance.html`) : poids (au gramme), taille et périmètre crânien sur les courbes de l'OMS 2006, avec percentiles, score-z et gain par 24 h calculé à l'heure de pesée près (comparé au gain habituel pour l'âge : standards OMS 2009 de vitesse de croissance, P15 à P85). Chaque mesure dit où elle a été prise (CLSC, médecin ou maison). Tendance du gain sur 3, 5, 7, 10, 14 et 30 jours (pente de la droite au plus près de toutes les pesées de la période, quel que soit leur rythme), avec un filtre par balance. Lait par jour conseillé selon son poids et un poids cible. Graphique en plein écran, portrait ou paysage, avec zoom au pincement sur l'axe du temps, et export en image (PNG, recadrée au contenu) de la tendance, des trois courbes et du tableau. Saisie possible hors ligne : la mesure part au retour du réseau. Les tables OMS (garçons) sont dans `who-boys.js`.

En ligne : https://latullaye.github.io/checklist-bebe/ — sur téléphone, l'ajouter à l'écran d'accueil.

## Partage et rappels

La checklist, les habitudes, la température intérieure, les mesures de croissance et la santé sont partagées entre les téléphones de la famille via un projet Supabase. `config.js` contient son URL et sa clé publique (publiques par nature).

- **Code de la famille** : les données ne s'ouvrent qu'avec lui. On le tape une fois sur chaque téléphone, avec qui l'utilise (Arthur ou Edith) ; l'app l'envoie à chaque appel (`famille.js`) et la base ne garde que son empreinte. Pour le changer : nouvelle empreinte dans la table `prive` (clé `famille_sha256`), puis le nouveau code sur chaque téléphone (Réglages).

- **Rappels santé et agenda** : `pg_cron` appelle toutes les 5 minutes la fonction `sante` (`supabase/functions/sante/`) : prises, rendez-vous, note du soir ; une fois par heure, elle lit l'agenda « Family » (adresse iCal secrète gardée dans la table `prive`).
- **Rappels** : `pg_cron` appelle toutes les demi-heures la fonction `rappels` (`supabase/functions/rappels/index.ts`). Chaque téléphone reçoit ses rappels à 9 h, 12 h 30 et 17 h 30 dans son propre fuseau horaire, seulement s'il reste quelque chose à cocher. Celui de 17 h 30 annonce aussi le soir du bain (tous les 2 à 3 jours, à partir du 2e jour après le dernier).
- **Sur l'icône de l'app** : sur iPhone, une pastille rouge donne le nombre de choses qu'il reste à faire pour le moment (le « À faire » de l'accueil). Le rappel la met et chaque case cochée la fait baisser. Android n'affiche pas de chiffre pour une app web : il met un point tant que le rappel est dans les notifications, et le rappel disparaît dès que tout ce qu'il annonçait est coché. Sur iPhone, le titre du rappel commence par ☀️, 🌞, 🌙 ou 🛁, parce que l'image n'y est pas affichée.
- **Clés de notification** : générées par la fonction elle-même. La clé privée reste dans une table que l'app ne peut pas lire.
- **Installation** : le SQL appliqué est dans `supabase/setup.sql`.
- **Sur chaque téléphone** : ouvrir *Réglages* (roue dentée de l'accueil) et autoriser les notifications. Sur iPhone, l'app doit d'abord être ajoutée à l'écran d'accueil.

## Organisation du code

- `common.css` : styles communs (deux polices : Ubuntu pour les titres et les chiffres, Atkinson Hyperlegible pour le texte), transitions entre écrans.
- `app.js` : hors ligne et mises à jour (service worker `sw.js`), flèche retour, retour haptique (`data-buzz`).
- `sync.js` : pastille « À jour / Hors ligne / en attente » en haut des écrans partagés.
- `famille.js` : code de la famille et prénom du téléphone, ajoutés à chaque appel à la base.
- `prefs.js` : réglages partagés (table `reglages`) ; `habits.js` + `notifs.js` : habitudes et rappels ; `growth.js` : mesures, percentiles OMS et file d'attente hors ligne ; `sante.js` : problèmes, notes, rendez-vous, médicaments et prises (avec leur file d'attente hors ligne), prochaines prises et résumé pour le médecin.
- `splash/` : écrans de lancement iPhone (pris en compte quand l'app est ajoutée à l'écran d'accueil).
