// Point d'entrée : authentification, navigation (hash), rendu des vues.
import { get, hasToken } from './api.js';
import { state, setProfile } from './state.js';
import { esc, icon, logo, delegate, sheetOpen } from './ui.js';
import { renderAuth } from './views/auth.js';
import { TodayView } from './views/today.js';
import { PartnerView } from './views/partner.js';
import { WeekView } from './views/week.js';
import { ProgressView } from './views/progress.js';
import { ProfileView } from './views/profile.js';
import { syncPush } from './push.js';

const ROUTES = [
  { id: 'today', label: "Aujourd'hui", icon: 'sun', view: TodayView },
  { id: 'partner', label: 'Binôme', icon: 'users', view: PartnerView },
  { id: 'week', label: 'Bilan', icon: 'chart', view: WeekView },
  { id: 'progress', label: 'Progrès', icon: 'trophy', view: ProgressView },
  { id: 'profile', label: 'Profil', icon: 'user', view: ProfileView },
];

const root = document.getElementById('app');
const ctx = { rerender: () => render() };
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
      ${ROUTES.map((r) => `<a href="#/${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${r.label}</span></a>`).join('')}
    </nav>
    <main class="main" id="main" tabindex="-1"></main>
  </div>`;

async function loadProfile() {
  setProfile(await get('/me'));
  lastSync = Date.now();
}

async function render() {
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
    root.onclick = root.onsubmit = root.onchange = null;
    root.innerHTML = shell();
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
  if (routeChanged) main.innerHTML = '<div class="boot"><span class="spinner"></span></div>';

  try {
    const view = await route.view(ctx);
    if (seq !== renderSeq) return; // une navigation plus récente a pris le relais
    main.onclick = main.onsubmit = main.onchange = null;
    main.dataset.route = route.id;
    main.innerHTML = view.html;
    view.bind?.(main);
    if (routeChanged) window.scrollTo(0, 0);
  } catch (err) {
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
        render();
      },
    });
  }
}

async function boot() {
  window.addEventListener('hashchange', render);
  window.addEventListener('auth:lost', () => {
    state.me = null;
    state.partner = null;
    render();
  });
  // Au retour sur l'appli, on resynchronise (ton binôme a pu te fixer de nouveaux objectifs).
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !state.me || sheetOpen() || Date.now() - lastSync < 15000) return;
    try {
      await loadProfile();
      render();
    } catch { /* hors ligne : on garde l'affichage actuel */ }
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Clic sur une notification alors que l'appli est déjà ouverte : on va à la bonne page.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'navigate' && e.data.hash) {
        if (location.hash === e.data.hash) render();
        else location.hash = e.data.hash;
      }
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
  render();
}

boot();
