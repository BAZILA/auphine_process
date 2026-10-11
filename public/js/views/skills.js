// Vue « Compétences » : niveaux et XP, par compétence.
import { get, post, del } from '../api.js';
import { state } from '../state.js';
import { esc, icon, delegate, busy, toast, openSheet, confirmBox, segmented, emptyState, firstName, PALETTE, SKILL_ICONS, guessIcon } from '../ui.js';

export async function SkillsView(ctx) {
  const who = state.partner ? state.skillsWho : 'me';
  const { skills, overall } = await get(`/skills?who=${who}`);
  const partnerName = state.partner ? firstName(state.partner.name) : null;
  const owner = who === 'me' ? 'Mon' : `${esc(partnerName)} ·`;
  const remaining = overall.next - overall.xp;

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">Progression</p>
        <h1>Compétences</h1>
        <p class="sub">Chaque objectif réussi fait gagner de l'XP à la compétence liée.</p>
      </div>
    </header>

    ${state.partner ? segmented('who', [{ value: 'me', label: 'Moi' }, { value: 'partner', label: partnerName }], who, 'Compétences de') : ''}

    <div class="card level-card ${who === 'partner' ? 'is-partner' : ''}">
      <div class="level-badge"><small>Niv.</small>${overall.level}</div>
      <div class="grow">
        <p class="eyebrow">${owner} niveau global</p>
        <div class="xpbar big"><span style="width:${overall.progress * 100}%"></span></div>
        <p class="small muted"><strong>${overall.xp} XP</strong> · encore ${remaining} XP pour le niveau ${overall.level + 1}</p>
        <p class="small muted">${overall.done} objectif${overall.done > 1 ? 's' : ''} réussi${overall.done > 1 ? 's' : ''} au total</p>
      </div>
    </div>

    <section class="section">
      <div class="section-head">
        <h2>${skills.length} compétence${skills.length > 1 ? 's' : ''}</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-action="add">${icon('plus')} Ajouter</button>
      </div>
      ${skills.length ? `
        <div class="skills">
          ${skills.map((s) => `
            <button type="button" class="skill" data-action="open" data-id="${s.id}" style="--c:${esc(s.color)}">
              <span class="skill-icon" aria-hidden="true">${esc(s.icon)}</span>
              <span class="skill-body">
                <span class="row between"><strong>${esc(s.name)}</strong><span class="lvl">Niv. ${s.level}</span></span>
                <span class="xpbar"><span style="width:${s.progress * 100}%"></span></span>
                <span class="small muted">${s.xp} XP · ${s.done} réussi${s.done > 1 ? 's' : ''} sur ${s.total}</span>
              </span>
            </button>`).join('')}
        </div>`
        : emptyState('🌱', 'Aucune compétence', who === 'me'
          ? 'Crée les compétences que tu veux développer : sport, lecture, langue…'
          : `Crée les compétences que ${partnerName} veut développer.`,
        `<button type="button" class="btn btn-primary" data-action="add">${icon('plus')} Ajouter une compétence</button>`)}
    </section>

    <div class="card tip">
      <strong>Comment gagner de l'XP ?</strong>
      <p class="small muted">Facile = 10 XP · Moyen = 20 XP · Difficile = 30 XP. Un objectif « partiel » rapporte la moitié.
      Les niveaux se débloquent à 100, 300, 600, 1000 XP…</p>
    </div>`;

  return {
    html,
    bind: (main) => delegate(main, {
      who: (el) => {
        state.skillsWho = el.dataset.value;
        ctx.rerender();
      },
      add: () => openSkillForm(ctx, who, skills.length),
      open: (el) => openSkill(skills.find((s) => s.id === Number(el.dataset.id)), ctx),
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
            ${SKILL_ICONS.map((i, n) => `<label><input type="radio" name="icon" value="${i}" ${n === 0 ? 'checked' : ''}><span>${i}</span></label>`).join('')}
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
        toast('Compétence créée ✔', 'success');
        sheet.close();
        ctx.rerender();
      }),
    },
  });
}

function openSkill(s, ctx) {
  const sheet = openSheet({
    title: `${s.icon} ${s.name}`,
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
