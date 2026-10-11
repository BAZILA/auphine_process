# Auphine — objectifs à deux

Une appli légère pour **binômes** : chaque jour, tu fixes des objectifs à ton binôme et il ou elle t'en fixe. Chacun coche ce qu'il a fait, ajoute une preuve photo, l'autre réagit et encourage, et **chaque semaine** vous avez un bilan complet : taux de réussite, jour par jour, compétences travaillées, évolution, badges et bilan écrit.

- **Mobile d'abord** : PWA installable sur l'écran d'accueil (Android et iPhone), navigation par onglets en bas, notifications push.
- **Web aussi** : sur grand écran, la navigation passe dans une barre latérale.
- **Zéro dépendance** : Node.js et SQLite intégré, HTML/CSS/JS sans framework ni étape de build. Icônes dessinées en SVG, aucun emoji.

En ligne : https://auphine.lbcorporation.dev

## Démarrer

Prérequis : **Node.js 22.13 ou plus récent** (SQLite est intégré à Node).

```bash
npm run seed   # facultatif : crée 2 comptes de démo avec 5 semaines d'historique
npm start      # lance le serveur sur http://localhost:3210
```

Comptes de démo : `alice@demo.local` et `bruno@demo.local`, mot de passe `demo1234`.

Pendant le développement, `npm run dev` relance le serveur à chaque modification. `npm run backup` sauvegarde la base et les photos.

### Tester sur ton téléphone

Au démarrage, le serveur affiche aussi une adresse du réseau local (ex. `http://192.168.1.20:3210`). Ouvre-la depuis ton téléphone connecté au même Wi-Fi. Pour l'**installation en appli**, les **notifications** et le mode hors ligne, il faut du HTTPS : en ligne (voir *Déployer*) ou via un tunnel comme `cloudflared` ou `ngrok`.

### Variables d'environnement

| Variable  | Défaut              | Rôle                         |
|-----------|---------------------|------------------------------|
| `PORT`    | `3210`              | Port HTTP                    |
| `HOST`    | `0.0.0.0`           | Interface d'écoute (`127.0.0.1` derrière un proxy) |
| `DB_FILE` | `data/auphine.db`   | Base SQLite (les photos vont dans `uploads/` à côté) |
| `TRUST_PROXY` | (vide)          | `1` derrière un proxy (Apache, Caddy, Nginx) pour lire la vraie IP du client |
| `VAPID_SUBJECT` | URL du dépôt | Contact transmis aux services de notification |
| `BACKUP_DIR` | `~/backups/auphine` | Destination de `npm run backup` |

## Fonctionnalités

| Écran | Ce qu'on y fait |
|---|---|
| **Aujourd'hui** | Mes objectifs du jour et de la semaine : ceux fixés par mon binôme et mes objectifs **perso**. Je coche d'un geste, j'indique « partiel », ou je fais avancer un **objectif chiffré** (« 6 / 10 km »). |
| **Binôme** | Je fixe ses objectifs : suggestions rapides, compétence liée, difficulté (10/20/30 XP), objectif **du jour** ou **de la semaine**, chiffré ou non, répétition sur 1, 2 ou 4 semaines. Je vois aussi ses objectifs perso. |
| **Fiche objectif** | Progression, **preuve photo** (réduite automatiquement avant l'envoi), **réactions** (Bravo, En feu, Costaud, J'adore, Courage, Au top) et **discussion** entre binômes. |
| **Bilan** | Le rendu hebdomadaire, pour moi ou mon binôme : taux de réussite et écart avec la semaine précédente, XP, série de journées parfaites, jour par jour, objectifs de la semaine, compétences, évolution sur 8 semaines, réussites et points à retravailler. Bilan écrit noté sur 5. Partage en un clic. |
| **Progrès** | Niveau global, **compétences** (niveaux à 100, 300, 600, 1000 XP…), **badges** (15 succès à débloquer) et **calendrier** mensuel de régularité. |
| **Profil** | Liaison par code à 6 caractères, **notifications** (activation par appareil et choix des alertes), prénom, thème clair/sombre/auto, installation de l'appli. |

**Notifications** : nouvel objectif fixé, réaction, message, preuve photo, journée bouclée par ton binôme, nouveau badge, rappel à 20 h s'il reste des objectifs, bilan le dimanche à 18 h (à l'heure locale de chacun).

**Règles de calcul**
- Un objectif échu non coché compte comme **manqué** (le jour même pour un objectif du jour, le dimanche pour un objectif de la semaine). Le taux de réussite ne compte que les objectifs échus.
- Partiel = moitié des XP et moitié dans le taux de réussite. Un objectif chiffré est « partiel » dès qu'il a commencé, « fait » une fois la quantité atteinte.
- **Série** : jours consécutifs où tous les objectifs du jour sont faits. Les jours sans objectif ne cassent pas la série.

