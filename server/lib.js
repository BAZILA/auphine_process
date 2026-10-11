'use strict';
// Outils partagés : dates, XP / niveaux, mots de passe, jetons.
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// ---------------------------------------------------------------------------
// Dates : on manipule des chaînes "YYYY-MM-DD" (jour local du client).
// Les calculs se font en UTC pour éviter tout décalage horaire.
// ---------------------------------------------------------------------------
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value) {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant `day`. */
function mondayOf(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(day, -((weekday + 6) % 7));
}

/** Date du jour selon le fuseau du serveur (repli si le client n'en fournit pas). */
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// XP et niveaux
// difficulté 1/2/3 → 10/20/30 XP si fait, la moitié si partiel.
// ---------------------------------------------------------------------------
const XP_PER_POINT = 10;

function goalXp(goal) {
  if (goal.status === 'done') return goal.difficulty * XP_PER_POINT;
  if (goal.status === 'partial') return (goal.difficulty * XP_PER_POINT) / 2;
  return 0;
}

/** Expression SQL équivalente à goalXp() pour l'alias de table `t`. */
const xpSql = (t) =>
  `CASE ${t}.status WHEN 'done' THEN ${t}.difficulty * ${XP_PER_POINT} ` +
  `WHEN 'partial' THEN ${t}.difficulty * ${XP_PER_POINT / 2} ELSE 0 END`;

/** Le niveau n est atteint à 50·n·(n−1) XP : 0, 100, 300, 600, 1000… */
function levelInfo(xp) {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const floor = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, floor, next, progress: (xp - floor) / (next - floor) };
}

// ---------------------------------------------------------------------------
// Sécurité
// ---------------------------------------------------------------------------
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [algo, saltHex, keyHex] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// 32 caractères sans ambiguïté (pas de 0/O, 1/I) : 256 % 32 = 0, donc aucun biais.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newInviteCode(length = 6) {
  let code = '';
  for (const byte of crypto.randomBytes(length)) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

module.exports = {
  isDay, addDays, mondayOf, localToday,
  goalXp, xpSql, levelInfo,
  hashPassword, verifyPassword, newToken, hashToken, newInviteCode,
};
