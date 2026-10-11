// Composants partagés entre plusieurs vues.
import { post } from './api.js';
import { state, setProfile } from './state.js';
import { today, addDays, dayShort, dayNum } from './dates.js';
import { esc, icon, toast, busy, skillTag, goalState, shareOrCopy, firstName, DIFFICULTY, STATE_LABEL } from './ui.js';

// ---------------------------------------------------------------------------
// Bandeau des 7 jours de la semaine
// ---------------------------------------------------------------------------
export function dayStrip(days, goals, selected, { accent = false } = {}) {
  const t = today();
  return `
    <nav class="daystrip ${accent ? 'accent' : ''}" aria-label="Choisir un jour">
      <button type="button" class="icon-btn" data-action="prevWeek" aria-label="Semaine précédente">${icon('chevL')}</button>
      <div class="days">
        ${days.map((d) => {
          const list = goals.filter((g) => g.day === d);
          const done = list.filter((g) => g.status === 'done').length;
          const dot = !list.length ? 'none' : done === list.length ? 'full' : d < t ? 'low' : 'some';
          return `
            <button type="button" class="day ${d === selected ? 'sel' : ''} ${d === t ? 'is-today' : ''}"
              data-action="pickDay" data-day="${d}" aria-pressed="${d === selected}">
              <span class="dname">${dayShort(d)}</span>
              <span class="dnum">${dayNum(d)}</span>
              <span class="dot ${dot}"></span>
            </button>`;
        }).join('')}
      </div>
      <button type="button" class="icon-btn" data-action="nextWeek" aria-label="Semaine suivante">${icon('chevR')}</button>
    </nav>`;
}

export const dayHandlers = (ctx) => ({
  pickDay: (el) => {
    state.day = el.dataset.day;
    ctx.rerender();
  },
  prevWeek: () => {
    state.day = addDays(state.day, -7);
    ctx.rerender();
  },
  nextWeek: () => {
    state.day = addDays(state.day, 7);
    ctx.rerender();
  },
  goToday: () => {
    state.day = today();
    ctx.rerender();
  },
});

// ---------------------------------------------------------------------------
// Carte d'objectif
// mode "me" : je peux cocher. mode "partner" : affichage du statut seulement.
// ---------------------------------------------------------------------------
export function goalItem(g, mode) {
  const st = goalState(g, today());
  const flash = state.justDone === g.id ? 'flash' : '';
  const check = mode === 'me'
    ? `<button type="button" class="goal-check" data-action="toggle" data-id="${g.id}"
         aria-label="${st === 'done' ? 'Remettre à faire' : 'Marquer comme fait'}">${icon('check')}</button>`
    : `<span class="goal-check" aria-hidden="true">${icon('check')}</span>`;
  const hasTalk = (mode === 'me' ? g.feedback : g.note) ? icon('message', 'sm') : '';
  return `
    <article class="goal st-${st} ${flash}">
      ${check}
      <button type="button" class="goal-main" data-action="open" data-id="${g.id}">
        <span class="goal-title">${esc(g.title)}</span>
        <span class="goal-meta">
          ${g.skillName ? skillTag(g.skillName, g.skillIcon, g.skillColor) : ''}
          <span class="diff" title="${DIFFICULTY[g.difficulty].label}" aria-label="Difficulté ${DIFFICULTY[g.difficulty].label}">
            ${'<i class="on"></i>'.repeat(g.difficulty)}${'<i></i>'.repeat(3 - g.difficulty)}
          </span>
          ${st !== 'todo' ? `<span class="badge b-${st}">${STATE_LABEL[st]}</span>` : ''}
          ${g.reaction ? `<span class="reaction">${esc(g.reaction)}</span>` : ''}
          ${hasTalk}
        </span>
      </button>
    </article>`;
}

// ---------------------------------------------------------------------------
// Liaison avec le binôme (code d'invitation)
// ---------------------------------------------------------------------------
export function pairCard() {
  return `
    <div class="card pair">
      <div class="pair-icon" aria-hidden="true">🤝</div>
      <h3>Lie-toi à ton binôme</h3>
      <p class="muted">Partage ton code, ou saisis celui de ton binôme. Vous pourrez ensuite vous fixer des objectifs l'un à l'autre.</p>
      <div class="code-box">
        <span class="code" aria-label="Ton code">${esc(state.me.inviteCode)}</span>
        <button type="button" class="icon-btn" data-action="copyCode" aria-label="Copier le code">${icon('copy')}</button>
        <button type="button" class="icon-btn" data-action="shareCode" aria-label="Partager le code">${icon('share')}</button>
      </div>
      <form data-form="pair" class="pair-form">
        <input name="code" required maxlength="6" minlength="6" placeholder="Code du binôme" autocomplete="off"
          autocapitalize="characters" spellcheck="false" aria-label="Code de ton binôme">
        <button type="submit" class="btn btn-primary">${icon('link')} Lier</button>
      </form>
    </div>`;
}

export const pairHandlers = (ctx) => ({
  copyCode: async () => {
    try {
      await navigator.clipboard.writeText(state.me.inviteCode);
      toast('Code copié ✔', 'success');
    } catch {
      toast(`Ton code : ${state.me.inviteCode}`);
    }
  },
  shareCode: () => shareOrCopy(
    `Rejoins-moi sur Auphine pour qu'on se fixe des objectifs chaque jour 🎯\nMon code binôme : ${state.me.inviteCode}\n${location.origin}`,
  ),
  pair: (form) => busy(form, async () => {
    const profile = await post('/pair', { code: form.code.value });
    setProfile(profile);
    toast(`Vous êtes liés avec ${firstName(profile.partner.name)} 🎉`, 'success');
    ctx.rerender();
  }),
});

/** Petit bandeau compact (vue Aujourd'hui) qui renvoie vers la liaison. */
export const pairBanner = () => `
  <a class="card banner" href="#/partner">
    <span aria-hidden="true">🤝</span>
    <span><strong>Pas encore de binôme</strong><br><span class="muted">Lie-toi pour recevoir tes objectifs du jour.</span></span>
    ${icon('chevR')}
  </a>`;
