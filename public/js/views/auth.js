// Écran de connexion / inscription.
import { post, setToken } from '../api.js';
import { delegate, busy, segmented, logo, icon } from '../ui.js';

export function renderAuth(root, { onAuthed }) {
  let mode = 'login';

  const draw = () => {
    const register = mode === 'register';
    root.innerHTML = `
      <main class="auth">
        <div class="auth-hero">
          ${logo(64)}
          <h1>Auphine</h1>
          <p class="slogan">Avancer à deux, chaque jour.</p>
          <p>Fixez-vous des objectifs l'un l'autre, chaque jour.<br>Faites le bilan ensemble, chaque semaine.</p>
        </div>
        <div class="card auth-card">
          ${segmented('mode', [{ value: 'login', label: 'Connexion' }, { value: 'register', label: 'Créer un compte' }], mode)}
          <form data-form="submit" class="stack">
            ${register ? `
              <label class="field"><span>Prénom</span>
                <input name="name" required maxlength="40" autocomplete="given-name" placeholder="Ton prénom">
              </label>` : ''}
            <label class="field"><span>E-mail</span>
              <input name="email" type="email" required maxlength="120" autocomplete="email" inputmode="email" placeholder="toi@exemple.fr">
            </label>
            <label class="field"><span>Mot de passe</span>
              <input name="password" type="password" required minlength="${register ? 8 : 1}" maxlength="200"
                autocomplete="${register ? 'new-password' : 'current-password'}" placeholder="${register ? '8 caractères minimum' : '••••••••'}">
            </label>
            <button type="submit" class="btn btn-primary btn-block">${register ? 'Créer mon compte' : 'Se connecter'}</button>
          </form>
        </div>
        <ul class="auth-points">
          <li>${icon('target')} Ton binôme te fixe tes objectifs du jour et de la semaine</li>
          <li>${icon('camera')} Tu coches, tu ajoutes une preuve, il ou elle t'encourage</li>
          <li>${icon('trophy')} Bilan hebdo, compétences, badges et niveaux</li>
        </ul>
      </main>`;
  };

  delegate(root, {
    mode: (el) => {
      mode = el.dataset.value;
      draw();
    },
    submit: (form) => busy(form, async () => {
      const body = Object.fromEntries(new FormData(form));
      const res = await post(mode === 'login' ? '/login' : '/register', body);
      setToken(res.token);
      onAuthed(res);
    }),
  });
  draw();
}
