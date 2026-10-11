'use strict';
// Badges : calculés à partir de l'historique, mémorisés au moment où ils sont débloqués.
const L = require('./lib');

const BADGES = [
  { id: 'first', name: 'Premier pas', desc: 'Réussir ton premier objectif', icon: 'check-circle', metric: 'done', goal: 1 },
  { id: 'done10', name: 'Lancé', desc: '10 objectifs réussis', icon: 'trending-up', metric: 'done', goal: 10 },
  { id: 'done50', name: 'Régulier', desc: '50 objectifs réussis', icon: 'target', metric: 'done', goal: 50 },
  { id: 'done100', name: 'Centurion', desc: '100 objectifs réussis', icon: 'shield', metric: 'done', goal: 100 },
  { id: 'done250', name: 'Inarrêtable', desc: '250 objectifs réussis', icon: 'crown', metric: 'done', goal: 250 },
  { id: 'streak3', name: 'Sur la lancée', desc: '3 journées parfaites d\'affilée', icon: 'flame', metric: 'bestStreak', goal: 3 },
  { id: 'streak7', name: 'Semaine en feu', desc: '7 journées parfaites d\'affilée', icon: 'zap', metric: 'bestStreak', goal: 7 },
  { id: 'streak30', name: 'Mental d\'acier', desc: '30 journées parfaites d\'affilée', icon: 'medal', metric: 'bestStreak', goal: 30 },
  { id: 'perfectWeek', name: 'Semaine parfaite', desc: 'Tous les objectifs d\'une semaine (5 minimum)', icon: 'star', metric: 'perfectWeeks', goal: 1 },
  { id: 'weekly5', name: 'Vision long terme', desc: '5 objectifs de la semaine réussis', icon: 'calendar', metric: 'weekDone', goal: 5 },
  { id: 'skill3', name: 'Spécialiste', desc: 'Une compétence au niveau 3', icon: 'award', metric: 'maxSkillLevel', goal: 3 },
  { id: 'skill5', name: 'Expert', desc: 'Une compétence au niveau 5', icon: 'trophy', metric: 'maxSkillLevel', goal: 5 },
  { id: 'level5', name: 'Sommet', desc: 'Atteindre le niveau global 5', icon: 'mountain', metric: 'level', goal: 5 },
  { id: 'photo10', name: 'Preuve à l\'appui', desc: '10 preuves photo', icon: 'camera', metric: 'photos', goal: 10 },
  { id: 'cheer20', name: 'Supporter', desc: '20 encouragements envoyés à ton binôme', icon: 'heart', metric: 'cheers', goal: 20 },
];

function createBadges(db, { streaks }) {
  function metrics(uid, today) {
    const user = db.get('SELECT partner_id FROM users WHERE id = ?', uid);
    const totals = db.get(
      `SELECT COALESCE(SUM(status = 'done'), 0) AS done,
              COALESCE(SUM(status = 'done' AND period = 'week'), 0) AS weekDone,
              COALESCE(SUM(photo IS NOT NULL), 0) AS photos,
              COALESCE(SUM(${L.xpSql('goals')}), 0) AS xp
       FROM goals WHERE assignee_id = ?`,
      uid,
    );
    const skillXp = db.get(
      `SELECT COALESCE(MAX(xp), 0) AS xp FROM (
         SELECT SUM(${L.xpSql('g')}) AS xp FROM goals g JOIN skills s ON s.id = g.skill_id
         WHERE s.owner_id = ? GROUP BY s.id)`,
      uid,
    ).xp;

    // Semaines parfaites : au moins 5 objectifs du jour, tous faits.
    const weeks = new Map();
    for (const r of db.all(`SELECT day, status FROM goals WHERE assignee_id = ? AND period = 'day' AND day <= ?`, uid, today)) {
      const w = L.mondayOf(r.day);
      const s = weeks.get(w) || { total: 0, done: 0 };
      s.total++;
      if (r.status === 'done') s.done++;
      weeks.set(w, s);
    }
    const perfectWeeks = [...weeks.values()].filter((s) => s.total >= 5 && s.done === s.total).length;

    let cheers = db.get(
      'SELECT COUNT(*) AS n FROM messages m JOIN goals g ON g.id = m.goal_id WHERE m.author_id = ? AND g.assignee_id <> ?',
      uid, uid,
    ).n;
    if (user?.partner_id) {
      cheers += db.get("SELECT COUNT(*) AS n FROM goals WHERE assignee_id = ? AND reaction <> ''", user.partner_id).n;
    }

    return {
      done: totals.done,
      weekDone: totals.weekDone,
      photos: totals.photos,
      level: L.levelInfo(totals.xp).level,
      maxSkillLevel: L.levelInfo(skillXp).level,
      bestStreak: streaks(uid, today).bestStreak,
      perfectWeeks,
      cheers,
    };
  }

  /** Calcule les badges, enregistre ceux nouvellement débloqués et les renvoie dans `fresh`. */
  function check(uid, today) {
    const m = metrics(uid, today);
    const known = new Map(db.all('SELECT badge, unlocked_at AS at FROM user_badges WHERE user_id = ?', uid).map((r) => [r.badge, r.at]));
    const fresh = [];
    const list = BADGES.map((b) => {
      const current = m[b.metric];
      let unlockedAt = known.get(b.id) || null;
      if (!unlockedAt && current >= b.goal) {
        db.run('INSERT OR IGNORE INTO user_badges (user_id, badge) VALUES (?, ?)', uid, b.id);
        unlockedAt = new Date().toISOString();
        fresh.push(b);
      }
      return {
        id: b.id, name: b.name, desc: b.desc, icon: b.icon, goal: b.goal,
        current: Math.min(current, b.goal), unlocked: Boolean(unlockedAt), unlockedAt,
      };
    });
    return { badges: list, fresh: fresh.map(({ id, name, desc, icon }) => ({ id, name, desc, icon })) };
  }

  return { check };
}

module.exports = { createBadges, BADGES };