## Structure

```
server/
  index.js     serveur HTTP : fichiers statiques et en-têtes de sécurité
  api.js       routes de l'API JSON, validation, bilan hebdo, rappels programmés
  db.js        schéma SQLite et migrations automatiques
  push.js      notifications Web Push (chiffrement RFC 8291 + VAPID), sans dépendance
  badges.js    définition et calcul des badges
  lib.js       dates, XP et niveaux, mots de passe (scrypt), jetons
public/
  index.html   point d'entrée de la PWA
  css/app.css  styles (mobile d'abord, thème sombre)
  js/app.js    navigation et rendu des vues
  js/ui.js     icônes SVG, feuilles modales, toasts
  js/push.js   abonnement de l'appareil aux notifications
  js/views/    un fichier par écran (+ fiche et formulaire d'objectif)
  sw.js        service worker (cache, réception des notifications)
scripts/
  seed.js      données de démo
  backup.js    sauvegarde de la base et des photos
  gen-icons.js génère les icônes PNG sans dépendance
deploy/        fichiers d'exemple pour un VPS avec droits admin
```

## API

Toutes les routes sont sous `/api` et échangent du JSON. Une fois connecté, ajoute l'en-tête `Authorization: Bearer <jeton>`. Le paramètre `who` vaut `me` (par défaut) ou `partner`. Les en-têtes facultatifs `X-Local-Day` et `X-Timezone` donnent le jour et le fuseau du client.

| Méthode | Route | Description |
|---|---|---|
| POST | `/register` · `/login` · `/logout` | Compte et session |
| GET / PATCH | `/me` | Profil (+ binôme) / prénom, préférences de notification |
| POST | `/me/invite-code` | Générer un nouveau code de liaison |
| POST / DELETE | `/pair` | Se lier avec `{ code }` / se délier |
| GET | `/goals?who=&from=&to=` | Objectifs sur une période (62 jours max) |
| POST | `/goals` | `{ who, title, details, skillId, difficulty, period, target, unit, days: [...] }` |
| PATCH | `/goals/:id` | Réalisateur : `status` ou `progress`. Auteur : contenu. Binôme : `reaction` |
| DELETE | `/goals/:id[?scope=series]` | L'auteur supprime (et éventuellement les répétitions à venir) |
| PUT / DELETE | `/goals/:id/photo` | Preuve photo (JPEG, PNG ou WebP, 4 Mo max) |
| GET | `/photos/:nom` | Photo (réservée au réalisateur et à son binôme) |
| GET / POST | `/goals/:id/messages` | Discussion sur un objectif |
| GET / POST | `/skills` | Compétences avec XP et niveaux / en créer une |
| DELETE | `/skills/:id` | Supprimer une compétence |
| GET | `/badges?who=` | Badges et progression vers chacun |
| GET | `/calendar?who=&month=AAAA-MM` | Régularité jour par jour sur un mois |
| GET | `/report?who=&week=` | Bilan hebdomadaire complet |
| PUT | `/reviews` | Bilan écrit `{ who, week, rating, comment }` |
| GET | `/push/key` | Clé publique VAPID |
| POST | `/push/subscribe` · `/push/unsubscribe` · `/push/test` | Abonnement de l'appareil |

## Déployer

Guide pas à pas dans [DEPLOY.md](DEPLOY.md) : serveur avec panneau sans droits admin (nvm, pm2, Apache), ou VPS avec droits admin (systemd, Caddy), sauvegardes et mises à jour.

Mise à jour du serveur en ligne : `cd ~/apps/auphine && git pull && pm2 restart auphine` (la base est migrée automatiquement).

## Feuille de route : idées d'amélioration

**Organisation**
- Modèles d'objectifs et programmes types (« Remise en forme 4 semaines », « Lecture quotidienne »).
- Contre-proposition : la personne peut demander d'ajuster un objectif jugé trop dur.
- Messages non lus signalés dans la liste des objectifs.

**Suivi**
- Export du bilan hebdo en PDF ou en image à partager.
- Résumé hebdo rédigé automatiquement et suggestions d'objectifs adaptés à la progression.

**Plateforme**
- Groupes (plus de 2 personnes) ou plusieurs binômes : coach + élèves, équipe, famille.
- Publication sur les stores via Capacitor (même code) si besoin d'une vraie appli native.
- Mot de passe oublié par e-mail, connexion Google/Apple.
- Multilingue.
