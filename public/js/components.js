// Composants partagés entre plusieurs vues.
import { post } from './api.js';
import { state, setProfile } from './state.js';
import { today, addDays, dayShort, dayNum } from './dates.js';
import {
  esc, icon, toast, busy, ring, skillTag, plainTag, goalState, shareOrCopy, firstName, fmtNum, openSheet, reactionOf,
  DIFFICULTY, STATE_LABEL,
} from './ui.js';

// ---------------------------------------------------------------------------
// Bandeau des 7 jours de la semaine
// ---------------------------------------------------------------------------
export function dayStrip(days, goals, selected, { accent = false } = {}) {
  const t = today();
  const daily = goals.filter((g) => g.period !== 'week');
  return `
    <nav class="daystrip ${accent ? 'accent' : ''}" aria-label="Choisir un jour">
      <button type="button" class="icon-btn" data-action="prevWeek" aria-label="Semaine précédente">${icon('chevL')}</button>
      <div class="days">
        ${days.map((d) => {
          const list = daily.filter((g) => g.day === d);
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
// mode "me" : je réalise (je peux cocher). mode "partner" : j'observe et j'encourage.
// ---------------------------------------------------------------------------
export const progressPct = (g) => (g.target ? Math.min(100, (g.progress / g.target) * 100) : 0);

export function goalItem(g, mode) {
  const st = goalState(g, today());
  const flash = state.justDone === g.id ? 'flash' : '';
  const chiffre = g.target != null;
  let check;
  if (mode === 'me' && !chiffre) {
    check = `<button type="button" class="goal-check" data-action="toggle" data-id="${g.id}"
      aria-label="${st === 'done' ? 'Remettre à faire' : 'Marquer comme fait'}">${icon('check')}</button>`;
  } else if (chiffre && st !== 'done') {
    const tag = mode === 'me' ? 'button type="button" data-action="open"' : 'span';
    check = `<${tag} class="goal-check is-ring" data-id="${g.id}" aria-label="Progression ${Math.round(progressPct(g))} %">
      ${ring(progressPct(g), { size: 32, stroke: 4, color: 'var(--success)', label: '' })}</${tag.split(' ')[0]}>`;
  } else {
    check = `<span class="goal-check" aria-hidden="true">${icon('check')}</span>`;
  }
  const reaction = reactionOf(g.reaction);
  return `
    <article class="goal st-${st} ${flash}">
      ${check}
      <button type="button" class="goal-main" data-action="open" data-id="${g.id}">
        <span class="goal-title">${esc(g.title)}</span>
        ${chiffre ? `
          <span class="goal-progress">
            <span class="xpbar"><span style="width:${progressPct(g)}%;--c:var(--success)"></span></span>
            <span class="amount">${fmtNum(g.progress)} / ${fmtNum(g.target)} ${esc(g.unit)}</span>
          </span>` : ''}
        <span class="goal-meta">
          ${g.authorId === g.assigneeId ? plainTag('user', 'Perso', 't-self') : ''}
          ${g.skillName ? skillTag(g.skillName, g.skillIcon, g.skillColor) : ''}
          <span class="diff" title="${DIFFICULTY[g.difficulty].label}" aria-label="Difficulté ${DIFFICULTY[g.difficulty].label}">
            ${'<i class="on"></i>'.repeat(g.difficulty)}${'<i></i>'.repeat(3 - g.difficulty)}
          </span>
          ${st !== 'todo' ? `<span class="badge b-${st}">${STATE_LABEL[st]}</span>` : ''}
          ${reaction ? `<span class="meta-ico reacted" title="${esc(reaction.label)}">${icon(reaction.icon, 'sm')}</span>` : ''}
          ${g.photo ? `<span class="meta-ico" title="Preuve photo">${icon('camera', 'sm')}</span>` : ''}
          ${g.messages ? `<span class="meta-ico" title="Messages">${icon('message', 'sm')}${g.messages}</span>` : ''}
        </span>
      </button>
    </article>`;
}

/** Liste des objectifs de la semaine (affichée sous les objectifs du jour). */
export function weekGoalsSection(list, mode, { title = 'Cette semaine', action = '' } = {}) {
  if (!list.length && !action) return '';
  return `
    <section class="section">
      <div class="section-head">
        <h2>${icon('calendar', 'sm')} ${esc(title)}</h2>
        ${action}
      </div>
      ${list.length
        ? `<div class="goals">${list.map((g) => goalItem(g, mode)).join('')}</div>`
        : '<p class="muted small">Aucun objectif sur la semaine.</p>'}
    </section>`;
}

// ---------------------------------------------------------------------------
// Liaison avec le binôme (code d'invitation)
// ---------------------------------------------------------------------------
export function pairCard() {
  return `
    <div class="card pair">
      <div class="pair-icon">${icon('users')}</div>
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
      toast('Code copié', 'success');
    } catch {
      toast(`Ton code : ${state.me.inviteCode}`);
    }
  },
  shareCode: () => shareOrCopy(
    `Rejoins-moi sur Auphine pour qu'on se fixe des objectifs chaque jour.\nMon code binôme : ${state.me.inviteCode}\n${location.origin}`,
  ),
  pair: (form) => busy(form, async () => {
    const profile = await post('/pair', { code: form.code.value });
    setProfile(profile);
    toast(`Vous êtes liés avec ${firstName(profile.partner.name)}`, 'success', 'users');
    ctx.rerender();
  }),
});

/** Petit bandeau compact (vue Aujourd'hui) qui renvoie vers la liaison. */
export const pairBanner = () => `
  <a class="card banner" href="#/partner">
    <span class="banner-icon">${icon('users')}</span>
    <span><strong>Pas encore de binôme</strong><br><span class="muted">Lie-toi pour recevoir tes objectifs du jour.</span></span>
    ${icon('chevR')}
  </a>`;

// ---------------------------------------------------------------------------
// Célébration des badges débloqués
// ---------------------------------------------------------------------------
export function celebrateBadges(list) {
  if (!list?.length) return;
  const sheet = openSheet({
    title: list.length > 1 ? 'Nouveaux badges !' : 'Nouveau badge !',
    className: 'celebration',
    html: `
      <div class="stack center">
        ${list.map((b) => `
          <div class="badge-won">
            <span class="badge-ico big">${icon(b.icon)}</span>
            <strong>${esc(b.name)}</strong>
            <span class="muted small">${esc(b.desc)}</span>
          </div>`).join('')}
        <button type="button" class="btn btn-primary btn-block" data-action="close">Génial</button>
        <a class="link" href="#/progress" data-action="seeAll">Voir tous mes badges</a>
      </div>`,
    handlers: {
      seeAll: () => {
        state.progressTab = 'badges';
        state.progressWho = 'me';
        sheet.close();
        location.hash = '#/progress';
      },
    },
  });
}
