'use strict';
// API JSON : /api/...  (authentification par jeton "Bearer").
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib');
const { createBadges } = require('./badges');
const { isValidEndpoint } = require('./push');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
/** Valeur renvoyée par un handler qui a déjà écrit la réponse lui-même (ex. envoi d'une photo). */
const HANDLED = Symbol('handled');

const SESSION_DAYS = 30;
const MAX_BODY = 64 * 1024;
const MAX_PHOTO = 4 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const ICON_RE = /^[a-z][a-z-]{1,23}$/;
const PHOTO_RE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const STATUSES = ['todo', 'partial', 'done'];
const REACTIONS = { bravo: 'Bravo', fire: 'En feu', strong: 'Costaud', love: "J'adore", courage: 'Courage', star: 'Au top' };
const NOTIF_DEFAULTS = { goals: true, social: true, reminder: true, weekly: true, badges: true };
const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= max) chunks.push(chunk);
    });
    req.on('end', () => (size > max ? reject(new HttpError(413, 'Envoi trop volumineux')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, MAX_BODY);
  if (!buf.length) return {};
  try {
    const value = JSON.parse(buf.toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
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

function amount(value, label, { min = 0, max = 1e6 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `${label} : valeur invalide`);
  return Math.round(n * 100) / 100;
}

/** Objectif chiffré : nombre strictement positif, ou null. */
const parseTarget = (v) => (v == null || v === '' ? null : amount(v, 'Objectif chiffré', { min: 0.01 }));

function day(value, label) {
  if (!L.isDay(value)) fail(400, `${label} : date invalide`);
  return value;
}

/** Un objectif de la semaine est rangé au lundi ; il est « dû » le dimanche. */
const normalizeDay = (period, d) => (period === 'week' ? L.mondayOf(d) : d);
const dueDay = (g) => (g.period === 'week' ? L.addDays(g.day, 6) : g.day);

function statusFromProgress(progress, target) {
  if (progress >= target) return 'done';
  return progress > 0 ? 'partial' : 'todo';
}

function imageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function isTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Jour, heure et jour de semaine actuels dans un fuseau donné. */
function localParts(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: isTimeZone(tz) ? tz : undefined,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

const isUniqueViolation = (err) => /UNIQUE constraint failed/i.test(String(err && err.message));
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Derrière un proxy (Caddy, Nginx, Apache), l'adresse réelle du client est dans X-Forwarded-For.
// On ne s'y fie que si TRUST_PROXY=1, sinon n'importe qui pourrait la falsifier.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1]; // valeur ajoutée par notre proxy
  }
  return req.socket.remoteAddress || '';
}

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

function createApi(db, { uploadsDir, push = null } = {}) {
  const routes = [];
  const route = (method, pattern, handler, { auth = true, raw = false } = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler, auth, raw });
  };
  const loginLimiter = createLimiter();

  // Les notifications partent en arrière-plan : un échec ne bloque jamais la requête.
  const notify = (userId, payload, pref) => {
    if (!push || !userId) return;
    push.notify(userId, payload, pref).catch((err) => console.error('[push]', err.message));
  };

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

  const notifPrefs = (u) => ({ ...NOTIF_DEFAULTS, ...JSON.parse(u.notif_prefs || '{}') });

  function profile(me) {
    const partner = me.partner_id ? userById(me.partner_id) : null;
    return {
      user: { id: me.id, name: me.name, email: me.email, inviteCode: me.invite_code, notifPrefs: notifPrefs(me) },
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

  /** Objectif visible par moi : le mien, ou celui de mon binôme actuel. */
  function visibleGoal(me, id) {
    const g = db.get('SELECT * FROM goals WHERE id = ?', Number(id));
    if (!g || (g.assignee_id !== me.id && (!me.partner_id || g.assignee_id !== me.partner_id))) fail(404, 'Objectif introuvable');
    return g;
  }

  const GOAL_SELECT = `
    SELECT g.id, g.assignee_id AS assigneeId, g.author_id AS authorId, g.skill_id AS skillId,
           g.title, g.details, g.day, g.period, g.difficulty, g.status, g.target, g.unit, g.progress,
           g.reaction, g.photo, g.series_id AS seriesId, g.done_at AS doneAt,
           (SELECT COUNT(*) FROM messages m WHERE m.goal_id = g.id) AS messages,
           s.name AS skillName, s.icon AS skillIcon, s.color AS skillColor,
           a.name AS authorName
    FROM goals g
    LEFT JOIN skills s ON s.id = g.skill_id
    LEFT JOIN users a ON a.id = g.author_id`;

  const goalView = (id) => db.get(`${GOAL_SELECT} WHERE g.id = ?`, id);

  function removePhoto(name) {
    if (name && PHOTO_RE.test(name)) fs.rm(path.join(uploadsDir, name), { force: true }, () => {});
  }

  // --- Statistiques ----------------------------------------------------------
  function stats(list, today) {
    const s = { total: 0, done: 0, partial: 0, missed: 0, upcoming: 0, xp: 0, rate: null };
    for (const g of list) {
      s.total++;
      if (g.status === 'done') s.done++;
      else if (g.status === 'partial') s.partial++;
      else if (dueDay(g) < today) s.missed++;
      else s.upcoming++;
      s.xp += L.goalXp(g);
    }
    // Le taux ne compte que les objectifs « échus » : un objectif pas encore fait n'est pas un échec.
    const due = s.done + s.partial + s.missed;
    if (due) s.rate = Math.round(((s.done + s.partial / 2) / due) * 100);
    return s;
  }

  /** Série = jours consécutifs où tous les objectifs du jour sont faits (les jours sans objectif sont neutres). */
  function streaks(uid, today) {
    const rows = db.all(
      `SELECT day, COUNT(*) AS total, SUM(status = 'done') AS done
       FROM goals WHERE assignee_id = ? AND period = 'day' AND day <= ? GROUP BY day ORDER BY day DESC LIMIT 400`,
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

  const badges = createBadges(db, { streaks });

  /** Vérifie les badges d'un utilisateur et le prévient de ceux qu'il vient de débloquer. */
  function checkBadges(uid, today) {
    const { fresh } = badges.check(uid, today);
    for (const b of fresh) {
      notify(uid, { title: 'Nouveau badge débloqué', body: `${b.name} : ${b.desc}`, url: '/#/progress', tag: `badge-${b.id}` }, 'badges');
    }
    return fresh;
  }

  function buildReport(uid, anyDay, today) {
    const week = L.mondayOf(anyDay);
    const weekEnd = L.addDays(week, 6);
    const historyStart = L.addDays(week, -7 * 7);
    const rows = db.all(
      'SELECT day, period, status, difficulty, skill_id AS skillId FROM goals WHERE assignee_id = ? AND day BETWEEN ? AND ?',
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
    const dailyRows = weekRows.filter((g) => g.period === 'day');
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = L.addDays(week, i);
      return { day: d, ...stats(dailyRows.filter((g) => g.day === d), today) };
    });

    const skillMeta = new Map(
      db.all('SELECT id, name, icon, color FROM skills WHERE owner_id = ?', uid).map((s) => [s.id, s]),
    );
    const bySkill = new Map();
    for (const g of weekRows) {
      const key = skillMeta.has(g.skillId) ? g.skillId : 0;
      const bucket = bySkill.get(key) || {
        ...(skillMeta.get(key) || { id: null, name: 'Sans compétence', icon: 'circle', color: '#8a86a3' }),
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
    if (body.name !== undefined) db.run('UPDATE users SET name = ? WHERE id = ?', text(body.name, 'Prénom', 1, 40), me.id);
    if (body.notifPrefs !== undefined) {
      const prefs = {};
      for (const k of Object.keys(NOTIF_DEFAULTS)) {
        if (typeof body.notifPrefs?.[k] === 'boolean') prefs[k] = body.notifPrefs[k];
      }
      db.run('UPDATE users SET notif_prefs = ? WHERE id = ?', JSON.stringify({ ...notifPrefs(me), ...prefs }), me.id);
    }
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
    if (other.id === me.id) fail(400, "C'est ton propre code");
    if (other.partner_id) fail(409, 'Cette personne a déjà un binôme');
    db.tx(() => {
      db.run('UPDATE users SET partner_id = ? WHERE id = ?', other.id, me.id);
      db.run('UPDATE users SET partner_id = ? WHERE id = ?', me.id, other.id);
    });
    notify(other.id, { title: 'Vous êtes liés', body: `${me.name} est maintenant ton binôme.`, url: '/#/partner', tag: 'pair' }, 'social');
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
    return db.all(`${GOAL_SELECT} WHERE g.assignee_id = ? AND g.day BETWEEN ? AND ? ORDER BY g.period, g.day, g.id`, uid, from, to);
  });

  // who = "partner" (par défaut) : objectif fixé à mon binôme. who = "me" : objectif perso.
  route('POST', '/goals', ({ me, body }) => {
    const who = body.who === 'me' ? 'me' : 'partner';
    const assignee = target(me, who);
    const title = text(body.title, 'Objectif', 1, 120);
    const details = text(body.details, 'Détails', 0, 1000);
    const difficulty = intIn(body.difficulty ?? 1, 1, 3, 'Difficulté');
    const skillId = skillFor(body.skillId, assignee);
    const period = body.period === 'week' ? 'week' : 'day';
    const goalTarget = parseTarget(body.target);
    const unit = goalTarget == null ? '' : text(body.unit, 'Unité', 0, 20);
    const raw = Array.isArray(body.days) ? body.days : [];
    raw.forEach((d) => day(d, 'Jour'));
    const days = [...new Set(raw.map((d) => normalizeDay(period, d)))];
    if (!days.length || days.length > 60) fail(400, 'Choisis entre 1 et 60 jours');
    const seriesId = days.length > 1 ? crypto.randomUUID() : null;

    const created = db.tx(() => days.map((d) => db.run(
      `INSERT INTO goals (assignee_id, author_id, skill_id, title, details, day, period, difficulty, target, unit, series_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assignee, me.id, skillId, title, details, d, period, difficulty, goalTarget, unit, seriesId,
    ).lastInsertRowid));

    if (who === 'partner') {
      notify(assignee, {
        title: `${me.name} t'a fixé ${created.length > 1 ? plural(created.length, 'objectif') : 'un objectif'}`,
        body: title,
        url: '/#/today',
        tag: 'goals',
      }, 'goals');
    }
    return { created: created.length };
  });

  route('PATCH', '/goals/:id', ({ me, body, params, today }) => {
    const g = visibleGoal(me, params.id);
    const isDoer = g.assignee_id === me.id;
    const isAuthor = g.author_id === me.id;
    const set = {};
    let status;

    if (isDoer) {
      if (body.progress !== undefined && g.target != null) {
        set.progress = amount(body.progress, 'Progression', { max: 1e7 });
        status = statusFromProgress(set.progress, g.target);
      } else if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) fail(400, 'Statut invalide');
        status = body.status;
        if (g.target != null && status === 'done') set.progress = Math.max(g.progress, g.target);
        if (g.target != null && status === 'todo') set.progress = 0;
      }
    }
    if (isAuthor) {
      if (body.title !== undefined) set.title = text(body.title, 'Objectif', 1, 120);
      if (body.details !== undefined) set.details = text(body.details, 'Détails', 0, 1000);
      if (body.difficulty !== undefined) set.difficulty = intIn(body.difficulty, 1, 3, 'Difficulté');
      if (body.skillId !== undefined) set.skill_id = skillFor(body.skillId, g.assignee_id);
      if (body.day !== undefined) set.day = normalizeDay(g.period, day(body.day, 'Jour'));
      if (body.target !== undefined) {
        set.target = parseTarget(body.target);
        set.unit = set.target == null ? '' : text(body.unit ?? g.unit, 'Unité', 0, 20);
        if (set.target != null) status = statusFromProgress(set.progress ?? g.progress, set.target);
      } else if (body.unit !== undefined && g.target != null) {
        set.unit = text(body.unit, 'Unité', 0, 20);
      }
    }
    // Le binôme de la personne qui réalise peut réagir.
    let newReaction = null;
    if (!isDoer && body.reaction !== undefined) {
      if (body.reaction !== '' && !REACTIONS[body.reaction]) fail(400, 'Réaction invalide');
      set.reaction = body.reaction;
      if (body.reaction && body.reaction !== g.reaction) newReaction = body.reaction;
    }
    if (status !== undefined && status !== g.status) {
      set.status = status;
      set.done_at = status === 'todo' ? null : new Date().toISOString();
    }

    const cols = Object.keys(set);
    if (cols.length) {
      db.run(`UPDATE goals SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(set), g.id);
    }

    let newBadges = [];
    if (set.status === 'done' && isDoer) {
      const partnerId = me.partner_id;
      if (g.period === 'week') {
        notify(partnerId, { title: `${me.name} a atteint son objectif de la semaine`, body: g.title, url: '/#/partner', tag: `done-${g.id}` }, 'social');
      } else {
        const left = db.get(
          "SELECT COUNT(*) AS n FROM goals WHERE assignee_id = ? AND period = 'day' AND day = ? AND status <> 'done'",
          me.id, g.day,
        ).n;
        if (!left) notify(partnerId, { title: `${me.name} a bouclé sa journée`, body: 'Tous ses objectifs sont atteints. Envoie-lui un bravo !', url: '/#/partner', tag: `day-${g.day}` }, 'social');
      }
    }
    if (isDoer && set.status) newBadges = checkBadges(me.id, today);
    if (newReaction) {
      notify(g.assignee_id, { title: `${me.name} : ${REACTIONS[newReaction]}`, body: `sur « ${g.title} »`, url: '/#/today', tag: `react-${g.id}` }, 'social');
      newBadges = checkBadges(me.id, today);
    }
    return { ...goalView(g.id), newBadges };
  });

  route('DELETE', '/goals/:id', ({ me, params, query }) => {
    const g = visibleGoal(me, params.id);
    if (g.author_id !== me.id) fail(403, "Seul l'auteur peut supprimer cet objectif");
    if (query.get('scope') === 'series' && g.series_id) {
      // Supprime celui-ci + les répétitions à venir pas encore commencées.
      const where = `series_id = ? AND author_id = ? AND (id = ? OR (day >= ? AND status = 'todo'))`;
      const photos = db.all(`SELECT photo FROM goals WHERE ${where} AND photo IS NOT NULL`, g.series_id, me.id, g.id, g.day);
      const r = db.run(`DELETE FROM goals WHERE ${where}`, g.series_id, me.id, g.id, g.day);
      photos.forEach((p) => removePhoto(p.photo));
      return { deleted: r.changes };
    }
    db.run('DELETE FROM goals WHERE id = ?', g.id);
    removePhoto(g.photo);
    return { deleted: 1 };
  });

  // --- Preuve photo -----------------------------------------------------------
  route('PUT', '/goals/:id/photo', ({ me, params, raw, today }) => {
    const g = visibleGoal(me, params.id);
    if (g.assignee_id !== me.id) fail(403, 'Seule la personne qui réalise peut ajouter une preuve');
    const ext = imageExt(raw);
    if (!ext) fail(415, "Format d'image non pris en charge (JPEG, PNG ou WebP)");
    const name = `${crypto.randomUUID()}.${ext}`;
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, name), raw);
    db.run('UPDATE goals SET photo = ? WHERE id = ?', name, g.id);
    removePhoto(g.photo);
    notify(me.partner_id, { title: `${me.name} a ajouté une preuve photo`, body: g.title, url: '/#/partner', tag: `photo-${g.id}` }, 'social');
    return { photo: name, newBadges: checkBadges(me.id, today) };
  }, { raw: true });

  route('DELETE', '/goals/:id/photo', ({ me, params }) => {
    const g = visibleGoal(me, params.id);
    if (g.assignee_id !== me.id) fail(403, 'Accès refusé');
    db.run('UPDATE goals SET photo = NULL WHERE id = ?', g.id);
    removePhoto(g.photo);
    return { photo: null };
  });

  route('GET', '/photos/:name', ({ me, params, res }) => {
    if (!PHOTO_RE.test(params.name)) fail(404, 'Photo introuvable');
    const g = db.get('SELECT assignee_id FROM goals WHERE photo = ?', params.name);
    if (!g || (g.assignee_id !== me.id && g.assignee_id !== me.partner_id)) fail(404, 'Photo introuvable');
    const file = path.join(uploadsDir, params.name);
    if (!fs.existsSync(file)) fail(404, 'Photo introuvable');
    res.writeHead(200, {
      'Content-Type': PHOTO_TYPES[params.name.split('.').pop()],
      'Cache-Control': 'private, max-age=604800, immutable',
    });
    fs.createReadStream(file).pipe(res);
    return HANDLED;
  });

  // --- Discussion -------------------------------------------------------------
  route('GET', '/goals/:id/messages', ({ me, params }) => {
    const g = visibleGoal(me, params.id);
    return db.all(
      `SELECT m.id, m.author_id AS authorId, u.name AS authorName, m.body, m.created_at AS createdAt
       FROM messages m JOIN users u ON u.id = m.author_id WHERE m.goal_id = ? ORDER BY m.id`,
      g.id,
    );
  });

  route('POST', '/goals/:id/messages', ({ me, params, body, today }) => {
    const g = visibleGoal(me, params.id);
    const message = text(body.body, 'Message', 1, 1000);
    const { lastInsertRowid: id } = db.run('INSERT INTO messages (goal_id, author_id, body) VALUES (?, ?, ?)', g.id, me.id, message);
    const other = g.assignee_id === me.id ? me.partner_id : g.assignee_id;
    notify(other, {
      title: `${me.name} · ${truncate(g.title, 40)}`,
      body: truncate(message, 140),
      url: other === g.assignee_id ? '/#/today' : '/#/partner',
      tag: `msg-${g.id}`,
    }, 'social');
    return {
      message: db.get(
        `SELECT m.id, m.author_id AS authorId, u.name AS authorName, m.body, m.created_at AS createdAt
         FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?`,
        id,
      ),
      newBadges: g.assignee_id === me.id ? [] : checkBadges(me.id, today),
    };
  });

  // =========================================================================
  // Compétences, badges, calendrier
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
    const icon = ICON_RE.test(body.icon || '') ? body.icon : 'star';
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

  route('GET', '/badges', ({ me, query, today }) => {
    const { badges: list } = badges.check(target(me, query.get('who')), today);
    return { badges: list, unlocked: list.filter((b) => b.unlocked).length };
  });

  route('GET', '/calendar', ({ me, query, today }) => {
    const uid = target(me, query.get('who'));
    const m = /^(\d{4})-(\d{2})$/.exec(query.get('month') || today.slice(0, 7));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) fail(400, 'Mois invalide');
    const first = `${m[1]}-${m[2]}-01`;
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10);
    const rows = db.all(
      "SELECT day, period, status, difficulty FROM goals WHERE assignee_id = ? AND period = 'day' AND day BETWEEN ? AND ?",
      uid, first, last,
    );
    const days = [];
    for (let d = first; d <= last; d = L.addDays(d, 1)) {
      const { total, done, partial, missed, rate } = stats(rows.filter((g) => g.day === d), today);
      days.push({ day: d, total, done, partial, missed, rate });
    }
    const all = stats(rows, today);
    return {
      month: `${m[1]}-${m[2]}`,
      days,
      summary: {
        active: days.filter((d) => d.done + d.partial > 0).length,
        perfect: days.filter((d) => d.total && d.done === d.total).length,
        rate: all.rate,
        done: all.done,
      },
    };
  });

  // =========================================================================
  // Bilan hebdomadaire
  // =========================================================================
  route('GET', '/report', ({ me, query, today: headerToday }) => {
    const uid = target(me, query.get('who'));
    const today = L.isDay(query.get('today')) ? query.get('today') : headerToday;
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
  // Notifications push
  // =========================================================================
  route('GET', '/push/key', () => {
    if (!push) fail(503, 'Notifications indisponibles');
    return { publicKey: push.publicKey };
  });

  route('POST', '/push/subscribe', ({ me, body }) => {
    const sub = body.subscription || {};
    if (!isValidEndpoint(sub.endpoint)) fail(400, 'Service de notification non reconnu');
    const p256dh = String(sub.keys?.p256dh || '');
    const auth = String(sub.keys?.auth || '');
    if (Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(auth, 'base64url').length !== 16) fail(400, 'Abonnement invalide');
    db.run(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      sub.endpoint, me.id, p256dh, auth,
    );
    return { ok: true };
  });

  route('POST', '/push/unsubscribe', ({ me, body }) => {
    db.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', String(body.endpoint || ''), me.id);
    return { ok: true };
  });

  route('POST', '/push/test', async ({ me }) => {
    if (!push) fail(503, 'Notifications indisponibles');
    const delivered = await push.notify(me.id, {
      title: 'Notifications activées',
      body: 'Tu recevras ici les nouvelles de ton binôme.',
      url: '/#/profile',
      tag: 'test',
    });
    if (!delivered) fail(502, "La notification n'a pas pu être envoyée. Réactive les notifications sur cet appareil.");
    return { delivered };
  });

  // Rappels programmés : vérifiés toutes les 5 minutes, à l'heure locale de chacun.
  function tick() {
    if (!push) return;
    const users = db.all(
      'SELECT DISTINCT u.id, u.timezone, u.last_reminder, u.last_weekly FROM users u JOIN push_subscriptions p ON p.user_id = u.id',
    );
    for (const u of users) {
      const t = localParts(u.timezone);
      if (t.hour >= 20 && t.hour < 23 && u.last_reminder !== t.day) {
        db.run('UPDATE users SET last_reminder = ? WHERE id = ?', t.day, u.id);
        const left = db.get(
          "SELECT COUNT(*) AS n FROM goals WHERE assignee_id = ? AND period = 'day' AND day = ? AND status <> 'done'",
          u.id, t.day,
        ).n;
        if (left) {
          notify(u.id, {
            title: 'Encore un petit effort',
            body: `Il te reste ${plural(left, 'objectif')} pour aujourd'hui.`,
            url: '/#/today',
            tag: 'reminder',
          }, 'reminder');
        }
      }
      if (t.weekday === 'Sun' && t.hour >= 18 && u.last_weekly !== t.day) {
        db.run('UPDATE users SET last_weekly = ? WHERE id = ?', t.day, u.id);
        const s = buildReport(u.id, t.day, t.day).summary;
        if (s.total) {
          notify(u.id, {
            title: 'Ton bilan de la semaine est prêt',
            body: s.rate == null ? `${plural(s.done, 'objectif')} réussi${s.done > 1 ? 's' : ''}.` : `${s.rate} % de réussite, ${s.done} objectifs faits sur ${s.total}.`,
            url: '/#/week',
            tag: 'weekly',
          }, 'weekly');
        }
      }
    }
  }

  function startScheduler() {
    setInterval(() => {
      try {
        tick();
      } catch (err) {
        console.error('[rappels]', err);
      }
    }, 5 * 60e3).unref();
  }

  // =========================================================================
  // Routage
  // =========================================================================
  async function handle(req, res, url) {
    const pathname = url.pathname.replace(/^\/api/, '') || '/';
    const candidates = routes.filter((r) => r.re.test(pathname));
    if (!candidates.length) return sendJson(res, 404, { error: 'Route inconnue' });
    const r = candidates.find((c) => c.method === req.method);
    if (!r) return sendJson(res, 405, { error: 'Méthode non autorisée' });

    try {
      const m = r.re.exec(pathname);
      const localDay = req.headers['x-local-day'];
      const ctx = {
        res,
        query: url.searchParams,
        params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])),
        ip: clientIp(req),
        today: L.isDay(localDay) ? localDay : L.localToday(),
        body: {},
      };
      if (r.auth) {
        Object.assign(ctx, authenticate(req));
        if (!ctx.me) fail(401, 'Session expirée, reconnecte-toi');
        // Mémorise le fuseau horaire de l'utilisateur pour les rappels programmés.
        const tz = req.headers['x-timezone'];
        if (tz && tz !== ctx.me.timezone && isTimeZone(tz)) db.run('UPDATE users SET timezone = ? WHERE id = ?', tz, ctx.me.id);
      }
      if (r.raw) ctx.raw = await readBody(req, MAX_PHOTO);
      else if (['POST', 'PUT', 'PATCH'].includes(req.method)) ctx.body = await readJson(req);
      const out = await r.handler(ctx);
      if (out === HANDLED) return undefined;
      return out === undefined ? sendJson(res, 204) : sendJson(res, 200, out);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      throw err;
    }
  }

  const purgeSessions = () => db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());

  /**
   * Enregistre en silence les badges déjà mérités par les comptes qui ont un historique
   * mais aucun badge (ex. juste après la mise à jour) : seuls les suivants seront fêtés.
   */
  function backfillBadges() {
    const users = db.all(
      `SELECT u.id FROM users u
       WHERE NOT EXISTS (SELECT 1 FROM user_badges b WHERE b.user_id = u.id)
         AND EXISTS (SELECT 1 FROM goals g WHERE g.assignee_id = u.id AND g.status = 'done')`,
    );
    for (const u of users) badges.check(u.id, L.localToday());
    return users.length;
  }

  return { handle, purgeSessions, startScheduler, tick, backfillBadges };
}

module.exports = { createApi, sendJson };
