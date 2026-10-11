// Briques d'interface : échappement, icônes, toasts, feuilles modales, délégation d'événements.

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || name;
export const initial = (name = '') => (name.trim()[0] || '?').toUpperCase();

const numberFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const fmtNum = (n) => numberFmt.format(Number(n) || 0);

// ---------------------------------------------------------------------------
// Icônes (traits 24×24, couleur héritée) — aucune image ni emoji
// ---------------------------------------------------------------------------
const ICONS = {
  // navigation et actions
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.6c2.2.2 3.6 1.6 4.1 4"/>',
  chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="5" width="3" height="13" rx="1"/><rect x="16" y="14" width="3" height="4" rx="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-6.5 18-4.5-7-7-4.5z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  'bell-off': '<path d="M8.7 3.7A6 6 0 0 1 18 8c0 2.6.4 4.6 1 6M17 17H3s3-2 3-9c0-.6.1-1.2.3-1.8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0M3 3l18 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  'trending-up': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  'trending-down': '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  sparkles: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  circle: '<circle cx="12" cy="12" r="5"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
  'user-x': '<circle cx="9" cy="8" r="4"/><path d="M2 21c1-4 3.6-6 7-6 1.6 0 3 .4 4.2 1.2M16 15l5 5M21 15l-5 5"/>',  // récompenses
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="M8.5 10.2L6 3h4l2 5M15.5 10.2L18 3h-4l-2 5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  mountain: '<path d="M3 20l6.5-12 4 7 2.5-4 5 9z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4-10-2 1.5-3 3.5-3 5.5C10.5 9 9.5 8 9 6.5 6.5 8.5 5 11.5 5 15c0 4.3 3 7 7 7z"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  thumbs: '<path d="M7 11v10H4V11z"/><path d="M7 11l4-8a2.2 2.2 0 0 1 2.6 2.4L13 10h5.5a2 2 0 0 1 2 2.4l-1.5 7a2.5 2.5 0 0 1-2.4 1.6H7"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.3-9.3A5 5 0 0 1 12 7a5 5 0 0 1 9.3 3.7C19.5 15.4 12 20 12 20z"/>',
  // compétences
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  book: '<path d="M2 5.5c3-1.3 6.5-1.3 10 1 3.5-2.3 7-2.3 10-1v13.5c-3-1.3-6.5-1.3-10 1-3.5-2.3-7-2.3-10-1z"/><path d="M12 6.5v13.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.5 3.7 5.5 3.7 9s-1.3 6.5-3.7 9c-2.4-2.5-3.7-5.5-3.7-9S9.6 5.5 12 3z"/>',
  leaf: '<path d="M5 20c-.5-8.5 4.5-14.5 15-16 .5 10-4.5 15.5-12 15.5"/><path d="M5 20c2.5-5 6-8.5 10.5-11"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  utensils: '<path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18"/><path d="M19 21V3c-2.5 1.5-4 4.5-4 8v3h4"/>',
  wallet: '<path d="M17 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1"/><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M16 13.5h.01"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  droplet: '<path d="M12 3c3.6 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.4-6.8 6-11z"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8.2-9-8.2z"/><path d="M7.5 11h.01M10 7h.01M15 7.5h.01"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2v.5h5V16c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.circle}</svg>`;

let logoCount = 0;
export const logo = (size = 40) => {
  const id = `logo-g${++logoCount}`; // un dégradé par logo : un logo masqué ne doit pas priver les autres de couleur
  return `
  <svg class="logo" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#ff7a59"/>
    </linearGradient></defs>
    <rect width="48" height="48" rx="13" fill="url(#${id})"/>
    <circle cx="19" cy="24" r="9" fill="none" stroke="#fff" stroke-width="3.6"/>
    <circle cx="29" cy="24" r="9" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3.6"/>
  </svg>`;
};

// ---------------------------------------------------------------------------
// Constantes métier côté interface
// ---------------------------------------------------------------------------
export const DIFFICULTY = {
  1: { label: 'Facile', xp: 10 },
  2: { label: 'Moyen', xp: 20 },
  3: { label: 'Difficile', xp: 30 },
};
export const REACTIONS = [
  { key: 'bravo', label: 'Bravo', icon: 'thumbs' },
  { key: 'fire', label: 'En feu', icon: 'flame' },
  { key: 'strong', label: 'Costaud', icon: 'zap' },
  { key: 'love', label: "J'adore", icon: 'heart' },
  { key: 'courage', label: 'Courage', icon: 'smile' },
  { key: 'star', label: 'Au top', icon: 'star' },
];
export const reactionOf = (key) => REACTIONS.find((r) => r.key === key) || null;
export const STATE_LABEL = { done: 'Fait', partial: 'Partiel', missed: 'Manqué', todo: 'À faire' };
export const PALETTE = ['#5b4bdb', '#f0643f', '#17a067', '#d48a1c', '#2f9be0', '#d94f9c', '#7c8cff', '#14b8a6'];
export const SKILL_ICONS = [
  'star', 'activity', 'dumbbell', 'book', 'globe', 'leaf', 'code', 'music', 'utensils',
  'wallet', 'moon', 'droplet', 'pen', 'palette', 'bulb', 'heart', 'briefcase', 'target',
];

/** Jour où l'objectif doit être atteint (le dimanche pour un objectif de la semaine). */
function dueDay(goal) {
  if (goal.period !== 'week') return goal.day;
  const [y, m, d] = goal.day.split('-').map(Number);
  const due = new Date(y, m - 1, d + 6);
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
}

/** État affiché d'un objectif : un objectif échu non fait devient « manqué ». */
export function goalState(goal, todayStr) {
  if (goal.status === 'done' || goal.status === 'partial') return goal.status;
  return dueDay(goal) < todayStr ? 'missed' : 'todo';
}

export const goalXp = (g) => (g.status === 'done' ? DIFFICULTY[g.difficulty].xp : g.status === 'partial' ? DIFFICULTY[g.difficulty].xp / 2 : 0);

/** Devine une icône à partir du nom d'une compétence. */
export function guessIcon(name) {
  const n = name.toLowerCase();
  const rules = [
    [/sport|course|courir|run|vélo|velo|natation|marche|cardio/, 'activity'],
    [/muscu|fitness|gym|force|pompes/, 'dumbbell'],
    [/lect|livre|lire/, 'book'],
    [/anglais|langue|espagnol|allemand|parler|oral|voyage/, 'globe'],
    [/médit|medit|yoga|calme|stress|bien-être|bien etre|nature/, 'leaf'],
    [/code|dev|program|informatique|tech/, 'code'],
    [/musique|piano|guitare|chant/, 'music'],
    [/cuisine|repas|nutrition|manger/, 'utensils'],
    [/argent|budget|finance|épargne|epargne/, 'wallet'],
    [/sommeil|dormir|repos/, 'moon'],
    [/eau|hydrat|santé|sante/, 'droplet'],
    [/écri|ecri|journal|blog/, 'pen'],
    [/dessin|art|créa|crea|photo/, 'palette'],
    [/étude|etude|cours|révision|revision|apprend|école|ecole/, 'bulb'],
    [/travail|pro|carrière|carriere|business/, 'briefcase'],
    [/couple|amour|famille|amis/, 'heart'],
  ];
  return (rules.find(([re]) => re.test(n)) || [null, 'star'])[1];
}

// ---------------------------------------------------------------------------
// Délégation d'événements : data-action (clic), data-form (envoi), data-change
// ---------------------------------------------------------------------------
export function delegate(root, handlers) {
  root.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(el, e);
    }
  };
  root.onsubmit = (e) => {
    const form = e.target.closest('form[data-form]');
    const fn = form && handlers[form.dataset.form];
    if (fn) {
      e.preventDefault();
      fn(form, e);
    }
  };
  root.onchange = (e) => {
    const el = e.target.closest('[data-change]');
    const fn = el && handlers[el.dataset.change];
    if (fn) fn(el, e);
  };
  root.oninput = (e) => {
    const el = e.target.closest('[data-input]');
    const fn = el && handlers[el.dataset.input];
    if (fn) fn(el, e);
  };
}

