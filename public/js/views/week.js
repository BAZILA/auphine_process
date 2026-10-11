// Vue « Bilan » : le rendu hebdomadaire (chiffres, jour par jour, compétences, évolution, bilan écrit).
import { get, put } from '../api.js';
import { state } from '../state.js';
import { today, addDays, mondayOf, weekLabel, dayShort, dayShortNum } from '../dates.js';
import {
  esc, icon, delegate, busy, toast, ring, segmented, emptyState, goalState, shareOrCopy, firstName, fmtNum, STATE_LABEL,
} from '../ui.js';
import { progressPct } from '../components.js';

function verdict(rate) {
  if (rate == null) return 'Pas encore de résultat';
  if (rate >= 90) return 'Semaine exceptionnelle';
  if (rate >= 70) return 'Très belle semaine';
  if (rate >= 50) return 'Bonne dynamique';
  if (rate >= 30) return 'Semaine en demi-teinte';
  return 'Semaine difficile, on repart';
}

function delta(rate, prev) {
  if (rate == null || prev == null) return null;
  const d = rate - prev;
  if (d === 0) return { cls: 'flat', text: 'Stable par rapport à la semaine précédente' };
  return { cls: d > 0 ? 'up' : 'down', text: `${d > 0 ? '+' : ''}${d} pts par rapport à la semaine précédente` };
}

const stat = (iconName, value, label) => `
  <div class="stat">
    <span class="stat-ico">${icon(iconName)}</span>
    <span class="stat-val">${value}</span>
    <span class="stat-lbl">${label}</span>
  </div>`;

