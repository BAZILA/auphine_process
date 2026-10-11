'use strict';
// Sauvegarde la base (copie cohérente, même pendant l'utilisation) et les photos.
//   npm run backup        → ~/backups/auphine/AAAA-MM-JJ/  (14 jours conservés)
// Variables : BACKUP_DIR (destination), DB_FILE (base à sauvegarder).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'auphine.db');
const UPLOADS = path.join(path.dirname(DB_FILE), 'uploads');
const DEST = process.env.BACKUP_DIR || path.join(os.homedir(), 'backups', 'auphine');
const KEEP_DAYS = 14;

const day = new Date().toISOString().slice(0, 10);
const target = path.join(DEST, day);
fs.mkdirSync(target, { recursive: true });

const copy = path.join(target, 'auphine.db');
fs.rmSync(copy, { force: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
db.close();

if (fs.existsSync(UPLOADS)) fs.cpSync(UPLOADS, path.join(target, 'uploads'), { recursive: true });

for (const name of fs.readdirSync(DEST)) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name) && (Date.now() - Date.parse(name)) / 864e5 > KEEP_DAYS) {
    fs.rmSync(path.join(DEST, name), { recursive: true, force: true });
  }
}
console.log(`Sauvegarde terminée : ${target}`);
