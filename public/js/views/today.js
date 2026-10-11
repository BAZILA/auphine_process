// Vue « Aujourd'hui » : mes objectifs du jour et de la semaine (fixés par mon binôme ou par moi).
import { get, patch } from '../api.js';
import { state } from '../state.js';
import { today, weekDays, relDay, dayLong } from '../dates.js';
import { esc, icon, delegate, busy, toast, ring, emptyState, firstName, DIFFICULTY } from '../ui.js';
import { dayStrip, dayHandlers, goalItem, weekGoalsSection, pairBanner, celebrateBadges } from '../components.js';
import { openGoal } from './goal-sheet.js';
import { openGoalForm } from './goal-form.js';

export async function TodayView(ctx) {
  const days = weekDays(state.day);
  const [goals, { skills }] = await Promise.all([
    get(`/goals?who=me&from=${days[0]}&to=${days[6]}`),
    get('/skills?who=me'),
  ]);
  const list = goals.filter((g) => g.period !== 'week' && g.day === state.day);
  const weekList = goals.filter((g) => g.period === 'week');
  const t = today();
  const done = list.filter((g) => g.status === 'done').length;
  const partial = list.filter((g) => g.status === 'partial').length;
  const pct = list.length ? ((done + partial / 2) / list.length) * 100 : null;
  const partnerName = state.partner ? firstName(state.partner.name) : null;
  const rel = relDay(state.day);
  const fromPartner = list.filter((g) => g.authorId !== state.me.id).length;

  let subtitle;
  if (!partnerName) subtitle = 'Lie-toi à ton binôme pour recevoir des objectifs.';
  else if (fromPartner) subtitle = `${esc(partnerName)} t'a fixé ${fromPartner} objectif${fromPartner > 1 ? 's' : ''}.`;
  else subtitle = `${esc(partnerName)} ne t'a encore rien fixé pour ce jour.`;

  const addPerso = (period) => `
    <button type="button" class="btn btn-ghost btn-sm" data-action="addPerso" data-period="${period}">${icon('plus')} Perso</button>`;

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${esc(rel)}${rel !== dayLong(state.day) ? ` · ${esc(dayLong(state.day))}` : ''}</p>
        <h1>Salut ${esc(firstName(state.me.name))}</h1>
        <p class="sub">${subtitle}</p>
        ${state.day !== t ? `<button type="button" class="link" data-action="goToday">${icon('chevL', 'sm')} Revenir à aujourd'hui</button>` : ''}
      </div>
      ${ring(pct, { size: 76, label: list.length ? `${done}/${list.length}` : '–' })}
    </header>

    ${state.partner ? '' : pairBanner()}
    ${dayStrip(days, goals, state.day)}

    <section class="section">
      <div class="section-head">
        <h2>Mes objectifs du jour</h2>
        ${addPerso('day')}
      </div>
      ${list.length
        ? `<div class="goals">${list.map((g) => goalItem(g, 'me')).join('')}</div>`
        : emptyState('sun', 'Rien de prévu', partnerName
          ? `Quand ${partnerName} te fixera un objectif, il apparaîtra ici. Tu peux aussi t'en fixer un toi-même.`
          : 'Fixe-toi un objectif perso, ou lie-toi à ton binôme.')}
    </section>

    ${list.length && done === list.length ? `
      <div class="card celebrate">
        <span class="celebrate-icon">${icon('sparkles')}</span>
        <div><strong>Journée parfaite !</strong><br><span class="muted">Tous tes objectifs du jour sont atteints.</span></div>
      </div>` : ''}

    ${weekGoalsSection(weekList, 'me', { action: addPerso('week') })}`;
  state.justDone = null;

  const find = (el) => goals.find((g) => g.id === Number(el.dataset.id));

  return {
    html,
    bind: (main) => delegate(main, {
      ...dayHandlers(ctx),
      toggle: (el) => busy(el, async () => {
        const g = find(el);
        const status = g.status === 'done' ? 'todo' : 'done';
        // Retour visuel immédiat, sans attendre le serveur.
        const card = el.closest('.goal');
        card.classList.remove('st-todo', 'st-missed', 'st-partial', 'st-done', 'flash');
        void card.offsetWidth; // relance l'animation
        card.classList.add(status === 'done' ? 'st-done' : 'st-todo', 'flash');
        if (status === 'done') toast(`+${DIFFICULTY[g.difficulty].xp} XP`, 'success', 'zap');
        let res;
        try {
          res = await patch(`/goals/${g.id}`, { status });
        } catch (err) {
          ctx.rerender({ fresh: true }); // on remet l'état réel
          throw err;
        }
        await ctx.rerender();
        celebrateBadges(res.newBadges);
      }),
      open: (el) => openGoal(find(el), ctx, { skills }),
      addPerso: (el) => openGoalForm({ ctx, skills, day: state.day < t ? t : state.day, who: 'me', period: el.dataset.period }),
    }),
  };
}
