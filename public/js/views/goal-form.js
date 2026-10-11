// Formulaire de création / modification d'un objectif pour mon binôme.
import { post, patch } from '../api.js';
import { state } from '../state.js';
import { mondayOf, addDays } from '../dates.js';
import { esc, openSheet, busy, toast, firstName, guessIcon, DIFFICULTY, PALETTE } from '../ui.js';

const SUGGESTIONS = [
  "💧 Boire 1,5 L d'eau",
  '📚 Lire 20 pages',
  '🏃 30 min de sport',
  '🧘 10 min de méditation',
  "📵 Pas d'écran après 22 h",
  '🛏️ Au lit avant 23 h',
  "🗣️ 15 min d'anglais",
  '🥗 Un repas fait maison',
];
const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Jours concernés : la date de départ seule, ou les jours cochés sur N semaines à partir de cette date. */
export function expandDays(start, weekdays, weeks) {
  if (!weekdays.length) return [start];
  const monday = mondayOf(start);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    for (const i of weekdays) {
      const d = addDays(monday, w * 7 + i);
      if (d >= start) out.push(d);
    }
  }
  return out.sort();
}

export function openGoalForm({ ctx, skills, goal = null, day }) {
  const edit = Boolean(goal);
  const g = goal || { title: '', details: '', skillId: null, difficulty: 1, day };
  const partner = firstName(state.partner.name);

  const sheet = openSheet({
    title: edit ? "Modifier l'objectif" : `Nouvel objectif pour ${partner}`,
    html: `
      <form data-form="save" class="stack">
        ${edit ? '' : `
          <div class="suggest" aria-label="Idées d'objectifs">
            ${SUGGESTIONS.map((s) => `<button type="button" class="chip" data-action="suggest">${esc(s)}</button>`).join('')}
          </div>`}
        <label class="field"><span>Objectif</span>
          <input name="title" required maxlength="120" value="${esc(g.title)}" placeholder="Ex : 30 min de marche rapide" autocomplete="off">
        </label>
        <label class="field"><span>Détails <em>(facultatif)</em></span>
          <textarea name="details" rows="2" maxlength="1000" placeholder="Ce que tu attends, un conseil, un critère de réussite…">${esc(g.details)}</textarea>
        </label>
        <label class="field"><span>Compétence travaillée</span>
          <select name="skillId" data-change="skillChange">
            <option value="">Aucune</option>
            ${skills.map((s) => `<option value="${s.id}" ${s.id === g.skillId ? 'selected' : ''}>${esc(s.icon)} ${esc(s.name)}</option>`).join('')}
            <option value="new">＋ Nouvelle compétence…</option>
          </select>
        </label>
        <label class="field" data-newskill hidden><span>Nom de la nouvelle compétence</span>
          <input name="newSkill" maxlength="40" placeholder="Ex : Sport, Lecture, Anglais…">
        </label>
        <fieldset class="field">
          <legend>Difficulté</legend>
          <div class="seg seg-radio">
            ${[1, 2, 3].map((v) => `
              <label><input type="radio" name="difficulty" value="${v}" ${v === g.difficulty ? 'checked' : ''}>
                <span>${DIFFICULTY[v].label}<small>${DIFFICULTY[v].xp} XP</small></span></label>`).join('')}
          </div>
        </fieldset>
        <label class="field"><span>${edit ? 'Jour' : 'Pour le'}</span>
          <input type="date" name="day" required value="${g.day}">
        </label>
        ${edit ? '' : `
          <fieldset class="field">
            <legend>Répéter <em>(facultatif)</em></legend>
            <div class="weekdays">
              ${WEEKDAY_LETTERS.map((l, i) => `<label class="wd"><input type="checkbox" name="rep" value="${i}"><span>${l}</span></label>`).join('')}
            </div>
            <select name="weeks" aria-label="Durée de la répétition">
              <option value="1">Pendant 1 semaine</option>
              <option value="2">Pendant 2 semaines</option>
              <option value="4">Pendant 4 semaines</option>
            </select>
            <p class="hint">Les jours cochés sont planifiés à partir de la date choisie.</p>
          </fieldset>`}
        <button type="submit" class="btn btn-accent btn-block">${edit ? 'Enregistrer' : 'Fixer cet objectif'}</button>
      </form>`,
    handlers: {
      suggest: (el) => {
        const input = sheet.el.querySelector('[name="title"]');
        input.value = el.textContent.trim();
        input.focus({ preventScroll: true });
      },
      skillChange: (el) => {
        const wrap = sheet.el.querySelector('[data-newskill]');
        wrap.hidden = el.value !== 'new';
        if (!wrap.hidden) wrap.querySelector('input').focus();
      },
      save: (form) => busy(form, async () => {
        const fd = new FormData(form);
        const body = {
          title: fd.get('title'),
          details: fd.get('details'),
          difficulty: Number(fd.get('difficulty') || 1),
        };
        let skillId = fd.get('skillId');
        if (skillId === 'new') {
          const name = String(fd.get('newSkill') || '').trim();
          if (!name) throw new Error('Donne un nom à la nouvelle compétence');
          const created = await post('/skills', {
            who: 'partner', name, icon: guessIcon(name), color: PALETTE[skills.length % PALETTE.length],
          });
          skillId = created.id;
        }
        body.skillId = skillId ? Number(skillId) : null;
        const start = fd.get('day');

        if (edit) {
          await patch(`/goals/${goal.id}`, { ...body, day: start });
          toast('Objectif modifié ✔', 'success');
        } else {
          body.days = expandDays(start, fd.getAll('rep').map(Number), Number(fd.get('weeks') || 1));
          if (!body.days.length) throw new Error('Aucun jour coché à partir de cette date');
          await post('/goals', body);
          toast(body.days.length > 1
            ? `${body.days.length} objectifs fixés pour ${partner} 🎯`
            : `Objectif fixé pour ${partner} 🎯`, 'success');
          state.day = body.days[0];
        }
        sheet.close();
        ctx.rerender();
      }),
    },
  });
}
