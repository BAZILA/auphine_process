'use strict';
// API JSON : /api/...  (authentification par jeton "Bearer").
const crypto = require('node:crypto');
const L = require('./lib');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

const SESSION_DAYS = 30;
const MAX_BODY = 64 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const STATUSES = ['todo', 'partial', 'done'];
const REACTIONS = ['', '👏', '🔥', '💪', '❤️', '😅', '🌟'];

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(new HttpError(413, 'Requête trop volumineuse'));
      if (!chunks.length) return resolve({});
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      } catch {
        reject(new HttpError(400, 'JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

// --- Validation -------------------------------------------------------------
function text(value, label, min, max) {
  if (value != null && typeof value !== 'string') fail(400, `${label} : valeur invalide`);
  const s = (value || '').trim();
  if (s.length < min) fail(400, min === 1 ? `${label} : champ obligatoire` : `${label} : ${min} caractères minimum`);
  if (s.length > max) fail(400, `${label} : ${max} caractères maximum`);
  return s;
}

function intIn(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label} : valeur invalide`);
  return n;
}

function day(value, label) {
  if (!L.isDay(value)) fail(400, `${label} : date invalide`);
  return value;
}

// Derrière un proxy (Caddy, Nginx), l'adresse réelle du client est dans X-Forwarded-For.
// On ne s'y fie que si TRUST_PROXY=1, sinon n'importe qui pourrait la falsifier.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1]; // valeur ajoutée par notre proxy
  }
  return req.socket.remoteAddress || '';
}

const isUniqueViolation = (err) => /UNIQUE constraint failed/i.test(String(err && err.message));

// --- Anti-bruteforce minimal sur la connexion -------------------------------
function createLimiter({ max = 10, windowMs = 15 * 60e3 } = {}) {
  const hits = new Map();
  return {
    check(key) {
      const h = hits.get(key);
      if (h && h.until > Date.now() && h.count >= max) fail(429, 'Trop de tentatives, réessaie dans quelques minutes.');
    },
    fail(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.until < now) hits.set(key, { count: 1, until: now + windowMs });
      else h.count++;
      if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
    },
    reset: (key) => hits.delete(key),
  };
}

function createApi(db) {
  const routes = [];
  const route = (method, pattern, handler, { auth = true } = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler, auth });
  };
  const loginLimiter = createLimiter();

  // --- Accès aux données ----------------------------------------------------
  const userById = (id) => db.get('SELECT * FROM users WHERE id = ?', id);

  function uniqueInviteCode() {
    for (;;) {
      const code = L.newInviteCode();
      if (!db.get('SELECT 1 FROM users WHERE invite_code = ?', code)) return code;
    }
  }

  function createSession(userId) {
    const token = L.newToken();
    db.run(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      L.hashToken(token), userId, Date.now() + SESSION_DAYS * 864e5,
    );
    return token;
  }

  function authenticate(req) {
    const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    if (!m) return {};
    const me = db.get(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
      L.hashToken(m[1]), Date.now(),
    );
    return me ? { me, token: m[1] } : {};
  }

  function profile(me) {
    const partner = me.partner_id ? userById(me.partner_id) : null;
    return {
      user: { id: me.id, name: me.name, email: me.email, inviteCode: me.invite_code },
      partner: partner ? { id: partner.id, name: partner.name } : null,
    };
  }

  /** Traduit who = "me" | "partner" en identifiant utilisateur. */
  function target(me, who) {
    if (who == null || who === '' || who === 'me') return me.id;
    if (who === 'partner') {
      if (!me.partner_id) fail(409, "Tu n'as pas encore de binôme");
      return me.partner_id;
    }
    return fail(400, 'Paramètre "who" invalide');
  }

  /** Vérifie qu'une compétence appartient bien à `ownerId`. */
  function skillFor(value, ownerId) {
    if (value == null || value === '') return null;
    const skill = db.get('SELECT id FROM skills WHERE id = ? AND owner_id = ?', Number(value), ownerId);
    if (!skill) fail(400, 'Compétence invalide');
    return skill.id;
  }

  const GOAL_SELECT = `
    SELECT g.id, g.assignee_id AS assigneeId, g.author_id AS authorId, g.skill_id AS skillId,
           g.title, g.details, g.day, g.difficulty, g.status, g.note, g.feedback, g.reaction,
           g.series_id AS seriesId, g.done_at AS doneAt,
           s.name AS skillName, s.icon AS skillIcon, s.color AS skillColor,
           a.name AS authorName
    FROM goals g
    LEFT JOIN skills s ON s.id = g.skill_id
    LEFT JOIN users a ON a.id = g.author_id`;

  // --- Rapport hebdomadaire ---------------------------------------------------
  function stats(list, today) {
    const s = { total: 0, done: 0, partial: 0, missed: 0, upcoming: 0, xp: 0, rate: null };
    for (const g of list) {
      s.total++;
      if (g.status === 'done') s.done++;
      else if (g.status === 'partial') s.partial++;
      else if (g.day < today) s.missed++;
      else s.upcoming++;
      s.xp += L.goalXp(g);
    }
    // Le taux ne compte que les objectifs « échus » : un objectif du jour pas encore fait n'est pas un échec.
    const due = s.done + s.partial + s.missed;
    if (due) s.rate = Math.round(((s.done + s.partial / 2) / due) * 100);
    return s;
  }

  /** Série en cours = jours consécutifs où tous les objectifs sont faits (les jours sans objectif sont neutres). */
  function streaks(uid, today) {
    const rows = db.all(
      `SELECT day, COUNT(*) AS total, SUM(status = 'done') AS done
       FROM goals WHERE assignee_id = ? AND day <= ? GROUP BY day ORDER BY day DESC LIMIT 400`,
      uid, today,
    );
    let streak = 0;
    let counting = true;
    let run = 0;
    let best = 0;
    for (const r of rows) {
      const perfect = r.done === r.total;
      if (counting) {
        if (perfect) streak++;
        else if (r.day !== today) counting = false; // la journée en cours n'est pas encore terminée
      }
      if (perfect) run++;
      else if (r.day !== today) run = 0;
      best = Math.max(best, run);
    }
    return { streak, bestStreak: best };
  }

  function buildReport(uid, anyDay, today) {
    const week = L.mondayOf(anyDay);
    const weekEnd = L.addDays(week, 6);
    const historyStart = L.addDays(week, -7 * 7);
    const rows = db.all(
      'SELECT day, status, difficulty, skill_id AS skillId FROM goals WHERE assignee_id = ? AND day BETWEEN ? AND ?',
      uid, historyStart, weekEnd,
    );
    const between = (a, b) => rows.filter((g) => g.day >= a && g.day <= b);

    const history = Array.from({ length: 8 }, (_, i) => {
      const start = L.addDays(historyStart, 7 * i);
      const s = stats(between(start, L.addDays(start, 6)), today);
      return { week: start, rate: s.rate, total: s.total, done: s.done };
    });

    const weekRows = between(week, weekEnd);
    const summary = { ...stats(weekRows, today), prevRate: history[6].rate };
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = L.addDays(week, i);
      return { day: d, ...stats(weekRows.filter((g) => g.day === d), today) };
    });

    const skillMeta = new Map(
      db.all('SELECT id, name, icon, color FROM skills WHERE owner_id = ?', uid).map((s) => [s.id, s]),
    );
    const bySkill = new Map();
    for (const g of weekRows) {
      const key = skillMeta.has(g.skillId) ? g.skillId : 0;
      const bucket = bySkill.get(key) || {
        ...(skillMeta.get(key) || { id: null, name: 'Sans compétence', icon: '•', color: '#8a86a3' }),
        xp: 0, done: 0, total: 0,
      };
      bucket.total++;
      if (g.status === 'done') bucket.done++;
      bucket.xp += L.goalXp(g);
      bySkill.set(key, bucket);
    }
    const skills = [...bySkill.values()].sort((a, b) => b.xp - a.xp || b.total - a.total);

    const goals = db.all(`${GOAL_SELECT} WHERE g.assignee_id = ? AND g.day BETWEEN ? AND ? ORDER BY g.day, g.id`, uid, week, weekEnd);
    const reviews = db.all(
      `SELECT r.author_id AS authorId, u.name AS authorName, r.rating, r.comment, r.updated_at AS updatedAt
       FROM reviews r JOIN users u ON u.id = r.author_id WHERE r.user_id = ? AND r.week = ?`,
      uid, week,
    );

    return { week, weekEnd, today, summary, days, skills, history, ...streaks(uid, today), goals, reviews };
  }

  // =========================================================================
  // Authentification
  // =========================================================================
  route('POST', '/register', async ({ body }) => {
    const name = text(body.name, 'Prénom', 1, 40);
    const email = text(body.email, 'E-mail', 3, 120).toLowerCase();
    if (!EMAIL_RE.test(email)) fail(400, 'E-mail invalide');
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) fail(400, 'Mot de passe : 8 caractères minimum');
    if (password.length > 200) fail(400, 'Mot de passe trop long');
    if (db.get('SELECT 1 FROM users WHERE email = ?', email)) fail(409, 'Un compte existe déjà avec cet e-mail');

    const hash = await L.hashPassword(password);
    let id;
    try {
      id = db.run(
        'INSERT INTO users (name, email, password_hash, invite_code) VALUES (?, ?, ?, ?)',
        name, email, hash, uniqueInviteCode(),
      ).lastInsertRowid;
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, 'Un compte existe déjà avec cet e-mail');
      throw err;
    }
    return { token: createSession(id), ...profile(userById(id)) };
  }, { auth: false });

  route('POST', '/login', async ({ body, ip }) => {
    loginLimiter.check(ip);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = db.get('SELECT * FROM users WHERE email = ?', email);
    const ok = user && (await L.verifyPassword(password, user.password_hash));
    if (!ok) {
      loginLimiter.fail(ip);
      fail(401, 'E-mail ou mot de passe incorrect');
    }
    loginLimiter.reset(ip);
    return { token: createSession(user.id), ...profile(user) };
  }, { auth: false });

  route('POST', '/logout', ({ token }) => {
    db.run('DELETE FROM sessions WHERE token_hash = ?', L.hashToken(token));
  });

  // =========================================================================
  // Profil et binôme
  // =========================================================================
  route('GET', '/me', ({ me }) => profile(me));

  route('PATCH', '/me', ({ me, body }) => {
    db.run('UPDATE users SET name = ? WHERE id = ?', text(body.name, 'Prénom', 1, 40), me.id);
    return profile(userById(me.id));
  });

  route('POST', '/me/invite-code', ({ me }) => {
    db.run('UPDATE users SET invite_code = ? WHERE id = ?', uniqueInviteCode(), me.id);
    return profile(userById(me.id));
  });

  route('POST', '/pair', ({ me, body }) => {
    if (me.partner_id) fail(409, 'Tu es déjà lié·e à un binôme');
    const code = String(body.code || '').trim().toUpperCase();
    const other = db.get('SELECT * FROM users WHERE invite_code = ?', code);
    if (!other) fail(404, 'Code introuvable, vérifie-le');
    if (other.id === me.id) fail(400, "C'est ton propre code 😉");
    if (other.partner_id) fail(409, 'Cette personne a déjà un binôme');
    db.tx(() => {
      db.run('UPDATE users SET partner_id = ? WHERE id = ?', other.id, me.id);
      db.run('UPDATE users SET partner_id = ? WHERE id = ?', me.id, other.id);
    });
    return profile(userById(me.id));
  });

  route('DELETE', '/pair', ({ me }) => {
    if (me.partner_id) db.run('UPDATE users SET partner_id = NULL WHERE id IN (?, ?)', me.id, me.partner_id);
    return profile(userById(me.id));
  });

  // =========================================================================
  // Objectifs
  // =========================================================================
  route('GET', '/goals', ({ me, query }) => {
    const uid = target(me, query.get('who'));
    const from = day(query.get('from'), 'Début');
    const to = day(query.get('to'), 'Fin');
    if (to < from || L.addDays(from, 62) < to) fail(400, 'Période invalide');
    return db.all(`${GOAL_SELECT} WHERE g.assignee_id = ? AND g.day BETWEEN ? AND ? ORDER BY g.day, g.id`, uid, from, to);
  });

  // Les objectifs sont toujours fixés par l'un pour l'autre.
  route('POST', '/goals', ({ me, body }) => {
    const assignee = target(me, 'partner');
    const title = text(body.title, 'Objectif', 1, 120);
    const details = text(body.details, 'Détails', 0, 1000);
    const difficulty = intIn(body.difficulty ?? 1, 1, 3, 'Difficulté');
    const skillId = skillFor(body.skillId, assignee);
    const days = Array.isArray(body.days) ? [...new Set(body.days)] : [];
    if (!days.length || days.length > 60) fail(400, 'Choisis entre 1 et 60 jours');
    days.forEach((d) => day(d, 'Jour'));
    const seriesId = days.length > 1 ? crypto.randomUUID() : null;

    const created = db.tx(() => days.map((d) => db.run(
      `INSERT INTO goals (assignee_id, author_id, skill_id, title, details, day, difficulty, series_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      assignee, me.id, skillId, title, details, d, difficulty, seriesId,
    ).lastInsertRowid));
    return { created: created.length };
  });

  route('PATCH', '/goals/:id', ({ me, body, params }) => {
    const g = db.get('SELECT * FROM goals WHERE id = ?', Number(params.id));
    if (!g) fail(404, 'Objectif introuvable');
    const isDoer = g.assignee_id === me.id;
    const isAuthor = g.author_id === me.id && g.assignee_id === me.partner_id;
    if (!isDoer && !isAuthor) fail(403, 'Accès refusé');

    const set = {};
    if (isDoer) {
      if (body.status !== undefined && body.status !== g.status) {
        if (!STATUSES.includes(body.status)) fail(400, 'Statut invalide');
        set.status = body.status;
        set.done_at = body.status === 'todo' ? null : new Date().toISOString();
      }
      if (body.note !== undefined) set.note = text(body.note, 'Commentaire', 0, 1000);
    }
    if (isAuthor) {
      if (body.title !== undefined) set.title = text(body.title, 'Objectif', 1, 120);
      if (body.details !== undefined) set.details = text(body.details, 'Détails', 0, 1000);
      if (body.difficulty !== undefined) set.difficulty = intIn(body.difficulty, 1, 3, 'Difficulté');
      if (body.skillId !== undefined) set.skill_id = skillFor(body.skillId, g.assignee_id);
      if (body.day !== undefined) set.day = day(body.day, 'Jour');
      if (body.feedback !== undefined) set.feedback = text(body.feedback, 'Retour', 0, 1000);
      if (body.reaction !== undefined) {
        if (!REACTIONS.includes(body.reaction)) fail(400, 'Réaction invalide');
        set.reaction = body.reaction;
      }
    }
    const cols = Object.keys(set);
    if (cols.length) {
      db.run(`UPDATE goals SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(set), g.id);
    }
    return db.get(`${GOAL_SELECT} WHERE g.id = ?`, g.id);
  });

  route('DELETE', '/goals/:id', ({ me, params, query }) => {
    const g = db.get('SELECT * FROM goals WHERE id = ?', Number(params.id));
    if (!g) fail(404, 'Objectif introuvable');
    if (g.author_id !== me.id) fail(403, "Seul l'auteur peut supprimer cet objectif");
    if (query.get('scope') === 'series' && g.series_id) {
      // Supprime celui-ci + les répétitions à venir pas encore commencées.
      const r = db.run(
        `DELETE FROM goals WHERE series_id = ? AND author_id = ? AND (id = ? OR (day >= ? AND status = 'todo'))`,
        g.series_id, me.id, g.id, g.day,
      );
      return { deleted: r.changes };
    }
    db.run('DELETE FROM goals WHERE id = ?', g.id);
    return { deleted: 1 };
  });

  // =========================================================================
  // Compétences
  // =========================================================================
  route('GET', '/skills', ({ me, query }) => {
    const uid = target(me, query.get('who'));
    const skills = db.all(
      `SELECT s.id, s.name, s.icon, s.color,
              COALESCE(SUM(${L.xpSql('g')}), 0) AS xp,
              COUNT(g.id) AS total,
              COALESCE(SUM(g.status = 'done'), 0) AS done
       FROM skills s LEFT JOIN goals g ON g.skill_id = s.id
       WHERE s.owner_id = ? GROUP BY s.id ORDER BY xp DESC, s.name COLLATE NOCASE`,
      uid,
    ).map((s) => ({ ...s, ...L.levelInfo(s.xp) }));
    const overall = db.get(
      `SELECT COALESCE(SUM(${L.xpSql('g')}), 0) AS xp, COUNT(*) AS total, COALESCE(SUM(g.status = 'done'), 0) AS done
       FROM goals g WHERE g.assignee_id = ?`,
      uid,
    );
    return { skills, overall: { ...overall, ...L.levelInfo(overall.xp) } };
  });

  route('POST', '/skills', ({ me, body }) => {
    const owner = target(me, body.who);
    const name = text(body.name, 'Nom', 1, 40);
    const icon = text(body.icon || '⭐', 'Icône', 1, 8);
    const color = COLOR_RE.test(body.color || '') ? body.color : '#5b4bdb';
    try {
      const { lastInsertRowid: id } = db.run(
        'INSERT INTO skills (owner_id, created_by, name, icon, color) VALUES (?, ?, ?, ?, ?)',
        owner, me.id, name, icon, color,
      );
      return { id, name, icon, color };
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, 'Cette compétence existe déjà');
      throw err;
    }
  });

  route('DELETE', '/skills/:id', ({ me, params }) => {
    const s = db.get('SELECT * FROM skills WHERE id = ?', Number(params.id));
    if (!s || (s.owner_id !== me.id && s.owner_id !== me.partner_id)) fail(404, 'Compétence introuvable');
    db.run('DELETE FROM skills WHERE id = ?', s.id);
  });

  // =========================================================================
  // Bilan hebdomadaire
  // =========================================================================
  route('GET', '/report', ({ me, query }) => {
    const uid = target(me, query.get('who'));
    const today = L.isDay(query.get('today')) ? query.get('today') : L.localToday();
    const week = query.get('week') ? day(query.get('week'), 'Semaine') : today;
    return buildReport(uid, week, today);
  });

  route('PUT', '/reviews', ({ me, body }) => {
    const uid = target(me, body.who);
    const week = L.mondayOf(day(body.week, 'Semaine'));
    const rating = body.rating == null || body.rating === '' ? null : intIn(body.rating, 1, 5, 'Note');
    const comment = text(body.comment, 'Commentaire', 0, 2000);
    db.run(
      `INSERT INTO reviews (user_id, author_id, week, rating, comment) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, author_id, week)
       DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = datetime('now')`,
      uid, me.id, week, rating, comment,
    );
    return { ok: true };
  });

  // =========================================================================
  // Routage
  // =========================================================================
  async function handle(req, res, url) {
    const path = url.pathname.replace(/^\/api/, '') || '/';
    const candidates = routes.filter((r) => r.re.test(path));
    if (!candidates.length) return sendJson(res, 404, { error: 'Route inconnue' });
    const r = candidates.find((c) => c.method === req.method);
    if (!r) return sendJson(res, 405, { error: 'Méthode non autorisée' });

    try {
      const m = r.re.exec(path);
      const ctx = {
        query: url.searchParams,
        params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])),
        ip: clientIp(req),
        body: {},
      };
      if (r.auth) {
        Object.assign(ctx, authenticate(req));
        if (!ctx.me) fail(401, 'Session expirée, reconnecte-toi');
      }
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) ctx.body = await readJson(req);
      const out = await r.handler(ctx);
      return out === undefined ? sendJson(res, 204) : sendJson(res, 200, out);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      throw err;
    }
  }

  const purgeSessions = () => db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());

  return { handle, purgeSessions };
}

module.exports = { createApi, sendJson };
