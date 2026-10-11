# Auphine — objectifs à deux

Une appli légère pour **binômes** : chaque jour, tu fixes des objectifs à ton binôme et il ou elle t'en fixe. Chacun coche ce qu'il a fait, l'autre réagit et encourage, et **chaque semaine** vous avez un bilan complet : taux de réussite, jour par jour, compétences travaillées, évolution, et un bilan écrit.

- 📱 **Mobile d'abord** : PWA installable sur l'écran d'accueil (Android et iPhone), navigation par onglets en bas.
- 💻 **Web aussi** : sur grand écran, la navigation passe dans une barre latérale.
- 🪶 **Zéro dépendance** : Node.js et SQLite intégré, HTML/CSS/JS sans framework ni étape de build.

## Démarrer

Prérequis : **Node.js 22.13 ou plus récent** (SQLite est intégré à Node).

```bash
npm run seed   # facultatif : crée 2 comptes de démo avec 5 semaines d'historique
npm start      # lance le serveur sur http://localhost:3210
```

Comptes de démo : `alice@demo.local` et `bruno@demo.local`, mot de passe `demo1234`.

Pendant le développement, `npm run dev` relance le serveur à chaque modification.

### Tester sur ton téléphone

Au démarrage, le serveur affiche aussi une adresse du réseau local (ex. `http://192.168.1.20:3210`). Ouvre-la depuis ton téléphone connecté au même Wi-Fi. Pour l'**installation en appli** et le mode hors ligne, il faut du HTTPS : en ligne (voir *Déployer*) ou via un tunnel comme `cloudflared` ou `ngrok`.

### Variables d'environnement

| Variable  | Défaut              | Rôle                         |
|-----------|---------------------|------------------------------|
| `PORT`    | `3210`              | Port HTTP                    |
| `HOST`    | `0.0.0.0`           | Interface d'écoute           |
| `DB_FILE` | `data/auphine.db`   | Fichier de la base SQLite    |
| `TRUST_PROXY` | (vide)          | `1` derrière un proxy (Caddy, Nginx) pour lire la vraie IP du client |

## Fonctionnalités

| Écran | Ce qu'on y fait |
|---|---|
| **Aujourd'hui** | Mes objectifs du jour (fixés par mon binôme), je coche d'un geste ou j'indique « partiel » avec un commentaire. Anneau de progression, sélecteur de jour sur la semaine. |
| **Binôme** | Je fixe les objectifs de mon binôme : suggestions rapides, compétence liée, difficulté (10/20/30 XP), répétition sur certains jours pendant 1, 2 ou 4 semaines. Je réagis (👏 🔥 💪 ❤️ 😅 🌟) et j'écris un retour. |
| **Bilan** | Le rendu hebdomadaire, pour moi ou mon binôme : taux de réussite et écart avec la semaine précédente, XP gagnés, série de journées parfaites, graphique jour par jour, compétences travaillées, évolution sur 8 semaines, réussites et objectifs à retravailler. Bilan écrit (auto-évaluation et retour du binôme avec une note sur 5). Partage du bilan en un clic. |
| **Compétences** | Niveau global et niveau par compétence : chaque objectif réussi fait gagner de l'XP à sa compétence (niveaux à 100, 300, 600, 1000 XP…). |
| **Profil** | Liaison avec le binôme par code à 6 caractères, prénom, thème clair/sombre/auto, installation de l'appli. |

**Règles de calcul**
- Un objectif d'un jour passé qui n'est pas coché compte comme **manqué**. Le taux de réussite ne compte que les objectifs échus : les objectifs du jour pas encore faits ne le font pas baisser.
- Partiel = moitié des XP et moitié dans le taux de réussite.
- **Série** : nombre de jours consécutifs où tous les objectifs sont faits. Les jours sans objectif ne cassent pas la série.

## Structure

