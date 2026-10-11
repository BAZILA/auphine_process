// Vue « Profil » : compte, binôme, apparence, installation.
import { post, patch, del, setToken } from '../api.js';
import { state, setProfile } from '../state.js';
import { esc, icon, delegate, busy, toast, confirmBox, segmented, getTheme, setTheme, firstName, initial } from '../ui.js';
import { pairCard, pairHandlers } from '../components.js';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function ProfileView(ctx) {
  const { me, partner } = state;

  let install;
  if (isStandalone()) install = '<p class="small muted">✔ Auphine est installée sur cet appareil.</p>';
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
    <p class="footer-note">Auphine · v0.1</p>`;

  return {
    html,
    bind: (main) => delegate(main, {
      ...pairHandlers(ctx),
      unpair: async () => {
        if (!(await confirmBox(`Te délier de ${firstName(partner.name)} ? L'historique des objectifs est conservé.`, 'Se délier'))) return;
        try {
          setProfile(await del('/pair'));
          toast('Vous n\'êtes plus liés');
          ctx.rerender();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
      rename: (form) => busy(form, async () => {
        setProfile(await patch('/me', { name: form.elements.displayName.value }));
        toast('Prénom mis à jour ✔', 'success');
        ctx.rerender();
      }),
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
        await post('/logout').catch(() => null);
        setToken(null);
        state.me = null;
        state.partner = null;
        ctx.rerender();
      },
    }),
  };
}
