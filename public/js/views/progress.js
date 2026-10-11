// Vue « Progrès » : niveau global, compétences, badges et calendrier de régularité.
import { get, post, del } from '../api.js';
import { state } from '../state.js';
import { today, parseDay } from '../dates.js';
import {
  esc, icon, delegate, busy, toast, openSheet, confirmBox, segmented, emptyState, firstName, guessIcon, PALETTE, SKILL_ICONS,
} from '../ui.js';

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// --- Compétences --------------------------------------------------------------
function skillsTab(skills, who, partnerName) {
  return `
    <section class="section">
      <div class="section-head">
        <h2>${skills.length} compétence${skills.length > 1 ? 's' : ''}</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-action="addSkill">${icon('plus')} Ajouter</button>
      </div>
      ${skills.length ? `
        <div class="skills">
          ${skills.map((s) => `
            <button type="button" class="skill" data-action="openSkill" data-id="${s.id}" style="--c:${esc(s.color)}">
              <span class="skill-icon">${icon(s.icon)}</span>
              <span class="skill-body">
                <span class="row between"><strong>${esc(s.name)}</strong><span class="lvl">Niv. ${s.level}</span></span>
                <span class="xpbar"><span style="width:${s.progress * 100}%"></span></span>
                <span class="small muted">${s.xp} XP · ${s.done} réussi${s.done > 1 ? 's' : ''} sur ${s.total}</span>
              </span>
            </button>`).join('')}
        </div>`
        : emptyState('leaf', 'Aucune compétence', who === 'me'
          ? 'Crée les compétences que tu veux développer : sport, lecture, langue…'
          : `Crée les compétences que ${partnerName} veut développer.`,
        `<button type="button" class="btn btn-primary" data-action="addSkill">${icon('plus')} Ajouter une compétence</button>`)}
    </section>
    <div class="card tip">
      <strong>Comment gagner de l'XP ?</strong>
      <p class="small muted">Facile = 10 XP · Moyen = 20 XP · Difficile = 30 XP. Un objectif « partiel » rapporte la moitié.
      Les niveaux se débloquent à 100, 300, 600, 1000 XP…</p>
    </div>`;
}

// --- Badges -------------------------------------------------------------------
function badgesTab({ badges, unlocked }) {
  return `
    <section class="section">
      <div class="section-head"><h2>Badges</h2><span class="muted small">${unlocked} / ${badges.length} débloqués</span></div>
      <div class="badges">
        ${badges.map((b) => `
          <div class="badge-card ${b.unlocked ? 'on' : ''}">
            <span class="badge-ico">${icon(b.icon)}${b.unlocked ? '' : `<span class="badge-lock">${icon('lock', 'xs')}</span>`}</span>
            <strong>${esc(b.name)}</strong>
            <span class="small muted">${esc(b.desc)}</span>
            ${b.unlocked
              ? `<span class="small ok">${b.unlockedAt ? `Obtenu le ${shortDate.format(new Date(`${b.unlockedAt.replace(' ', 'T')}${b.unlockedAt.includes('Z') ? '' : 'Z'}`))}` : 'Débloqué'}</span>`
              : `<span class="xpbar"><span style="width:${(b.current / b.goal) * 100}%"></span></span>
                 <span class="small muted">${b.current} / ${b.goal}</span>`}
          </div>`).join('')}
      </div>
    </section>`;
}

