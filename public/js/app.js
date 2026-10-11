// Point d'entrée : authentification, navigation (hash), rendu des vues.
import { get, hasToken, useCache } from './api.js';
import { state, setProfile } from './state.js';
import { esc, icon, logo, delegate, sheetOpen, toast, cycleTheme, getTheme, THEMES } from './ui.js';
import { renderAuth } from './views/auth.js';
import { TodayView } from './views/today.js';
import { PartnerView } from './views/partner.js';
import { WeekView } from './views/week.js';
import { ProgressView } from './views/progress.js';
import { ProfileView } from './views/profile.js';
import { AdminView } from './views/admin.js';
import { openNotifications } from './views/notifications.js';
import { syncPush } from './push.js';

const ROUTES = [
  { id: 'today', label: "Aujourd'hui", icon: 'sun', view: TodayView },
  { id: 'partner', label: 'Binôme', icon: 'users', view: PartnerView },
  { id: 'week', label: 'Bilan', icon: 'chart', view: WeekView },
  { id: 'progress', label: 'Progrès', icon: 'trophy', view: ProgressView },
  { id: 'profile', label: 'Profil', icon: 'user', view: ProfileView },
  { id: 'admin', label: 'Administration', icon: 'shield', view: AdminView, adminOnly: true },
];

const root = document.getElementById('app');
const ctx = { rerender: (opts) => render(opts) };
let renderSeq = 0;
let lastSync = Date.now();

function currentRoute() {
  const id = location.hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r.id === id) || ROUTES[0];
}

const shell = () => `
  <div class="shell">
    <nav class="nav" aria-label="Navigation principale">
      <div class="brand">${logo(34)}<span>Auphine</span></div>
      ${ROUTES.map((r) => `<a href="#/${r.id}" data-route="${r.id}" class="${r.adminOnly ? 'nav-admin' : ''}" ${r.adminOnly && !state.me?.isAdmin ? 'hidden' : ''}>${icon(r.icon)}<span>${r.label}</span></a>`).join('')}
    </nav>
    <div class="content">
      <header class="topbar">
        <a class="topbar-brand" href="#/today">${logo(28)}<span>Auphine</span></a>
        <div class="topbar-actions">
          <button type="button" class="top-btn" data-action="theme" aria-label="Changer de thème">${themeIcon()}</button>
          <button type="button" class="top-btn bell" data-action="bell" aria-label="Notifications">
            ${icon('bell')}<span class="bell-count" hidden></span>
          </button>
        </div>
      </header>
      <div class="update-bar" hidden>
        ${icon('sparkles')}<span>Une nouvelle version d'Auphine est disponible.</span>
        <button type="button" class="btn btn-sm btn-primary" data-action="update">Mettre à jour</button>
      </div>
      <main class="main" id="main" tabindex="-1"></main>
    </div>
  </div>`;

const themeIcon = () => icon(THEMES[getTheme()].icon);

/** Pastille de la cloche : nombre de notifications non lues. */
function updateBell() {
  const badge = root.querySelector('.bell-count');
  if (!badge || !state.me) return;
  const n = state.me.unread || 0;
  badge.hidden = !n;
  badge.textContent = n > 9 ? '9+' : String(n);
  root.querySelector('.bell')?.setAttribute('aria-label', n ? `Notifications : ${n} non lue${n > 1 ? 's' : ''}` : 'Notifications');
  root.querySelector('.nav-admin')?.toggleAttribute('hidden', !state.me.isAdmin);
}

async function loadProfile() {
  setProfile(await get('/me'));
  lastSync = Date.now();
  updateBell();
}

function bindShell() {
  delegate(root.querySelector('.topbar'), {
    theme: (el) => {
      const next = cycleTheme();
      el.innerHTML = themeIcon();
      toast(`Thème : ${THEMES[next].label.toLowerCase()}`, 'info', THEMES[next].icon);
      if (currentRoute().id === 'profile') render();
    },
    bell: () => openNotifications({ onRead: updateBell }),
  });
  delegate(root.querySelector('.update-bar'), { update: applyUpdate });
}

async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch { /* on recharge quand même */ }
  location.reload();
}

/**
 * Affiche la vue courante. Par défaut, les données déjà en cache s'affichent tout de suite,
 * puis la vue est recalculée avec des données fraîches et remplacée si elle a changé.
 */
