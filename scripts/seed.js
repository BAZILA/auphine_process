'use strict';
// Crée deux comptes de démonstration liés, avec ~5 semaines d'historique.
//   npm run seed
// Comptes : alice@demo.local / bruno@demo.local — mot de passe : demo1234
const path = require('node:path');
const { createStore } = require('../server/db');
const L = require('../server/lib');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'auphine.db');
const PASSWORD = 'demo1234';

// Générateur pseudo-aléatoire déterministe (mêmes données à chaque exécution).
let seed = 7;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (list) => list[Math.floor(rand() * list.length)];

const PEOPLE = [
  {
    name: 'Alice',
    email: 'alice@demo.local',
    skills: {
      Sport: ['🏃', '#f0643f', ['30 min de course', '50 pompes dans la journée', '10 000 pas', 'Gainage 10 min']],
      Lecture: ['📚', '#5b4bdb', ['Lire 20 pages', 'Finir un chapitre', 'Noter 3 idées du livre']],
      Anglais: ['🗣️', '#1fa971', ['15 min de Duolingo', 'Un podcast en anglais', 'Écrire 5 phrases en anglais']],
      'Bien-être': ['🧘', '#e9a23b', ['10 min de méditation', 'Boire 1,5 L d\'eau', "Pas d'écran après 22 h"]],
    },
  },
  {
    name: 'Bruno',
    email: 'bruno@demo.local',
    skills: {
      Code: ['💻', '#5b4bdb', ['1 h sur le projet perso', 'Un exercice d\'algorithmie', 'Lire une doc technique']],
      Sport: ['💪', '#f0643f', ['Séance de musculation', '20 min de vélo', 'Étirements 10 min']],
      Sommeil: ['😴', '#7c8cff', ['Au lit avant 23 h', 'Pas de café après 16 h']],
      Cuisine: ['🍳', '#14b8a6', ['Un repas fait maison', 'Préparer les repas du lendemain']],
    },
  },
];

const NOTES = ['Plus dur que prévu mais fait !', 'Facile aujourd\'hui 😎', 'Fait en deux fois', 'Super motivé·e ce matin', ''];
const FEEDBACKS = ['Bravo, continue comme ça !', 'Fier de toi 👏', 'Belle régularité', 'Demain on vise plus haut 💪', ''];
const REVIEWS_SELF = [
  'Bonne semaine dans l\'ensemble, le sport a été plus régulier.',
  'Semaine chargée au travail, j\'ai lâché sur la fin. Objectif : mieux m\'organiser le soir.',
  'Je sens que les habitudes s\'installent, très content·e.',
];
const REVIEWS_PARTNER = [
  'Très belle constance, tu peux augmenter un peu la difficulté.',
  'Quelques jours ratés mais tu t\'es bien rattrapé·e, bravo.',
  'Impressionnant cette semaine, rien à redire !',
];

async function main() {
  const db = createStore(DB_FILE);
  const hash = await L.hashPassword(PASSWORD);
  const today = L.localToday();
  const thisMonday = L.mondayOf(today);
  const start = L.addDays(thisMonday, -28);
  const end = L.addDays(thisMonday, 6);
  let goalCount = 0;

  db.tx(() => {
    // Repart de zéro pour les comptes de démo (les suppressions sont en cascade).
    for (const p of PEOPLE) db.run('DELETE FROM users WHERE email = ?', p.email);

    const ids = PEOPLE.map((p) => db.run(
      'INSERT INTO users (name, email, password_hash, invite_code) VALUES (?, ?, ?, ?)',
      p.name, p.email, hash, L.newInviteCode(),
    ).lastInsertRowid);
    db.run('UPDATE users SET partner_id = ? WHERE id = ?', ids[1], ids[0]);
    db.run('UPDATE users SET partner_id = ? WHERE id = ?', ids[0], ids[1]);

    PEOPLE.forEach((p, i) => {
      const me = ids[i];
      const partner = ids[1 - i];
      const skills = Object.entries(p.skills).map(([name, [icon, color, titles]]) => ({
        id: db.run(
          'INSERT INTO skills (owner_id, created_by, name, icon, color) VALUES (?, ?, ?, ?, ?)',
          me, partner, name, icon, color,
        ).lastInsertRowid,
        titles,
      }));

      for (let d = start, n = 0; d <= end; d = L.addDays(d, 1), n++) {
        // La réussite progresse au fil des semaines : la courbe d'évolution a quelque chose à montrer.
        const success = 0.45 + 0.4 * (n / 35);
        const used = new Set();
        const count = 2 + Math.floor(rand() * 3);
        for (let k = 0; k < count; k++) {
          const skill = pick(skills);
          const title = pick(skill.titles);
          if (used.has(title)) continue;
          used.add(title);

          let status = 'todo';
          const roll = rand();
          if (d < today) status = roll < success ? 'done' : roll < success + 0.12 ? 'partial' : 'todo';
          else if (d === today) status = roll < 0.4 ? 'done' : 'todo';
          const finished = status !== 'todo';

          db.run(
            `INSERT INTO goals (assignee_id, author_id, skill_id, title, day, difficulty, status, note, feedback, reaction, done_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            me, partner, skill.id, title, d, 1 + Math.floor(rand() * 3), status,
            finished && rand() < 0.3 ? pick(NOTES) : '',
            finished && rand() < 0.3 ? pick(FEEDBACKS) : '',
            finished && rand() < 0.35 ? pick(['👏', '🔥', '💪', '🌟']) : '',
            finished ? `${d}T19:00:00.000Z` : null,
          );
          goalCount++;
        }
      }

      // Bilans écrits des semaines passées.
      for (let w = 1; w <= 4; w++) {
        const week = L.addDays(thisMonday, -7 * w);
        db.run('INSERT INTO reviews (user_id, author_id, week, rating, comment) VALUES (?, ?, ?, ?, ?)',
          me, me, week, 3 + Math.floor(rand() * 3), pick(REVIEWS_SELF));
        db.run('INSERT INTO reviews (user_id, author_id, week, rating, comment) VALUES (?, ?, ?, ?, ?)',
          me, partner, week, 3 + Math.floor(rand() * 3), pick(REVIEWS_PARTNER));
      }
    });
  });
  db.close();

  console.log(`✔ Données de démo créées (${goalCount} objectifs) dans ${DB_FILE}`);
  console.log(`  Connexion : alice@demo.local ou bruno@demo.local — mot de passe : ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
