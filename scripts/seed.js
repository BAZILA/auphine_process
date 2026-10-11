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
      Sport: ['activity', '#f0643f', ['30 min de course', '50 pompes dans la journée', '10 000 pas', 'Gainage 10 min']],
      Lecture: ['book', '#5b4bdb', ['Lire 20 pages', 'Finir un chapitre', 'Noter 3 idées du livre']],
      Anglais: ['globe', '#17a067', ['15 min de Duolingo', 'Un podcast en anglais', 'Écrire 5 phrases en anglais']],
      'Bien-être': ['leaf', '#d48a1c', ['10 min de méditation', "Boire 1,5 L d'eau", "Pas d'écran après 22 h"]],
    },
    weekly: [['Sport', '3 séances de sport', 3, 'séances'], ['Lecture', 'Lire 100 pages', 100, 'pages']],
    perso: ['Ranger mon bureau', 'Appeler mamie'],
  },
  {
    name: 'Bruno',
    email: 'bruno@demo.local',
    skills: {
      Code: ['code', '#5b4bdb', ['1 h sur le projet perso', "Un exercice d'algorithmie", 'Lire une doc technique']],
      Sport: ['dumbbell', '#f0643f', ['Séance de musculation', '20 min de vélo', 'Étirements 10 min']],
      Sommeil: ['moon', '#7c8cff', ['Au lit avant 23 h', 'Pas de café après 16 h']],
      Cuisine: ['utensils', '#14b8a6', ['Un repas fait maison', 'Préparer les repas du lendemain']],
    },
    weekly: [['Sport', 'Faire 40 km de vélo', 40, 'km'], ['Code', 'Publier une nouvelle version', null, '']],
    perso: ['Faire les courses', 'Réviser le permis'],
  },
];

const NOTES = ['Plus dur que prévu mais fait !', "Facile aujourd'hui", 'Fait en deux fois', 'Super motivé ce matin'];
const CHEERS = ['Bravo, continue comme ça !', 'Fier de toi', 'Belle régularité', 'Demain on vise plus haut'];
const REACTIONS = ['bravo', 'fire', 'strong', 'star', 'love'];
const REVIEWS_SELF = [
  "Bonne semaine dans l'ensemble, le sport a été plus régulier.",
  "Semaine chargée au travail, j'ai lâché sur la fin. Objectif : mieux m'organiser le soir.",
  "Je sens que les habitudes s'installent, très content.",
];
const REVIEWS_PARTNER = [
  'Très belle constance, tu peux augmenter un peu la difficulté.',
  "Quelques jours ratés mais tu t'es bien rattrapé, bravo.",
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

    const addGoal = (g) => {
      const { lastInsertRowid: id } = db.run(
        `INSERT INTO goals (assignee_id, author_id, skill_id, title, day, period, difficulty, status, target, unit, progress, reaction, done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        g.assignee, g.author, g.skill ?? null, g.title, g.day, g.period || 'day', g.difficulty, g.status,
        g.target ?? null, g.unit || '', g.progress || 0, g.reaction || '', g.status === 'todo' ? null : `${g.day}T19:00:00.000Z`,
      );
      goalCount++;
      return id;
    };
    const addMessage = (goalId, author, body, day) =>
      db.run('INSERT INTO messages (goal_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', goalId, author, body, `${day} 19:30:00`);

    PEOPLE.forEach((p, i) => {
      const me = ids[i];
      const partner = ids[1 - i];
      const skills = Object.entries(p.skills).map(([name, [icon, color, titles]]) => ({
        name,
        id: db.run(
          'INSERT INTO skills (owner_id, created_by, name, icon, color) VALUES (?, ?, ?, ?, ?)',
          me, partner, name, icon, color,
        ).lastInsertRowid,
        titles,
      }));
      const skillId = (name) => skills.find((s) => s.name === name).id;

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

          const id = addGoal({
            assignee: me, author: partner, skill: skill.id, title, day: d, difficulty: 1 + Math.floor(rand() * 3), status,
            reaction: finished && rand() < 0.35 ? pick(REACTIONS) : '',
          });
          if (finished && rand() < 0.25) addMessage(id, me, pick(NOTES), d);
          if (finished && rand() < 0.25) addMessage(id, partner, pick(CHEERS), d);
        }
        // Un objectif perso de temps en temps.
        if (rand() < 0.2) {
          addGoal({ assignee: me, author: me, title: pick(p.perso), day: d, difficulty: 1, status: d < today && rand() < 0.7 ? 'done' : 'todo' });
        }
      }

      // Objectifs de la semaine (chiffrés ou non) sur les 5 semaines.
      for (let w = 0; w < 5; w++) {
        const monday = L.addDays(start, w * 7);
        const past = L.addDays(monday, 6) < today;
        for (const [skill, title, target, unit] of p.weekly) {
          const ratio = past ? Math.min(1, 0.5 + rand() * 0.7) : rand() * 0.6;
          const progress = target ? Math.round(target * ratio) : 0;
          let status = target ? (progress >= target ? 'done' : progress > 0 ? 'partial' : 'todo') : (past && rand() < 0.7 ? 'done' : 'todo');
          if (!target && !past) status = 'todo';
          addGoal({ assignee: me, author: partner, skill: skillId(skill), title, day: monday, period: 'week', difficulty: 3, status, target, unit, progress });
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

  console.log(`ok Données de démo créées (${goalCount} objectifs) dans ${DB_FILE}`);
  console.log(`   Connexion : alice@demo.local ou bruno@demo.local — mot de passe : ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