export async function WeekView(ctx) {
  const who = state.partner ? state.reportWho : 'me';
  const t = today();
  const thisMonday = mondayOf(t);
  const r = await get(`/report?who=${who}&week=${state.reportWeek}&today=${t}`);
  const person = who === 'me' ? state.me : state.partner;
  const partnerName = state.partner ? firstName(state.partner.name) : null;
  const color = who === 'me' ? 'var(--primary)' : 'var(--accent)';
  const s = r.summary;
  const dlt = delta(s.rate, s.prevRate);
  const icoDelta = dlt ? (dlt.cls === 'up' ? 'trending-up' : dlt.cls === 'down' ? 'trending-down' : 'minus') : '';

  // --- Jour par jour --------------------------------------------------------
  const maxDay = Math.max(1, ...r.days.map((d) => d.total));
  const seg = (kind, n) => (n ? `<i class="s-${kind}" style="flex:${n}"></i>` : '');
  const dayChart = `
    <div class="daychart" role="img" aria-label="Objectifs réalisés par jour">
      ${r.days.map((d) => `
        <div class="dc ${d.day === t ? 'is-today' : ''}">
          <span class="dc-val">${d.total ? `${d.done}/${d.total}` : ''}</span>
          <div class="dc-track">
            <div class="dc-bar" style="height:${d.total ? Math.max(8, (d.total / maxDay) * 100) : 0}%">
              ${seg('done', d.done)}${seg('partial', d.partial)}${seg('missed', d.missed)}${seg('upcoming', d.upcoming)}
            </div>
          </div>
          <span class="dc-label">${dayShort(d.day)}</span>
        </div>`).join('')}
    </div>
    <div class="legend">
      <span><i class="s-done"></i>Fait</span><span><i class="s-partial"></i>Partiel</span>
      <span><i class="s-missed"></i>Manqué</span><span><i class="s-upcoming"></i>À venir</span>
    </div>`;

  // --- Objectifs de la semaine -----------------------------------------------
  const weekGoals = r.goals.filter((g) => g.period === 'week');
  const weekGoalsList = weekGoals.map((g) => {
    const st = goalState(g, t);
    return `
      <div class="wk-goal">
        <div class="row between gap">
          <strong>${esc(g.title)}</strong>
          <span class="badge b-${st}">${STATE_LABEL[st]}</span>
        </div>
        ${g.target != null ? `
          <div class="xpbar"><span style="width:${progressPct(g)}%;--c:var(--success)"></span></div>
          <span class="small muted">${fmtNum(g.progress)} / ${fmtNum(g.target)} ${esc(g.unit)}</span>` : ''}
      </div>`;
  }).join('');

  // --- Compétences de la semaine --------------------------------------------
  const maxXp = Math.max(1, ...r.skills.map((k) => k.xp));
  const skillsList = r.skills.length
    ? r.skills.map((k) => `
        <div class="wk-skill" style="--c:${esc(k.color)}">
          <span class="wk-icon">${icon(k.icon)}</span>
          <div class="grow">
            <div class="row between"><strong>${esc(k.name)}</strong><span class="muted small">+${k.xp} XP · ${k.done}/${k.total}</span></div>
            <div class="xpbar"><span style="width:${(k.xp / maxXp) * 100}%"></span></div>
          </div>
        </div>`).join('')
    : '<p class="muted small">Aucune compétence travaillée cette semaine.</p>';

  // --- Évolution sur 8 semaines ---------------------------------------------
  const rated = r.history.filter((h) => h.rate != null);
  const avg = rated.length ? Math.round(rated.reduce((a, h) => a + h.rate, 0) / rated.length) : null;
  const evolution = `
    <div class="evo" role="img" aria-label="Taux de réussite des 8 dernières semaines">
      ${r.history.map((h) => `
        <div class="ev ${h.week === r.week ? 'is-cur' : ''}">
          <span class="ev-val">${h.rate == null ? '–' : `${h.rate}%`}</span>
          <div class="ev-track"><div class="ev-bar" style="height:${h.rate ?? 0}%"></div></div>
          <span class="ev-label">${dayShortNum(h.week)}</span>
        </div>`).join('')}
    </div>
    ${avg != null ? `<p class="muted small center">Moyenne sur la période : <strong>${avg} %</strong></p>` : ''}`;

  // --- Réussites / à retravailler -------------------------------------------
  const doneGoals = r.goals.filter((g) => g.status === 'done');
  const missedGoals = r.goals.filter((g) => goalState(g, t) === 'missed');
  const goalLine = (g) => `<li><span class="muted small">${g.period === 'week' ? 'sem.' : dayShort(g.day)}</span> ${esc(g.title)}</li>`;

  // --- Bilan écrit ------------------------------------------------------------
  const selfReview = r.reviews.find((x) => x.authorId === person.id);
  const otherReview = r.reviews.find((x) => x.authorId !== person.id);
  const myReview = who === 'me' ? selfReview : otherReview;
  const theirReview = who === 'me' ? otherReview : selfReview;
  const reviewForm = `
    <form data-form="review" class="card stack">
      <div class="row between">
        <h3>${who === 'me' ? 'Mon ressenti' : `Mon retour pour ${esc(partnerName)}`}</h3>
        <div class="stars" role="radiogroup" aria-label="Note de la semaine">
          ${[5, 4, 3, 2, 1].map((n) => `
            <input type="radio" id="rv-${n}" name="rating" value="${n}" ${myReview?.rating === n ? 'checked' : ''}>
            <label for="rv-${n}" title="${n}/5">${icon('star')}</label>`).join('')}
        </div>
      </div>
      <textarea name="comment" rows="4" maxlength="2000" placeholder="${who === 'me'
        ? 'Ce qui a bien marché, ce qui a coincé, ce que je change la semaine prochaine…'
        : 'Ses points forts cette semaine, un conseil pour la suivante…'}">${esc(myReview?.comment)}</textarea>
      <button type="submit" class="btn btn-primary btn-block">Enregistrer</button>
    </form>`;
  const theirTitle = who === 'me' ? `Le mot de ${esc(partnerName)}` : `Le ressenti de ${esc(partnerName)}`;
  const starsRead = (n) => `<span class="stars-read" aria-label="${n} sur 5">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= n ? 'on' : '')).join('')}</span>`;
  const theirBlock = !state.partner ? '' : theirReview && (theirReview.comment || theirReview.rating)
    ? `<div class="card review-read">
         <div class="row between"><h3>${theirTitle}</h3>${theirReview.rating ? starsRead(theirReview.rating) : ''}</div>
         ${theirReview.comment ? `<p>${esc(theirReview.comment)}</p>` : ''}
       </div>`
    : `<div class="card review-read muted"><h3>${theirTitle}</h3><p class="small">Pas encore écrit pour cette semaine.</p></div>`;

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">Rendu hebdomadaire</p>
        <h1>Bilan de la semaine</h1>
      </div>
      <button type="button" class="icon-btn" data-action="share" aria-label="Partager le bilan">${icon('share')}</button>
    </header>

    ${state.partner ? segmented('who', [{ value: 'me', label: 'Moi' }, { value: 'partner', label: partnerName }], who, 'Bilan de') : ''}

    <div class="weeknav">
      <button type="button" class="icon-btn" data-action="prev" aria-label="Semaine précédente">${icon('chevL')}</button>
      <div class="center">
        <strong>Semaine du ${weekLabel(r.week)}</strong>
        ${r.week === thisMonday ? '<span class="pill">En cours</span>' : ''}
      </div>
      <button type="button" class="icon-btn" data-action="next" aria-label="Semaine suivante" ${r.week >= thisMonday ? 'disabled' : ''}>${icon('chevR')}</button>
    </div>

    ${!s.total ? emptyState('calendar', 'Aucun objectif cette semaine', who === 'me'
      ? 'Les objectifs de la semaine apparaîtront dans ce bilan.'
      : `Fixe des objectifs à ${partnerName} pour suivre sa progression.`) : `
    <div class="card hero">
      ${ring(s.rate, { size: 112, stroke: 11, color })}
      <div>
        <p class="eyebrow">${who === 'me' ? 'Mon taux de réussite' : `Taux de réussite de ${esc(partnerName)}`}</p>
        <p class="hero-title">${verdict(s.rate)}</p>
        ${dlt ? `<p class="delta ${dlt.cls}">${icon(icoDelta, 'sm')}${dlt.text}</p>` : ''}
      </div>
    </div>

    <div class="stats">
      ${stat('check-circle', `${s.done}<small>/${s.total}</small>`, 'objectifs faits')}
      ${stat('zap', `+${s.xp}`, 'XP gagnés')}
      ${stat('flame', `${r.streak}<small> j</small>`, `série (record ${r.bestStreak} j)`)}
      ${stat('clock', `${s.missed}`, `manqués${s.upcoming ? ` · ${s.upcoming} à venir` : ''}`)}
    </div>

    <section class="section">
      <div class="section-head"><h2>Jour par jour</h2></div>
      <div class="card">${dayChart}</div>
    </section>

    ${weekGoals.length ? `
      <section class="section">
        <div class="section-head"><h2>Objectifs de la semaine</h2></div>
        <div class="card stack">${weekGoalsList}</div>
      </section>` : ''}

    <section class="section">
      <div class="section-head"><h2>Compétences travaillées</h2></div>
      <div class="card stack">${skillsList}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Réussites et points à retravailler</h2></div>
      <details class="card fold" ${doneGoals.length ? 'open' : ''}>
        <summary><span class="fold-ico ok">${icon('award', 'sm')}</span>Réussites <span class="muted">(${doneGoals.length})</span></summary>
        ${doneGoals.length ? `<ul class="glist">${doneGoals.map(goalLine).join('')}</ul>` : '<p class="muted small">Rien pour l\'instant.</p>'}
      </details>
      <details class="card fold">
        <summary><span class="fold-ico ko">${icon('repeat', 'sm')}</span>À retravailler <span class="muted">(${missedGoals.length})</span></summary>
        ${missedGoals.length ? `<ul class="glist">${missedGoals.map(goalLine).join('')}</ul>` : '<p class="muted small">Aucun objectif manqué.</p>'}
      </details>
    </section>`}

    <section class="section">
      <div class="section-head"><h2>Évolution sur 8 semaines</h2></div>
      <div class="card">${evolution}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Bilan écrit</h2></div>
      <div class="stack">${reviewForm}${theirBlock}</div>
    </section>`;

  const shareText = () => {
    const top = r.skills.filter((k) => k.xp > 0).slice(0, 3).map((k) => `${k.name} +${k.xp} XP`).join(', ');
    return [
      `Bilan Auphine · semaine du ${weekLabel(r.week)}`,
      `${person.name} : ${s.rate ?? '–'} % de réussite${dlt ? ` (${dlt.text.toLowerCase()})` : ''}`,
      `${s.done}/${s.total} objectifs faits · +${s.xp} XP · série de ${r.streak} jours`,
      top ? `Compétences : ${top}` : '',
      myReview?.comment ? `« ${myReview.comment} »` : '',
    ].filter(Boolean).join('\n');
  };

  return {
    html,
    bind: (main) => delegate(main, {
      who: (el) => {
        state.reportWho = el.dataset.value;
        ctx.rerender();
      },
      prev: () => {
        state.reportWeek = addDays(r.week, -7);
        ctx.rerender();
      },
      next: () => {
        state.reportWeek = addDays(r.week, 7);
        ctx.rerender();
      },
      share: () => shareOrCopy(shareText(), 'Bilan de la semaine'),
      review: (form) => busy(form, async () => {
        const fd = new FormData(form);
        await put('/reviews', { who, week: r.week, rating: fd.get('rating') || null, comment: fd.get('comment') });
        toast('Bilan enregistré', 'success');
      }),
    }),
  };
}