// --- Calendrier -----------------------------------------------------------------
function calendarTab(cal) {
  const t = today();
  const offset = (parseDay(`${cal.month}-01`).getDay() + 6) % 7;
  const level = (d) => {
    if (d.day > t) return d.total ? 'fut' : 'no-goal';
    if (!d.total) return 'no-goal';
    if (d.done === d.total) return 'l4';
    if (d.rate == null) return 'fut'; // journée en cours, rien d'échu
    if (d.rate >= 70) return 'l3';
    if (d.rate >= 40) return 'l2';
    if (d.rate > 0) return 'l1';
    return 'l0';
  };
  return `
    <section class="section">
      <div class="card cal">
        <div class="cal-head">
          <button type="button" class="icon-btn" data-action="prevMonth" aria-label="Mois précédent">${icon('chevL')}</button>
          <strong class="cal-title">${monthFmt.format(parseDay(`${cal.month}-01`))}</strong>
          <button type="button" class="icon-btn" data-action="nextMonth" aria-label="Mois suivant" ${cal.month >= t.slice(0, 7) ? 'disabled' : ''}>${icon('chevR')}</button>
        </div>
        <div class="cal-grid">
          ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((h) => `<span class="cal-dow">${h}</span>`).join('')}
          ${'<span></span>'.repeat(offset)}
          ${cal.days.map((d) => `
            <button type="button" class="cal-day ${level(d)} ${d.day === t ? 'is-today' : ''}" data-action="calDay" data-day="${d.day}"
              aria-label="${d.day} : ${d.total ? `${d.done} sur ${d.total}` : 'aucun objectif'}">${Number(d.day.slice(8))}</button>`).join('')}
        </div>
        <div class="legend">
          <span><i class="cal-key l0"></i>Manqué</span><span><i class="cal-key l2"></i>En partie</span>
          <span><i class="cal-key l4"></i>Parfait</span><span><i class="cal-key fut"></i>À venir</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-ico">${icon('calendar')}</span><span class="stat-val">${cal.summary.active}</span><span class="stat-lbl">jours actifs</span></div>
        <div class="stat"><span class="stat-ico">${icon('star')}</span><span class="stat-val">${cal.summary.perfect}</span><span class="stat-lbl">jours parfaits</span></div>
        <div class="stat"><span class="stat-ico">${icon('check-circle')}</span><span class="stat-val">${cal.summary.done}</span><span class="stat-lbl">objectifs faits</span></div>
        <div class="stat"><span class="stat-ico">${icon('target')}</span><span class="stat-val">${cal.summary.rate ?? '–'}<small>${cal.summary.rate == null ? '' : ' %'}</small></span><span class="stat-lbl">de réussite</span></div>
      </div>
    </section>`;
}

