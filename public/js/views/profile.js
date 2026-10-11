// Vue « Profil » : compte, binôme, notifications, apparence, installation.
import { post, patch, del, setToken } from '../api.js';
import { state, setProfile } from '../state.js';
import { esc, icon, delegate, busy, toast, confirmBox, segmented, getTheme, setTheme, firstName, initial } from '../ui.js';
import { pairCard, pairHandlers } from '../components.js';
import { pushSupported, currentSubscription, enablePush, disablePush } from '../push.js';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const NOTIF_OPTIONS = [
  { key: 'goals', label: 'Nouveaux objectifs', hint: 'Quand ton binôme te fixe un objectif' },
  { key: 'social', label: 'Réactions, messages et photos', hint: 'Quand ton binôme réagit, écrit ou avance' },
  { key: 'reminder', label: 'Rappel du soir', hint: 'À 20 h s\'il te reste des objectifs' },
  { key: 'weekly', label: 'Bilan du dimanche', hint: 'Le dimanche à 18 h' },
  { key: 'badges', label: 'Badges débloqués', hint: 'À chaque nouveau badge' },
];

async function notificationsCard() {
  if (!pushSupported()) {
    if (isIos() && !isStandalone()) {
      return `<p class="small muted">Sur iPhone, installe d'abord l'appli sur l'écran d'accueil (<strong>Partager → Sur l'écran d'accueil</strong>), puis active les notifications depuis l'appli installée.</p>`;
    }
    return '<p class="small muted">Ce navigateur ne gère pas les notifications (une connexion HTTPS est nécessaire).</p>';
  }
  if (Notification.permission === 'denied') {
    return `<p class="small muted">${icon('bell-off', 'sm')} Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis reviens ici.</p>`;
  }
  const sub = await currentSubscription().catch(() => null);
  if (!sub) {
    return `
      <p class="small muted">Sois prévenu·e quand ton binôme te fixe un objectif, réagit ou t'écrit, et reçois un rappel le soir.</p>
      <button type="button" class="btn btn-primary btn-block" data-action="pushOn">${icon('bell')} Activer les notifications</button>`;
  }
  const prefs = state.me.notifPrefs || {};
  return `
    <div class="row between gap">
      <span class="ok-line">${icon('check-circle', 'sm')} Activées sur cet appareil</span>
      <button type="button" class="btn btn-ghost btn-sm" data-action="pushTest">Tester</button>
    </div>
    <div class="switches">
      ${NOTIF_OPTIONS.map((o) => `
        <label class="switch-row">
          <span><strong>${o.label}</strong><span class="small muted">${o.hint}</span></span>
          <span class="switch"><input type="checkbox" data-change="pref" data-key="${o.key}" ${prefs[o.key] !== false ? 'checked' : ''}><span></span></span>
        </label>`).join('')}
    </div>
    <button type="button" class="btn btn-ghost btn-block" data-action="pushOff">${icon('bell-off')} Désactiver sur cet appareil</button>`;
}

export async function ProfileView(ctx) {
  const { me, partner } = state;

  let install;
  if (isStandalone()) install = `<p class="small muted ok-line">${icon('check-circle', 'sm')} Auphine est installée sur cet appareil.</p>`;
  else if (state.installPrompt) install = `<button type="button" class="btn btn-primary btn-block" data-action="install">${icon('download')} Installer l'application</button>`;
  else if (isIos()) install = '<p class="small muted">Sur iPhone : touche <strong>Partager</strong> puis <strong>« Sur l\'écran d\'accueil »</strong>.</p>';
  else install = '<p class="small muted">Depuis le menu de ton navigateur mobile, choisis <strong>« Ajouter à l\'écran d\'accueil »</strong> pour l\'utiliser comme une appli.</p>';

  const html = `
    <header class="profile-head">
      <div class="avatar big">${esc(initial(me.name))}</div>
      <div>
        <h1>${esc(me.name)}</h1>
        <p class="muted small">${esc(me.email)}</p>
      </div>
    </header>

    <section class="section">
      <div class="section-head"><h2>Mon binôme</h2></div>
      ${partner ? `
        <div class="card row between gap">
          <div class="row gap">
            <div class="avatar accent">${esc(initial(partner.name))}</div>
            <div><strong>${esc(partner.name)}</strong><p class="small muted">Vous vous fixez vos objectifs mutuellement.</p></div>
          </div>
          <button type="button" class="btn btn-danger btn-sm" data-action="unpair">Se délier</button>
        </div>` : pairCard()}
    </section>

    <section class="section">
      <div class="section-head"><h2>Notifications</h2></div>
      <div class="card stack">${await notificationsCard()}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Mon profil</h2></div>
      <form data-form="rename" class="card row gap">
        <label class="field grow"><span>Prénom</span>
          <input name="displayName" required maxlength="40" value="${esc(me.name)}" autocomplete="given-name">
        </label>
        <button type="submit" class="btn btn-ghost self-end">OK</button>
      </form>
    </section>

    <section class="section">
      <div class="section-head"><h2>Apparence</h2></div>
      ${segmented('theme', [{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }], getTheme(), 'Thème')}
    </section>

    <section class="section">
      <div class="section-head"><h2>Application</h2></div>
      <div class="card">${install}</div>
    </section>

    <button type="button" class="btn btn-ghost btn-block mt" data-action="logout">${icon('logout')} Se déconnecter</button>
    <p class="footer-note">Auphine · v0.2</p>`;

  return {
    html,
    bind: (main) => delegate(main, {
      ...pairHandlers(ctx),
      unpair: async () => {
        if (!(await confirmBox(`Te délier de ${firstName(partner.name)} ? L'historique des objectifs est conservé.`, 'Se délier'))) return;
        try {
          setProfile(await del('/pair'));
          toast("Vous n'êtes plus liés");
          ctx.rerender();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
      rename: (form) => busy(form, async () => {
        setProfile(await patch('/me', { name: form.elements.displayName.value }));
        toast('Prénom mis à jour', 'success');
        ctx.rerender();
      }),
      pushOn: (el) => busy(el, async () => {
        await enablePush();
        toast('Notifications activées', 'success', 'bell');
        await ctx.rerender();
      }),
      pushOff: (el) => busy(el, async () => {
        await disablePush();
        toast('Notifications désactivées sur cet appareil', 'info', 'bell-off');
        await ctx.rerender();
      }),
      pushTest: (el) => busy(el, async () => {
        await post('/push/test');
        toast('Notification envoyée', 'success', 'bell');
      }),
      pref: async (input) => {
        try {
          setProfile(await patch('/me', { notifPrefs: { [input.dataset.key]: input.checked } }));
        } catch (err) {
          input.checked = !input.checked;
          toast(err.message, 'error');
        }
      },
      theme: (el) => {
        setTheme(el.dataset.value);
        ctx.rerender();
      },
      install: async () => {
        const prompt = state.installPrompt;
        if (!prompt) return;
        state.installPrompt = null;
        prompt.prompt();
        await prompt.userChoice.catch(() => null);
        ctx.rerender();
      },
      logout: async () => {
        // Cet appareil ne doit plus recevoir les notifications de ce compte.
        await disablePush().catch(() => null);
        await post('/logout').catch(() => null);
        setToken(null);
        state.me = null;
        state.partner = null;
        ctx.rerender();
      },
    }),
  };
}
