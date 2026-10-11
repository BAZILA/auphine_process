// Briques d'interface : échappement, icônes, toasts, feuilles modales, délégation d'événements.

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || name;
export const initial = (name = '') => (name.trim()[0] || '?').toUpperCase();

// ---------------------------------------------------------------------------
// Icônes (traits 24×24, couleur héritée)
// ---------------------------------------------------------------------------
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.6c2.2.2 3.6 1.6 4.1 4"/>',
  chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="5" width="3" height="13" rx="1"/><rect x="16" y="14" width="3" height="4" rx="1"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
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
};

export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const logo = (size = 40) => `
  <svg class="logo" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#ff7a59"/>
    </linearGradient></defs>
    <rect width="48" height="48" rx="13" fill="url(#logo-g)"/>
    <circle cx="19" cy="24" r="9" fill="none" stroke="#fff" stroke-width="3.6"/>
    <circle cx="29" cy="24" r="9" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3.6"/>
  </svg>`;

// ---------------------------------------------------------------------------
// Constantes métier côté interface
// ---------------------------------------------------------------------------
export const DIFFICULTY = {
  1: { label: 'Facile', xp: 10 },
  2: { label: 'Moyen', xp: 20 },
  3: { label: 'Difficile', xp: 30 },
};
export const REACTIONS = ['👏', '🔥', '💪', '❤️', '😅', '🌟'];
export const STATE_LABEL = { done: 'Fait', partial: 'Partiel', missed: 'Manqué', todo: 'À faire' };
export const PALETTE = ['#5b4bdb', '#ff7a59', '#1fa971', '#e9a23b', '#2f9be0', '#d94f9c', '#7c8cff', '#14b8a6'];
export const SKILL_ICONS = ['⭐', '🏃', '💪', '📚', '🗣️', '🧘', '💻', '🎵', '🍳', '💰', '😴', '💧', '✍️', '🎨', '🧠', '❤️', '🌱', '💼'];

/** État affiché d'un objectif : un objectif passé non fait devient « manqué ». */
export function goalState(goal, todayStr) {
  if (goal.status === 'done' || goal.status === 'partial') return goal.status;
  return goal.day < todayStr ? 'missed' : 'todo';
}

export const goalXp = (g) => (g.status === 'done' ? DIFFICULTY[g.difficulty].xp : g.status === 'partial' ? DIFFICULTY[g.difficulty].xp / 2 : 0);

/** Devine une icône à partir du nom d'une compétence. */
export function guessIcon(name) {
  const n = name.toLowerCase();
  const rules = [
    [/sport|course|run|muscu|fitness|gym|vélo|velo|natation/, '🏃'],
    [/lect|livre|lire/, '📚'],
    [/anglais|langue|espagnol|allemand|parler|oral/, '🗣️'],
    [/médit|medit|yoga|calme|stress|bien-être|bien etre/, '🧘'],
    [/code|dev|program|informatique|tech/, '💻'],
    [/musique|piano|guitare|chant/, '🎵'],
    [/cuisine|repas|nutrition|manger/, '🍳'],
    [/argent|budget|finance|épargne|epargne/, '💰'],
    [/sommeil|dormir|repos/, '😴'],
    [/eau|hydrat|santé|sante/, '💧'],
    [/écri|ecri|journal|blog/, '✍️'],
    [/dessin|art|créa|crea|photo/, '🎨'],
    [/travail|pro|carrière|carriere|business/, '💼'],
    [/étude|etude|cours|révision|revision|apprend/, '🧠'],
  ];
  return (rules.find(([re]) => re.test(n)) || [null, '⭐'])[1];
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
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
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

export function openSheet({ title, html, handlers = {}, onClose }) {
  const root = document.createElement('div');
  root.className = 'sheet-backdrop';
  root.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
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
    root.querySelector('.sheet-body input:not([type=radio]):not([type=checkbox]), .sheet-body textarea')?.focus({ preventScroll: true });
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
      <span class="ring-label">${esc(text)}</span>
    </div>`;
}

export function segmented(action, options, value, label = '') {
  return `
    <div class="seg" role="group" ${label ? `aria-label="${esc(label)}"` : ''}>
      ${options.map((o) => `
        <button type="button" class="${o.value === value ? 'on' : ''}" aria-pressed="${o.value === value}"
          data-action="${action}" data-value="${esc(o.value)}" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}
    </div>`;
}

export const skillTag = (name, iconChar, color) =>
  `<span class="tag" style="--c:${esc(color || '#5b4bdb')}">${esc(iconChar)} ${esc(name)}</span>`;

export const emptyState = (emoji, title, text, action = '') => `
  <div class="empty">
    <div class="empty-emoji" aria-hidden="true">${emoji}</div>
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
    toast('Copié dans le presse-papiers ✔', 'success');
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
