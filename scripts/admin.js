'use strict';
// Gère les comptes administrateurs depuis le serveur.
//   node scripts/admin.js list
//   node scripts/admin.js promote toi@exemple.fr
//   node scripts/admin.js demote toi@exemple.fr
const path = require('node:path');
const { createStore } = require('../server/db');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'auphine.db');
const [command, email] = process.argv.slice(2);
const db = createStore(DB_FILE);

try {
  if (command === 'list') {
    const admins = db.all('SELECT id, name, email FROM users WHERE is_admin = 1');
    console.log(admins.length ? admins.map((a) => `- ${a.name} <${a.email}>`).join('\n') : 'Aucun administrateur.');
  } else if ((command === 'promote' || command === 'demote') && email) {
    const user = db.get('SELECT id, name FROM users WHERE email = ?', email.trim().toLowerCase());
    if (!user) {
      console.error(`Aucun compte avec l'e-mail ${email}. Crée d'abord le compte dans l'appli.`);
      process.exitCode = 1;
    } else {
      db.run('UPDATE users SET is_admin = ? WHERE id = ?', command === 'promote' ? 1 : 0, user.id);
      console.log(command === 'promote'
        ? `${user.name} est maintenant administrateur. Recharge l'appli : l'espace « Administration » apparaît dans le Profil.`
        : `${user.name} n'est plus administrateur.`);
    }
  } else {
    console.log('Usage : node scripts/admin.js list | promote <email> | demote <email>');
  }
} finally {
  db.close();
}