export async function ProgressView(ctx) {
  const who = state.partner ? state.progressWho : 'me';
  const tab = state.progressTab;
  const partnerName = state.partner ? firstName(state.partner.name) : null;
  const [{ skills, overall }, extra] = await Promise.all([
    get(`/skills?who=${who}`),
    tab === 'badges' ? get(`/badges?who=${who}`)
      : tab === 'calendar' ? get(`/calendar?who=${who}&month=${state.calMonth}`)
        : null,
  ]);
  const remaining = overall.next - overall.xp;

  let body;
  if (tab === 'badges') body = badgesTab(extra);
  else if (tab === 'calendar') body = calendarTab(extra);
  else body = skillsTab(skills, who, partnerName);

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">Progression</p>
        <h1>Progrès</h1>
        <p class="sub">Compétences, badges et régularité${who === 'partner' ? ` de ${esc(partnerName)}` : ''}.</p>
      </div>
    </header>

    ${state.partner ? segmented('who', [{ value: 'me', label: 'Moi' }, { value: 'partner', label: partnerName }], who, 'Progrès de') : ''}

    <div class="card level-card ${who === 'partner' ? 'is-partner' : ''}">
      <div class="level-badge"><small>Niv.</small>${overall.level}</div>
      <div class="grow">
        <p class="eyebrow">${who === 'me' ? 'Mon niveau global' : `Niveau de ${esc(partnerName)}`}</p>
        <div class="xpbar big"><span style="width:${overall.progress * 100}%"></span></div>
        <p class="small muted"><strong>${overall.xp} XP</strong> · encore ${remaining} XP pour le niveau ${overall.level + 1}</p>
        <p class="small muted">${overall.done} objectif${overall.done > 1 ? 's' : ''} réussi${overall.done > 1 ? 's' : ''} au total</p>
      </div>
    </div>

    <div class="tabs">
      ${segmented('tab', [
        { value: 'skills', label: 'Compétences', icon: 'star' },
        { value: 'badges', label: 'Badges', icon: 'award' },
        { value: 'calendar', label: 'Calendrier', icon: 'calendar' },
      ], tab, 'Rubrique')}
    </div>

    ${body}`;

  return {
    html,
    bind: (main) => delegate(main, {
      who: (el) => {
        state.progressWho = el.dataset.value;
        ctx.rerender();
      },
      tab: (el) => {
        state.progressTab = el.dataset.value;
        ctx.rerender();
      },
      prevMonth: () => {
        state.calMonth = shiftMonth(state.calMonth, -1);
        ctx.rerender();
      },
      nextMonth: () => {
        state.calMonth = shiftMonth(state.calMonth, 1);
        ctx.rerender();
      },
      calDay: (el) => {
        state.day = el.dataset.day;
        location.hash = who === 'me' ? '#/today' : '#/partner';
      },
      addSkill: () => openSkillForm(ctx, who, skills.length),
      openSkill: (el) => openSkill(skills.find((s) => s.id === Number(el.dataset.id)), ctx),
    }),
  };
}

function openSkillForm(ctx, who, count) {
  const sheet = openSheet({
    title: who === 'me' ? 'Nouvelle compétence' : `Nouvelle compétence pour ${firstName(state.partner.name)}`,
    html: `
      <form data-form="save" class="stack">
        <label class="field"><span>Nom</span>
          <input name="name" required maxlength="40" placeholder="Ex : Sport, Lecture, Anglais…" autocomplete="off" data-change="guess">
        </label>
        <fieldset class="field"><legend>Icône</legend>
          <div class="picker">
            ${SKILL_ICONS.map((i, n) => `<label><input type="radio" name="icon" value="${i}" ${n === 0 ? 'checked' : ''}><span aria-label="${i}">${icon(i)}</span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="field"><legend>Couleur</legend>
          <div class="picker colors">
            ${PALETTE.map((c, n) => `<label><input type="radio" name="color" value="${c}" ${n === count % PALETTE.length ? 'checked' : ''}><span style="background:${c}" aria-label="${c}"></span></label>`).join('')}
          </div>
        </fieldset>
        <button type="submit" class="btn btn-primary btn-block">Créer la compétence</button>
      </form>`,
    handlers: {
      // Propose une icône adaptée au nom saisi.
      guess: (el) => {
        const match = sheet.el.querySelector(`input[name="icon"][value="${guessIcon(el.value)}"]`);
        if (match) match.checked = true;
      },
      save: (form) => busy(form, async () => {
        const fd = new FormData(form);
        await post('/skills', { who, name: fd.get('name'), icon: fd.get('icon'), color: fd.get('color') });
        toast('Compétence créée', 'success');
        sheet.close();
        ctx.rerender();
      }),
    },
  });
}

function openSkill(s, ctx) {
  const sheet = openSheet({
    title: s.name,
    html: `
      <div class="skill-detail" style="--c:${esc(s.color)}">
        <div class="level-badge"><small>Niv.</small>${s.level}</div>
        <div class="grow">
          <div class="xpbar big"><span style="width:${s.progress * 100}%"></span></div>
          <p class="small muted"><strong>${s.xp} XP</strong> · encore ${s.next - s.xp} XP pour le niveau ${s.level + 1}</p>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-val">${s.done}</span><span class="stat-lbl">objectifs réussis</span></div>
        <div class="stat"><span class="stat-val">${s.total ? Math.round((s.done / s.total) * 100) : 0}%</span><span class="stat-lbl">taux de réussite</span></div>
      </div>
      <button type="button" class="btn btn-danger btn-block mt" data-action="remove">${icon('trash')} Supprimer la compétence</button>
      <p class="hint center">Les objectifs liés sont conservés, sans compétence.</p>`,
    handlers: {
      remove: async () => {
        if (!(await confirmBox(`Supprimer la compétence « ${s.name} » ?`, 'Supprimer'))) return;
        try {
          await del(`/skills/${s.id}`);
          toast('Compétence supprimée', 'success');
          sheet.close();
          ctx.rerender();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
    },
  });
}
