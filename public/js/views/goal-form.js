// Formulaire de création / modification d'un objectif (pour mon binôme ou pour moi).
import { post, patch } from '../api.js';
import { state } from '../state.js';
import { mondayOf, addDays, weekLabel } from '../dates.js';
import { esc, icon, openSheet, busy, toast, firstName, guessIcon, DIFFICULTY, PALETTE } from '../ui.js';

const SUGGESTIONS = [
  { icon: 'droplet', text: "Boire 1,5 L d'eau" },
  { icon: 'book', text: 'Lire 20 pages' },
  { icon: 'activity', text: '30 min de sport' },
  { icon: 'leaf', text: '10 min de méditation' },
  { icon: 'smartphone', text: "Pas d'écran après 22 h" },
  { icon: 'moon', text: 'Au lit avant 23 h' },
  { icon: 'globe', text: "15 min d'anglais" },
  { icon: 'dumbbell', text: '3 séances de sport', period: 'week', target: 3, unit: 'séances' },
  { icon: 'activity', text: 'Courir 20 km', period: 'week', target: 20, unit: 'km' },
  { icon: 'book', text: 'Finir un livre', period: 'week' },
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

/** Un lundi par semaine, sur N semaines. */
const expandWeeks = (start, weeks) => Array.from({ length: weeks }, (_, w) => addDays(mondayOf(start), w * 7));

export function openGoalForm({ ctx, skills, goal = null, day, who = 'partner', period = 'day' }) {
  const edit = Boolean(goal);
  const g = goal || { title: '', details: '', skillId: null, difficulty: 1, day, period, target: null, unit: '' };
  const forMe = who === 'me';
  const partner = state.partner ? firstName(state.partner.name) : '';
  const isWeek = () => {
    const checked = sheet.el.querySelector('[name="period"]:checked');
    return checked ? checked.value === 'week' : g.period === 'week';
  };

  let title = "Modifier l'objectif";
  if (!edit) title = forMe ? 'Nouvel objectif perso' : `Nouvel objectif pour ${partner}`;

  const sheet = openSheet({
    title,
    html: `
      <form data-form="save" class="stack" data-period="${g.period}">
        ${edit ? '' : `
          <div class="suggest" aria-label="Idées d'objectifs">
            ${SUGGESTIONS.map((s, i) => `<button type="button" class="chip" data-action="suggest" data-i="${i}">${icon(s.icon, 'sm')}${esc(s.text)}</button>`).join('')}
          </div>
          <fieldset class="field">
            <legend>Fréquence</legend>
            <div class="seg seg-radio">
              <label><input type="radio" name="period" value="day" data-change="periodChange" ${g.period === 'day' ? 'checked' : ''}><span>Un jour</span></label>
              <label><input type="radio" name="period" value="week" data-change="periodChange" ${g.period === 'week' ? 'checked' : ''}><span>Toute la semaine</span></label>
            </div>
          </fieldset>`}
        <label class="field"><span>Objectif</span>
          <input name="title" required maxlength="120" value="${esc(g.title)}" placeholder="Ex : 30 min de marche rapide" autocomplete="off">
        </label>
        <div class="field">
          <span>Objectif chiffré <em>(facultatif)</em></span>
          <div class="row gap">
            <input name="target" type="number" inputmode="decimal" min="0" step="any" value="${g.target ?? ''}" placeholder="Ex : 3" aria-label="Quantité à atteindre" class="w-qty">
            <input name="unit" maxlength="20" value="${esc(g.unit)}" placeholder="séances, km, pages…" aria-label="Unité" autocomplete="off">
          </div>
          <p class="hint">La progression se met à jour au fil de l'eau ; l'objectif est validé une fois la quantité atteinte.</p>
        </div>
        <label class="field"><span>Détails <em>(facultatif)</em></span>
          <textarea name="details" rows="2" maxlength="1000" placeholder="Ce qui est attendu, un conseil, un critère de réussite…">${esc(g.details)}</textarea>
        </label>
        <label class="field"><span>Compétence travaillée</span>
          <select name="skillId" data-change="skillChange">
            <option value="">Aucune</option>
            ${skills.map((s) => `<option value="${s.id}" ${s.id === g.skillId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            <option value="new">+ Nouvelle compétence…</option>
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
        <label class="field">
          <span data-only="day">${edit ? 'Jour' : 'Pour le'}</span>
          <span data-only="week">${edit ? `Semaine (actuellement du ${weekLabel(g.day)})` : 'Semaine du'}</span>
          <input type="date" name="day" required value="${g.day}">
        </label>
        ${edit ? '' : `
          <fieldset class="field">
            <legend>Répéter <em>(facultatif)</em></legend>
            <div class="weekdays" data-only="day">
              ${WEEKDAY_LETTERS.map((l, i) => `<label class="wd"><input type="checkbox" name="rep" value="${i}"><span>${l}</span></label>`).join('')}
            </div>
            <select name="weeks" aria-label="Durée de la répétition">
              <option value="1">Pendant 1 semaine</option>
              <option value="2">Pendant 2 semaines</option>
              <option value="4">Pendant 4 semaines</option>
            </select>
            <p class="hint" data-only="day">Les jours cochés sont planifiés à partir de la date choisie.</p>
            <p class="hint" data-only="week">Un objectif est créé pour chacune des semaines.</p>
          </fieldset>`}
        <button type="submit" class="btn ${forMe ? 'btn-primary' : 'btn-accent'} btn-block">${edit ? 'Enregistrer' : 'Fixer cet objectif'}</button>
      </form>`,
    handlers: {
      suggest: (el) => {
        const s = SUGGESTIONS[Number(el.dataset.i)];
        const form = sheet.el.querySelector('form');
        form.elements.title.value = s.text;
        form.elements.target.value = s.target ?? '';
        form.elements.unit.value = s.unit ?? '';
        const radio = form.querySelector(`[name="period"][value="${s.period || 'day'}"]`);
        if (radio) radio.checked = true;
        syncPeriod();
      },
      periodChange: syncPeriod,
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
          target: fd.get('target') === '' ? null : Number(fd.get('target')),
          unit: fd.get('unit'),
        };
        if (body.target != null && !(body.target > 0)) throw new Error('La quantité doit être supérieure à 0');
        let skillId = fd.get('skillId');
        if (skillId === 'new') {
          const name = String(fd.get('newSkill') || '').trim();
          if (!name) throw new Error('Donne un nom à la nouvelle compétence');
          const created = await post('/skills', {
            who, name, icon: guessIcon(name), color: PALETTE[skills.length % PALETTE.length],
          });
          skillId = created.id;
        }
        body.skillId = skillId ? Number(skillId) : null;
        const start = fd.get('day');

        if (edit) {
          await patch(`/goals/${goal.id}`, { ...body, day: start });
          toast('Objectif modifié', 'success');
        } else {
          body.who = who;
          body.period = isWeek() ? 'week' : 'day';
          const weeks = Number(fd.get('weeks') || 1);
          body.days = body.period === 'week'
            ? expandWeeks(start, weeks)
            : expandDays(start, fd.getAll('rep').map(Number), weeks);
          if (!body.days.length) throw new Error('Aucun jour coché à partir de cette date');
          await post('/goals', body);
          const n = body.days.length;
          toast(forMe
            ? `${n > 1 ? `${n} objectifs ajoutés` : 'Objectif ajouté'}`
            : `${n > 1 ? `${n} objectifs fixés` : 'Objectif fixé'} pour ${partner}`, 'success', 'target');
          state.day = body.period === 'week' ? start : body.days[0];
        }
        sheet.close();
        ctx.rerender();
      }),
    },
  });

  function syncPeriod() {
    sheet.el.querySelector('form').dataset.period = isWeek() ? 'week' : 'day';
  }
}