```
server/
  index.js     serveur HTTP : fichiers statiques et en-têtes de sécurité
  api.js       routes de l'API JSON, validation, calcul du bilan hebdo
  db.js        schéma SQLite et accès aux données
  lib.js       dates, XP et niveaux, mots de passe (scrypt), jetons
public/
  index.html   point d'entrée de la PWA
  css/app.css  styles (mobile d'abord, thème sombre)
  js/app.js    navigation et rendu des vues
  js/views/    un fichier par écran
  sw.js        service worker (cache de l'interface)
scripts/
  seed.js      données de démo
  gen-icons.js génère les icônes PNG sans dépendance
```

## API

Toutes les routes sont sous `/api` et échangent du JSON. Une fois connecté, ajoute l'en-tête `Authorization: Bearer <jeton>`. Le paramètre `who` vaut `me` (par défaut) ou `partner`.

| Méthode | Route | Description |
|---|---|---|
| POST | `/register` · `/login` · `/logout` | Compte et session |
| GET / PATCH | `/me` | Profil (+ binôme) / changer de prénom |
| POST | `/me/invite-code` | Générer un nouveau code de liaison |
| POST / DELETE | `/pair` | Se lier avec `{ code }` / se délier |
| GET | `/goals?who=&from=&to=` | Objectifs sur une période (62 jours max) |
| POST | `/goals` | Fixer un objectif au binôme : `{ title, details, skillId, difficulty, days: [...] }` |
| PATCH | `/goals/:id` | Celui qui réalise : `status`, `note`. L'auteur : contenu, `feedback`, `reaction` |
| DELETE | `/goals/:id[?scope=series]` | L'auteur supprime (et éventuellement les répétitions à venir) |
| GET / POST | `/skills` | Compétences avec XP et niveaux / en créer une |
| DELETE | `/skills/:id` | Supprimer une compétence |
| GET | `/report?who=&week=&today=` | Bilan hebdomadaire complet |
| PUT | `/reviews` | Bilan écrit `{ who, week, rating, comment }` |

## Déployer

**Sur un VPS** : guide pas à pas dans [DEPLOY.md](DEPLOY.md) (Node.js, systemd, HTTPS automatique avec Caddy, sauvegardes). Les fichiers prêts à copier sont dans `deploy/`.

Autre option : n'importe quel hébergeur qui fait tourner Node.js avec un **disque persistant** pour `data/` (Railway, Render, Fly.io, un petit VPS…). Commande de démarrage : `npm start`. Mets un HTTPS devant (fourni par ces hébergeurs, ou Caddy/Nginx sur un VPS) et sauvegarde régulièrement le fichier `data/auphine.db`.

## Feuille de route : idées d'amélioration

**Engagement**
- 🔔 Notifications push (Web Push) : « Ton binôme t'a fixé 3 objectifs », rappel le soir s'il reste des objectifs, bilan prêt le dimanche.
- 🏅 Badges et succès : 7 jours parfaits, 100 objectifs, première compétence niveau 5…
- 📸 Preuve en photo sur un objectif (une photo de la séance de sport, du livre…).
- 💬 Mini-fil de discussion par jour ou par objectif.

**Organisation**
- 📋 Modèles d'objectifs et programmes types (« Remise en forme 4 semaines », « Lecture quotidienne »).
- 🎯 Objectifs hebdomadaires ou chiffrés (« 3 séances cette semaine », « 50 km de vélo ») en plus des objectifs quotidiens.
- 🙋 Objectifs personnels en plus de ceux fixés par le binôme.
- ✋ Contre-proposition : la personne peut demander d'ajuster un objectif jugé trop dur.

**Suivi**
- 📄 Export du bilan hebdo en PDF ou en image à partager.
- 📆 Vue mensuelle façon « heatmap » (calendrier de régularité).
- 🤖 Résumé hebdo rédigé automatiquement et suggestions d'objectifs adaptés à la progression.

**Plateforme**
- 👥 Groupes (plus de 2 personnes) ou plusieurs binômes : coach + élèves, équipe, famille.
- 📲 Publication sur les stores via Capacitor (même code) si besoin d'une vraie appli native.
- 🔐 Mot de passe oublié par e-mail, connexion Google/Apple.
- 🌍 Fuseaux horaires différents entre binômes, multilingue.
