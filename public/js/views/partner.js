// Vue « Binôme » : les objectifs que je fixe à mon binôme, son avancement, mes encouragements.
import { get, patch, del } from '../api.js';
import { state } from '../state.js';
import { today, weekDays, relDay, dayLong } from '../dates.js';
import {
  esc, icon, delegate, busy, toast, ring, openSheet, choose, emptyState, skillTag, goalState, firstName,
  DIFFICULTY, STATE_LABEL, REACTIONS,
} from '../ui.js';
import { dayStrip, dayHandlers, goalItem, pairCard, pairHandlers } from '../components.js';
import { openGoalForm } from './goal-form.js';

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
          <li><span><strong>Fixe ses objectifs</strong> du jour (ou répète-les sur la semaine).</span></li>
          <li><span><strong>Il ou elle coche</strong> ce qui est fait, tu réagis et l'encourages.</span></li>
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
  const list = goals.filter((g) => g.day === state.day);
  const done = list.filter((g) => g.status === 'done').length;
  const partial = list.filter((g) => g.status === 'partial').length;
  const pct = list.length ? ((done + partial / 2) / list.length) * 100 : null;
  const name = firstName(state.partner.name);
  const rel = relDay(state.day);

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${esc(rel)}${rel !== dayLong(state.day) ? ` · ${esc(dayLong(state.day))}` : ''}</p>
        <h1>Objectifs de ${esc(name)}</h1>
        <p class="sub">${list.length ? `${done} sur ${list.length} réalisé${done > 1 ? 's' : ''}` : 'Aucun objectif fixé pour ce jour.'}</p>
        ${state.day !== today() ? `<button type="button" class="link" data-action="goToday">← Revenir à aujourd'hui</button>` : ''}
      </div>
      ${ring(pct, { size: 76, color: 'var(--accent)', label: list.length ? `${done}/${list.length}` : '–' })}
    </header>

    ${dayStrip(days, goals, state.day, { accent: true })}

    <section class="section">
      <div class="section-head">
        <h2>Ce que tu lui as fixé</h2>
        <button type="button" class="btn btn-accent btn-sm desktop-only" data-action="add">${icon('plus')} Fixer un objectif</button>
      </div>
      ${list.length
        ? `<div class="goals">${list.map((g) => goalItem(g, 'partner')).join('')}</div>`
        : emptyState('🎯', `Fixe un objectif à ${name}`, 'Un petit défi clair et atteignable, c\'est le meilleur départ.',
          `<button type="button" class="btn btn-accent" data-action="add">${icon('plus')} Fixer un objectif</button>`)}
    </section>

    <button type="button" class="fab mobile-only" data-action="add" aria-label="Fixer un objectif">${icon('plus')}<span>Objectif</span></button>`;

  const find = (el) => list.find((g) => g.id === Number(el.dataset.id));

  return {
    html,
    bind: (main) => delegate(main, {
      ...dayHandlers(ctx),
      add: () => openGoalForm({ ctx, skills, day: state.day < today() ? today() : state.day }),
      open: (el) => openPartnerGoal(find(el), ctx, skills),
    }),
  };
}

function openPartnerGoal(g, ctx, skills) {
  const st = goalState(g, today());
  const name = firstName(state.partner.name);
  const mine = g.authorId === state.me.id;
  let changed = false;

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
        ${g.note ? `<div class="bubble"><strong>${esc(name)}</strong><p>${esc(g.note)}</p></div>` : ''}
      </div>
      <div class="field">
        <span class="label">Réagir</span>
        <div class="reactions">
          ${REACTIONS.map((r) => `<button type="button" class="react ${g.reaction === r ? 'on' : ''}" data-action="react" data-r="${r}" aria-pressed="${g.reaction === r}">${r}</button>`).join('')}
        </div>
      </div>
      <form data-form="feedback" class="stack">
        <label class="field"><span>Ton retour pour ${esc(name)}</span>
          <textarea name="feedback" rows="3" maxlength="1000" placeholder="Un encouragement, un conseil, un bravo…">${esc(g.feedback)}</textarea>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Envoyer mon retour</button>
      </form>
      ${mine ? `
        <div class="row gap mt">
          <button type="button" class="btn btn-ghost grow" data-action="edit">${icon('edit')} Modifier</button>
          <button type="button" class="btn btn-danger grow" data-action="remove">${icon('trash')} Supprimer</button>
        </div>` : ''}`,
    onClose: () => {
      if (changed) ctx.rerender();
    },
    handlers: {
      react: (el) => busy(el, async () => {
        const reaction = g.reaction === el.dataset.r ? '' : el.dataset.r;
        await patch(`/goals/${g.id}`, { reaction });
        g.reaction = reaction;
        changed = true;
        sheet.el.querySelectorAll('.react').forEach((b) => {
          const on = b.dataset.r === reaction;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on);
        });
      }),
      feedback: (form) => busy(form, async () => {
        await patch(`/goals/${g.id}`, { feedback: form.elements.feedback.value });
        changed = true;
        toast('Retour envoyé ✔', 'success');
        sheet.close();
      }),
      edit: () => {
        sheet.close();
        openGoalForm({ ctx, skills, goal: g });
      },
      remove: async () => {
        const options = [{ value: 'one', label: 'Supprimer cet objectif', kind: 'btn-danger' }];
        if (g.seriesId) options.push({ value: 'series', label: 'Celui-ci et les répétitions à venir', kind: 'btn-danger' });
        const scope = await choose(`Supprimer « ${g.title} » ?`, options);
        if (!scope) return;
        try {
          await del(`/goals/${g.id}${scope === 'series' ? '?scope=series' : ''}`);
          toast('Objectif supprimé', 'success');
          changed = true;
          sheet.close();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
    },
  });
}
