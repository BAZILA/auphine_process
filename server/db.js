'use strict';
// Base SQLite intégrée à Node (node:sqlite) : aucune dépendance à installer.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  invite_code   TEXT NOT NULL UNIQUE,
  partner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Compétence appartenant à une personne (owner), créée par elle ou son binôme.
CREATE TABLE IF NOT EXISTS skills (
  id         INTEGER PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'star',
  color      TEXT NOT NULL DEFAULT '#5b4bdb',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, name COLLATE NOCASE)
);

-- Objectif d'un jour : fixé par author_id, à réaliser par assignee_id.
CREATE TABLE IF NOT EXISTS goals (
  id          INTEGER PRIMARY KEY,
  assignee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id    INTEGER REFERENCES skills(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  day         TEXT NOT NULL,
  difficulty  INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'partial', 'done')),
  note        TEXT NOT NULL DEFAULT '',  -- commentaire de la personne qui réalise
  feedback    TEXT NOT NULL DEFAULT '',  -- retour de l'auteur
  reaction    TEXT NOT NULL DEFAULT '',
  series_id   TEXT,                      -- regroupe les objectifs répétés
  done_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS goals_assignee_day ON goals (assignee_id, day);
CREATE INDEX IF NOT EXISTS goals_skill ON goals (skill_id);

-- Bilan écrit d'une semaine (week = lundi). author = user → auto-bilan.
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week       TEXT NOT NULL,
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, author_id, week)
);
`;

// Correspondance des anciens emojis vers les noms d'icônes (migration 1).
const EMOJI_TO_ICON = {
  '⭐': 'star', '🏃': 'activity', '💪': 'dumbbell', '📚': 'book', '🗣': 'globe', '🧘': 'leaf',
  '💻': 'code', '🎵': 'music', '🍳': 'utensils', '💰': 'wallet', '😴': 'moon', '💧': 'droplet',
  '✍': 'pen', '🎨': 'palette', '🧠': 'bulb', '❤': 'heart', '🌱': 'leaf', '💼': 'briefcase',
};
const REACTION_TO_KEY = { '👏': 'bravo', '🔥': 'fire', '💪': 'strong', '❤️': 'love', '❤': 'love', '😅': 'courage', '🌟': 'star' };

// Chaque migration s'exécute une seule fois (suivi par PRAGMA user_version).
const MIGRATIONS = [
  // 1 : icônes, objectifs perso / hebdo / chiffrés, photos, discussion, badges, notifications
  (db) => {
    db.exec(`
      ALTER TABLE goals ADD COLUMN period TEXT NOT NULL DEFAULT 'day';  -- 'day' | 'week' (day = lundi)
      ALTER TABLE goals ADD COLUMN target REAL;                          -- objectif chiffré (facultatif)
      ALTER TABLE goals ADD COLUMN unit TEXT NOT NULL DEFAULT '';
      ALTER TABLE goals ADD COLUMN progress REAL NOT NULL DEFAULT 0;
      ALTER TABLE goals ADD COLUMN photo TEXT;                           -- nom du fichier de preuve
      ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN notif_prefs TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE users ADD COLUMN last_reminder TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN last_weekly TEXT NOT NULL DEFAULT '';

      CREATE TABLE messages (
        id         INTEGER PRIMARY KEY,
        goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX messages_goal ON messages (goal_id, id);

      CREATE TABLE push_subscriptions (
        endpoint   TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE user_badges (
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge       TEXT NOT NULL,
        unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, badge)
      );

      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);

    const setIcon = db.prepare('UPDATE skills SET icon = ? WHERE id = ?');
    for (const s of db.prepare('SELECT id, icon FROM skills').all()) {
      setIcon.run(EMOJI_TO_ICON[s.icon.replace(/️/g, '')] || (/^[a-z-]+$/.test(s.icon) ? s.icon : 'star'), s.id);
    }
    const setReaction = db.prepare('UPDATE goals SET reaction = ? WHERE id = ?');
    for (const g of db.prepare("SELECT id, reaction FROM goals WHERE reaction <> ''").all()) {
      setReaction.run(REACTION_TO_KEY[g.reaction] || REACTION_TO_KEY[g.reaction.replace(/️/g, '')] || 'bravo', g.id);
    }
    // Les anciens commentaires deviennent les premiers messages de la discussion.
    db.exec(`
      INSERT INTO messages (goal_id, author_id, body, created_at)
        SELECT id, assignee_id, note, COALESCE(replace(substr(done_at, 1, 19), 'T', ' '), created_at) FROM goals WHERE note <> '';
      INSERT INTO messages (goal_id, author_id, body, created_at)
        SELECT id, author_id, feedback, created_at FROM goals WHERE feedback <> '';
      UPDATE goals SET note = '', feedback = '';
    `);
  },

  // 2 : administration, centre de notifications, dernière activité
  (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN last_seen TEXT;

      CREATE TABLE notifications (
        id         INTEGER PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL DEFAULT 'info',
        title      TEXT NOT NULL,
        body       TEXT NOT NULL DEFAULT '',
        url        TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        read_at    TEXT
      );
      CREATE INDEX notifications_user ON notifications (user_id, id);

      -- Journal des actions d'administration (la cible est gardée en texte : le compte peut être supprimé).
      CREATE TABLE admin_log (
        id         INTEGER PRIMARY KEY,
        admin_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action     TEXT NOT NULL,
        target     TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
];

function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function createStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  migrate(db);

  // Les requêtes préparées sont mises en cache par texte SQL.
  const statements = new Map();
  const stmt = (sql) => {
    let s = statements.get(sql);
    if (!s) statements.set(sql, (s = db.prepare(sql)));
    return s;
  };

  return {
    get: (sql, ...params) => stmt(sql).get(...params),
    all: (sql, ...params) => stmt(sql).all(...params),
    run: (sql, ...params) => stmt(sql).run(...params),
    tx(fn) {
      db.exec('BEGIN');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => db.close(),
  };
}

module.exports = { createStore };
