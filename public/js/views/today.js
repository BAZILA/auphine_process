// Vue « Aujourd'hui » : mes objectifs du jour, fixés par mon binôme.
import { get, patch } from '../api.js';
import { state } from '../state.js';
import { today, weekDays, relDay, dayLong } from '../dates.js';
import {
  esc, delegate, busy, toast, ring, openSheet, emptyState, skillTag, goalState, goalXp, firstName,
  DIFFICULTY, STATE_LABEL,
} from '../ui.js';
import { dayStrip, dayHandlers, goalItem, pairBanner } from '../components.js';

export async function TodayView(ctx) {
  const days = weekDays(state.day);
  const goals = await get(`/goals?who=me&from=${days[0]}&to=${days[6]}`);
  const list = goals.filter((g) => g.day === state.day);
  const t = today();
  const done = list.filter((g) => g.status === 'done').length;
  const partial = list.filter((g) => g.status === 'partial').length;
  const pct = list.length ? ((done + partial / 2) / list.length) * 100 : null;
  const partnerName = state.partner ? firstName(state.partner.name) : null;
  const rel = relDay(state.day);

  let subtitle;
  if (!partnerName) subtitle = 'Lie-toi à ton binôme pour recevoir des objectifs.';
  else if (list.length) subtitle = `${esc(partnerName)} t'a fixé ${list.length} objectif${list.length > 1 ? 's' : ''}.`;
  else subtitle = `${esc(partnerName)} ne t'a encore rien fixé pour ce jour.`;

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${esc(rel)}${rel !== dayLong(state.day) ? ` · ${esc(dayLong(state.day))}` : ''}</p>
        <h1>Salut ${esc(firstName(state.me.name))} 👋</h1>
        <p class="sub">${subtitle}</p>
        ${state.day !== t ? `<button type="button" class="link" data-action="goToday">← Revenir à aujourd'hui</button>` : ''}
      </div>
      ${ring(pct, { size: 76, label: list.length ? `${done}/${list.length}` : '–' })}
    </header>

    ${state.partner ? '' : pairBanner()}
    ${dayStrip(days, goals, state.day)}

    <section class="section">
      <div class="section-head">
        <h2>Mes objectifs</h2>
        ${list.length ? `<span class="muted small">${done} fait${done > 1 ? 's' : ''} sur ${list.length}</span>` : ''}
      </div>
      ${list.length
        ? `<div class="goals">${list.map((g) => goalItem(g, 'me')).join('')}</div>`
        : emptyState('🌤️', 'Rien de prévu', partnerName
          ? `Quand ${partnerName} te fixera un objectif, il apparaîtra ici.`
          : 'Une fois lié·e à ton binôme, tes objectifs apparaîtront ici.')}
    </section>

    ${list.length && done === list.length ? `
      <div class="card celebrate">
        <span aria-hidden="true">🎉</span>
        <div><strong>Journée parfaite !</strong><br><span class="muted">Tous tes objectifs sont atteints.</span></div>
      </div>` : ''}`;
  state.justDone = null;

  const find = (el) => list.find((g) => g.id === Number(el.dataset.id));

  return {
    html,
    bind: (main) => delegate(main, {
      ...dayHandlers(ctx),
      toggle: (el) => busy(el, async () => {
        const g = find(el);
        const status = g.status === 'done' ? 'todo' : 'done';
        await patch(`/goals/${g.id}`, { status });
        if (status === 'done') {
          state.justDone = g.id;
          toast(`+${DIFFICULTY[g.difficulty].xp} XP 💪`, 'success');
        }
        ctx.rerender();
      }),
      open: (el) => openMyGoal(find(el), ctx),
    }),
  };
}

function openMyGoal(g, ctx) {
  const st = goalState(g, today());
  const author = firstName(g.authorName || 'Ton binôme');
  const statusOption = (value, label) => `
    <label><input type="radio" name="status" value="${value}" ${g.status === value ? 'checked' : ''}><span>${label}</span></label>`;

  const sheet = openSheet({
    title: g.title,
    html: `
      <div class="detail">
        <div class="chips">
          <span class="badge b-${st}">${STATE_LABEL[st]}</span>
          ${g.skillName ? skillTag(g.skillName, g.skillIcon, g.skillColor) : ''}
          <span class="tag">${DIFFICULTY[g.difficulty].label} · ${DIFFICULTY[g.difficulty].xp} XP</span>
          <span class="tag">${esc(relDay(g.day))}</span>
        </div>
        ${g.details ? `<p class="details">${esc(g.details)}</p>` : ''}
        <p class="muted small">Fixé par ${esc(author)}</p>
        ${g.feedback || g.reaction ? `
          <div class="bubble">
            <strong>${esc(author)}</strong> ${esc(g.reaction)}
            ${g.feedback ? `<p>${esc(g.feedback)}</p>` : ''}
          </div>` : ''}
      </div>
      <form data-form="save" class="stack">
        <fieldset class="field">
          <legend>Où en es-tu ?</legend>
          <div class="seg seg-radio">
            ${statusOption('todo', 'À faire')}${statusOption('partial', 'Partiel')}${statusOption('done', 'Fait ✓')}
          </div>
        </fieldset>
        <label class="field"><span>Mon commentaire <em>(visible par ${esc(author)})</em></span>
          <textarea name="note" rows="3" maxlength="1000" placeholder="Comment ça s'est passé ? Une difficulté, une fierté…">${esc(g.note)}</textarea>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Enregistrer</button>
      </form>`,
    handlers: {
      save: (form) => busy(form, async () => {
        const status = form.elements.status.value;
        await patch(`/goals/${g.id}`, { status, note: form.elements.note.value });
        if (status !== g.status && status !== 'todo') {
          state.justDone = g.id;
          toast(`+${goalXp({ ...g, status })} XP 💪`, 'success');
        } else {
          toast('Enregistré ✔', 'success');
        }
        sheet.close();
        ctx.rerender();
      }),
    },
  });
}