/** « à l'instant », « il y a 5 min », « hier », « 12 oct. » (date SQL en UTC ou ISO). */
export function timeAgo(value) {
  if (!value) return 'jamais';
  const d = new Date(/[zZ]$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'hier';
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Désactive le bouton pendant l'action et affiche l'erreur éventuelle. */
export async function busy(el, fn) {
  const btn = el.tagName === 'FORM' ? el.querySelector('[type="submit"]') : el;
  if (btn?.disabled) return undefined;
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    return await fn();
  } catch (err) {
    toast(err.message || 'Une erreur est survenue', 'error');
    return undefined;
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer;
export function toast(message, kind = 'info', iconName = null) {
  const el = document.getElementById('toast');
  const ico = iconName || (kind === 'success' ? 'check-circle' : kind === 'error' ? 'alert' : null);
  el.innerHTML = `${ico ? icon(ico) : ''}<span>${esc(message)}</span>`;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 2800);
}

// ---------------------------------------------------------------------------
// Feuilles modales (bottom sheet sur mobile, boîte centrée sur grand écran)
// ---------------------------------------------------------------------------
const sheets = [];
export const sheetOpen = () => sheets.length > 0;

function onSheetKey(e) {
  if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
}

export function openSheet({ title, html, handlers = {}, onClose, className = '' }) {
  const root = document.createElement('div');
  root.className = 'sheet-backdrop';
  root.innerHTML = `
    <div class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-action="close" aria-label="Fermer">${icon('x')}</button>
      </header>
      <div class="sheet-body">${html}</div>
    </div>`;
  const previousFocus = document.activeElement;

  const sheet = {
    el: root,
    close() {
      const i = sheets.indexOf(sheet);
      if (i === -1) return;
      sheets.splice(i, 1);
      root.classList.remove('open');
      if (!sheets.length) {
        document.body.classList.remove('no-scroll');
        document.removeEventListener('keydown', onSheetKey);
      }
      setTimeout(() => root.remove(), 220);
      previousFocus?.focus?.({ preventScroll: true });
      onClose?.();
    },
  };

  root.addEventListener('click', (e) => {
    if (e.target === root) sheet.close();
  });
  delegate(root, { close: () => sheet.close(), ...handlers });

  document.body.appendChild(root);
  if (!sheets.length) {
    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', onSheetKey);
  }
  sheets.push(sheet);
  requestAnimationFrame(() => root.classList.add('open'));
  // Sur ordinateur, on place le curseur dans le premier champ (sur mobile, ça ouvrirait le clavier).
  if (window.matchMedia('(pointer: fine)').matches) {
    root.querySelector('.sheet-body input:not([type=radio]):not([type=checkbox]):not([type=file]), .sheet-body textarea')?.focus({ preventScroll: true });
  }
  return sheet;
}

/** Feuille de choix : résout avec la valeur choisie, ou null si annulé. */
export function choose(message, options, title = 'Confirmation') {
  return new Promise((resolve) => {
    let result = null;
    const sheet = openSheet({
      title,
      html: `
        <p class="confirm-text">${esc(message)}</p>
        <div class="stack">
          ${options.map((o, i) => `<button type="button" class="btn btn-block ${o.kind || 'btn-ghost'}" data-action="pick" data-i="${i}">${esc(o.label)}</button>`).join('')}
          <button type="button" class="btn btn-block btn-ghost" data-action="close">Annuler</button>
        </div>`,
      handlers: {
        pick: (el) => {
          result = options[Number(el.dataset.i)].value;
          sheet.close();
        },
      },
      onClose: () => resolve(result),
    });
  });
}

export const confirmBox = (message, okLabel = 'Confirmer') =>
  choose(message, [{ value: true, label: okLabel, kind: 'btn-danger' }]).then(Boolean);

// ---------------------------------------------------------------------------
// Petits composants visuels
// ---------------------------------------------------------------------------
export function ring(pct, { size = 64, stroke = 7, color = 'var(--primary)', label } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const text = label ?? (pct == null ? '–' : `${Math.round(p)}%`);
  return `
    <div class="ring" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
        <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
          stroke="${color}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(2)}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      ${text ? `<span class="ring-label">${esc(text)}</span>` : ''}
    </div>`;
}

export function segmented(action, options, value, label = '') {
  return `
    <div class="seg" role="group" ${label ? `aria-label="${esc(label)}"` : ''}>
      ${options.map((o) => `
        <button type="button" class="${o.value === value ? 'on' : ''}" aria-pressed="${o.value === value}"
          data-action="${action}" data-value="${esc(o.value)}" ${o.disabled ? 'disabled' : ''}>${o.icon ? icon(o.icon, 'sm') : ''}${esc(o.label)}</button>`).join('')}
    </div>`;
}

export const skillTag = (name, iconName, color) =>
  `<span class="tag" style="--c:${esc(color || '#5b4bdb')}">${icon(iconName, 'xs')}${esc(name)}</span>`;

export const plainTag = (iconName, label, cls = '') => `<span class="tag ${cls}">${icon(iconName, 'xs')}${esc(label)}</span>`;

export const emptyState = (iconName, title, text, action = '') => `
  <div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <p class="empty-title">${esc(title)}</p>
    <p class="muted">${esc(text)}</p>
    ${action}
  </div>`;

export async function shareOrCopy(text, title = 'Auphine') {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié dans le presse-papiers', 'success');
  } catch {
    toast('Copie impossible sur ce navigateur', 'error');
  }
}

// ---------------------------------------------------------------------------
// Thème
// ---------------------------------------------------------------------------
const THEME_KEY = 'auphine.theme';
export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}
export function setTheme(value) {
  try {
    if (value === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, value);
  } catch { /* ignoré */ }
  if (value === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
}

export const THEMES = {
  auto: { label: 'Automatique', icon: 'contrast' },
  light: { label: 'Clair', icon: 'sun' },
  dark: { label: 'Sombre', icon: 'moon' },
};

/** Passe au thème suivant : automatique → clair → sombre → automatique. */
export function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  setTheme(next);
  return next;
}
