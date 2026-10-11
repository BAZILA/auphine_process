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
  icon       TEXT NOT NULL DEFAULT '⭐',
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

function createStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);

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