async function render({ fresh = false } = {}) {
  if (!state.me) {
    root.dataset.mode = 'auth';
    renderAuth(root, {
      onAuthed: (res) => {
        setProfile(res);
        location.hash = '#/today';
        render();
        syncPush();
      },
    });
    return;
  }
  if (root.dataset.mode !== 'app') {
    root.dataset.mode = 'app';
    root.onclick = root.onsubmit = root.onchange = root.oninput = null;
    root.innerHTML = shell();
    bindShell();
    updateBell();
  }

  const route = currentRoute();
  for (const a of root.querySelectorAll('.nav a')) {
    const active = a.dataset.route === route.id;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  const main = root.querySelector('.main');
  const seq = ++renderSeq;
  const routeChanged = main.dataset.route !== route.id;
  // Le spinner n'apparaît que si le chargement dure : pas de clignotement sur un écran déjà en cache.
  const spinnerTimer = routeChanged
    ? setTimeout(() => {
      if (seq === renderSeq) main.innerHTML = '<div class="boot"><span class="spinner"></span></div>';
    }, 180)
    : null;

  const paint = (view, { enter = false } = {}) => {
    main.onclick = main.onsubmit = main.onchange = main.oninput = null;
    main.dataset.route = route.id;
    main.innerHTML = view.html;
    main.classList.toggle('enter', enter);
    view.bind?.(main);
  };

  try {
    useCache(!fresh);
    const view = await route.view(ctx);
    const fromCache = useCache(false) > 0;
    clearTimeout(spinnerTimer);
    if (seq !== renderSeq) return;
    paint(view, { enter: routeChanged });
    if (routeChanged) window.scrollTo(0, 0);

    // Affiché depuis le cache : on vérifie en arrière-plan si les données ont changé.
    if (fromCache) {
      const freshView = await route.view(ctx);
      if (seq === renderSeq && freshView.html !== view.html && !sheetOpen()) paint(freshView);
    }
  } catch (err) {
    useCache(false);
    clearTimeout(spinnerTimer);
    if (seq !== renderSeq || err.status === 401) return;
    main.dataset.route = '';
    main.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${icon('alert')}</div>
        <p class="empty-title">Oups, quelque chose a coincé</p>
        <p class="muted">${esc(err.message)}</p>
        <button type="button" class="btn btn-primary" data-action="retry">${icon('refresh')} Réessayer</button>
      </div>`;
    delegate(main, {
      retry: async () => {
        await loadProfile().catch(() => null);
        render({ fresh: true });
      },
    });
  }
}

/** Précharge les autres onglets pendant que le téléphone ne fait rien : la navigation devient instantanée. */
function prefetch() {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
  idle(async () => {
    for (const r of ROUTES.filter((x) => ['today', 'partner', 'week', 'progress'].includes(x.id))) {
      if (r.id === currentRoute().id) continue;
      try {
        await r.view(ctx);
      } catch { /* sans importance */ }
    }
  });
}

/** Rafraîchit le profil (pastille de la cloche, binôme) sans gêner l'utilisateur. */
async function refreshProfile() {
  if (document.hidden || !state.me) return;
  try {
    const before = JSON.stringify([state.partner, state.me.isAdmin]);
    await loadProfile();
    if (before !== JSON.stringify([state.partner, state.me.isAdmin]) && !sheetOpen()) render({ fresh: true });
  } catch { /* hors ligne : on garde l'affichage actuel */ }
}

async function boot() {
  window.addEventListener('hashchange', () => render());
  window.addEventListener('auth:lost', () => {
    state.me = null;
    state.partner = null;
    render();
  });
  window.addEventListener('app:update', () => {
    const bar = root.querySelector('.update-bar');
    if (bar) bar.hidden = false;
  });
  // Au retour sur l'appli, on resynchronise (ton binôme a pu te fixer de nouveaux objectifs).
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !state.me || sheetOpen() || Date.now() - lastSync < 15000) return;
    try {
      await loadProfile();
      render({ fresh: true });
    } catch { /* hors ligne */ }
  });
  setInterval(refreshProfile, 60000);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      // Clic sur une notification alors que l'appli est ouverte : on va à la bonne page.
      if (e.data?.type === 'navigate' && e.data.hash) {
        if (location.hash === e.data.hash) render({ fresh: true });
        else location.hash = e.data.hash;
      }
      // Notification reçue pendant que l'appli est ouverte : la cloche se met à jour.
      if (e.data?.type === 'push') refreshProfile();
    });
  }

  if (hasToken()) {
    try {
      await loadProfile();
      syncPush();
    } catch {
      state.me = null; // jeton expiré ou serveur injoignable : retour à la connexion
    }
  }
  await render();
  if (state.me) prefetch();
}

boot();
