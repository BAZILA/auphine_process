// Vue « Binôme » : les objectifs de mon binôme (ceux que je lui fixe et les siens), son avancement, mes encouragements.
import { get } from '../api.js';
import { state } from '../state.js';
import { today, weekDays, relDay, dayLong } from '../dates.js';
import { esc, icon, delegate, ring, emptyState, firstName } from '../ui.js';
import { dayStrip, dayHandlers, goalItem, weekGoalsSection, pairCard, pairHandlers } from '../components.js';
import { openGoalForm } from './goal-form.js';
import { openGoal } from './goal-sheet.js';

export async function PartnerView(ctx) {
  if (!state.partner) {
    return {
      html: `
        <header class="page-head"><div>
          <p class="eyebrow">Binôme</p>
          <h1>Avance à deux</h1>
          <p class="sub">Chacun fixe les objectifs de l'autre, chaque jour.</p>
        </div></header>
        ${pairCard()}
        <ol class="howto">
          <li><span><strong>Liez-vous</strong> avec un code à 6 caractères.</span></li>
          <li><span><strong>Fixe ses objectifs</strong> du jour ou de la semaine.</span></li>
          <li><span><strong>Il ou elle coche</strong> ce qui est fait, ajoute une photo, et tu l'encourages.</span></li>
          <li><span><strong>Chaque semaine</strong>, faites le bilan ensemble.</span></li>
        </ol>`,
      bind: (main) => delegate(main, pairHandlers(ctx)),
    };
  }

  const days = weekDays(state.day);
  const [goals, { skills }] = await Promise.all([
    get(`/goals?who=partner&from=${days[0]}&to=${days[6]}`),
    get('/skills?who=partner'),
  ]);
  const list = goals.filter((g) => g.period !== 'week' && g.day === state.day);
  const weekList = goals.filter((g) => g.period === 'week');
  const done = list.filter((g) => g.status === 'done').length;
  const partial = list.filter((g) => g.status === 'partial').length;
  const pct = list.length ? ((done + partial / 2) / list.length) * 100 : null;
  const name = firstName(state.partner.name);
  const rel = relDay(state.day);
  const t = today();

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${esc(rel)}${rel !== dayLong(state.day) ? ` · ${esc(dayLong(state.day))}` : ''}</p>
        <h1>Objectifs de ${esc(name)}</h1>
        <p class="sub">${list.length ? `${done} sur ${list.length} réalisé${done > 1 ? 's' : ''}` : 'Aucun objectif pour ce jour.'}</p>
        ${state.day !== t ? `<button type="button" class="link" data-action="goToday">${icon('chevL', 'sm')} Revenir à aujourd'hui</button>` : ''}
      </div>
      ${ring(pct, { size: 76, color: 'var(--accent)', label: list.length ? `${done}/${list.length}` : '–' })}
    </header>

    ${dayStrip(days, goals, state.day, { accent: true })}

    <section class="section">
      <div class="section-head">
        <h2>Ses objectifs du jour</h2>
        <button type="button" class="btn btn-accent btn-sm desktop-only" data-action="add">${icon('plus')} Fixer un objectif</button>
      </div>
      ${list.length
        ? `<div class="goals">${list.map((g) => goalItem(g, 'partner')).join('')}</div>`
        : emptyState('target', `Fixe un objectif à ${name}`, 'Un petit défi clair et atteignable, c\'est le meilleur départ.',
          `<button type="button" class="btn btn-accent" data-action="add">${icon('plus')} Fixer un objectif</button>`)}
    </section>

    ${weekGoalsSection(weekList, 'partner', {
      action: `<button type="button" class="btn btn-ghost btn-sm" data-action="addWeek">${icon('plus')} Semaine</button>`,
    })}

    <button type="button" class="fab mobile-only" data-action="add" aria-label="Fixer un objectif">${icon('plus')}<span>Objectif</span></button>`;

  const find = (el) => goals.find((g) => g.id === Number(el.dataset.id));
  const startDay = state.day < t ? t : state.day;

  return {
    html,
    bind: (main) => delegate(main, {
      ...dayHandlers(ctx),
      add: () => openGoalForm({ ctx, skills, day: startDay }),
      addWeek: () => openGoalForm({ ctx, skills, day: startDay, period: 'week' }),
      open: (el) => openGoal(find(el), ctx, { skills }),
    }),
  };
}
