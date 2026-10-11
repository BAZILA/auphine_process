// Fiche détaillée d'un objectif, partagée par les vues « Aujourd'hui » et « Binôme ».
// Selon mon rôle : je réalise (progression, photo) ou j'encourage (réactions). Tout le monde discute.
import { get, post, patch, del, upload, blobUrl } from '../api.js';
import { state } from '../state.js';
import { today, relDay, weekLabel } from '../dates.js';
import {
  esc, icon, busy, toast, openSheet, choose, skillTag, plainTag, goalState, goalXp, firstName, fmtNum, reactionOf,
  DIFFICULTY, STATE_LABEL, REACTIONS,
} from '../ui.js';
import { progressPct, celebrateBadges } from '../components.js';
import { openGoalForm } from './goal-form.js';

/** Réduit une photo avant l'envoi (1600 px max, JPEG) : rapide même en 4G. */
async function shrinkImage(file, max = 1600) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.82));
}

function timeLabel(sqlDate) {
  const d = new Date(`${sqlDate.replace(' ', 'T')}Z`);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? time : `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${time}`;
}

export function openGoal(g, ctx, { skills = [] } = {}) {
  const me = state.me;
  const isDoer = g.assigneeId === me.id;
  const isAuthor = g.authorId === me.id;
  const isSelf = g.authorId === g.assigneeId;
  const otherName = state.partner ? firstName(state.partner.name) : 'Ton binôme';
  const doerName = isDoer ? 'Toi' : otherName;
  let changed = false;

  const statusRadio = (value, label) => `
    <label><input type="radio" name="status" value="${value}" ${g.status === value ? 'checked' : ''}><span>${label}</span></label>`;

  const progressBlock = () => {
    if (isDoer && g.target != null) {
      return `
        <form data-form="progress" class="block stack">
          <span class="label">Ma progression</span>
          <div class="stepper">
            <button type="button" class="step-btn" data-action="dec" aria-label="Moins">${icon('minus')}</button>
            <input type="number" name="progress" inputmode="decimal" min="0" step="any" value="${g.progress}" aria-label="Progression">
            <span class="step-unit">/ ${fmtNum(g.target)} ${esc(g.unit)}</span>
            <button type="button" class="step-btn" data-action="inc" aria-label="Plus">${icon('plus')}</button>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Enregistrer</button>
        </form>`;
    }
    if (isDoer) {
      return `
        <form data-form="status" class="block stack">
          <span class="label">Où en es-tu ?</span>
          <div class="seg seg-radio">
            ${statusRadio('todo', 'À faire')}${statusRadio('partial', 'Partiel')}${statusRadio('done', 'Fait')}
          </div>
          <button type="submit" class="btn btn-primary btn-block">Enregistrer</button>
        </form>`;
    }
    if (g.target != null) {
      return `
        <div class="block">
          <span class="label">Progression de ${esc(otherName)}</span>
          <div class="xpbar big"><span style="width:${progressPct(g)}%;--c:var(--success)"></span></div>
          <p class="small muted">${fmtNum(g.progress)} / ${fmtNum(g.target)} ${esc(g.unit)}</p>
        </div>`;
    }
    return '';
  };

  const photoBlock = () => `
    <section class="block" data-block="photo">
      <span class="label">${icon('camera', 'sm')} Preuve photo</span>
      ${g.photo
        ? `<div class="proof"><img alt="Preuve photo de ${esc(doerName)}" data-photo="${esc(g.photo)}"><span class="spinner"></span></div>`
        : isDoer ? '' : `<p class="muted small">${esc(otherName)} n'a pas encore ajouté de photo.</p>`}
      ${isDoer ? `
        <div class="row gap">
          <label class="btn btn-ghost grow file-btn">${icon('camera')} ${g.photo ? 'Remplacer la photo' : 'Ajouter une photo'}
            <input type="file" accept="image/*" data-change="photo" hidden>
          </label>
          ${g.photo ? `<button type="button" class="btn btn-ghost" data-action="removePhoto" aria-label="Retirer la photo">${icon('trash')}</button>` : ''}
        </div>` : ''}
    </section>`;

  const reactionBlock = () => {
    if (!isDoer) {
      return `
        <section class="block">
          <span class="label">Réagir</span>
          <div class="reactions">
            ${REACTIONS.map((r) => `
              <button type="button" class="react ${g.reaction === r.key ? 'on' : ''}" data-action="react" data-r="${r.key}"
                aria-pressed="${g.reaction === r.key}" aria-label="${esc(r.label)}" title="${esc(r.label)}">
                ${icon(r.icon)}<span>${esc(r.label)}</span>
              </button>`).join('')}
          </div>
        </section>`;
    }
    const r = reactionOf(g.reaction);
    return r ? `<div class="received">${icon(r.icon)}<span><strong>${esc(otherName)}</strong> : ${esc(r.label)}</span></div>` : '';
  };

  const st = goalState(g, today());
  const sheet = openSheet({
    title: g.title,
    html: `
      <div class="detail">
        <div class="chips">
          <span class="badge b-${st}">${STATE_LABEL[st]}</span>
          ${isSelf ? plainTag('user', 'Perso', 't-self') : ''}
          ${plainTag('calendar', g.period === 'week' ? `Semaine du ${weekLabel(g.day)}` : relDay(g.day))}
          ${g.skillName ? skillTag(g.skillName, g.skillIcon, g.skillColor) : ''}
          ${plainTag('zap', `${DIFFICULTY[g.difficulty].label} · ${DIFFICULTY[g.difficulty].xp} XP`)}
        </div>
        ${g.details ? `<p class="details">${esc(g.details)}</p>` : ''}
        ${isSelf ? '' : `<p class="muted small">Fixé par ${esc(isAuthor ? 'toi' : firstName(g.authorName || otherName))}</p>`}
      </div>
      ${progressBlock()}
      ${reactionBlock()}
      ${photoBlock()}
      <section class="block thread">
        <span class="label">${icon('message', 'sm')} Discussion</span>
        <div class="msgs" aria-live="polite"><p class="muted small">Chargement…</p></div>
        <form data-form="send" class="composer">
          <input name="body" maxlength="1000" placeholder="Écrire un message…" autocomplete="off" aria-label="Message">
          <button type="submit" class="send" aria-label="Envoyer">${icon('send')}</button>
        </form>
      </section>
      ${isAuthor ? `
        <div class="row gap mt">
          <button type="button" class="btn btn-ghost grow" data-action="edit">${icon('edit')} Modifier</button>
          <button type="button" class="btn btn-danger grow" data-action="remove">${icon('trash')} Supprimer</button>
        </div>` : ''}`,
    onClose: () => {
      if (changed) ctx.rerender();
    },
    handlers: {
      dec: () => {
        const input = sheet.el.querySelector('[name="progress"]');
        input.value = Math.max(0, (Number(input.value) || 0) - 1);
      },
      inc: () => {
        const input = sheet.el.querySelector('[name="progress"]');
        input.value = (Number(input.value) || 0) + 1;
      },
      progress: (form) => busy(form, async () => {
        const res = await patch(`/goals/${g.id}`, { progress: Number(form.elements.progress.value) || 0 });
        finishUpdate(res);
      }),
      status: (form) => busy(form, async () => {
        const res = await patch(`/goals/${g.id}`, { status: form.elements.status.value });
        finishUpdate(res);
      }),
      react: (el) => busy(el, async () => {
        const reaction = g.reaction === el.dataset.r ? '' : el.dataset.r;
        const res = await patch(`/goals/${g.id}`, { reaction });
        g.reaction = reaction;
        changed = true;
        sheet.el.querySelectorAll('.react').forEach((b) => {
          const on = b.dataset.r === reaction;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on);
        });
        celebrateBadges(res.newBadges);
      }),
      photo: async (input) => {
        const file = input.files?.[0];
        if (!file) return;
        const label = input.closest('label');
        label.classList.add('loading');
        try {
          const res = await upload(`/goals/${g.id}/photo`, await shrinkImage(file));
          g.photo = res.photo;
          changed = true;
          redrawPhoto();
          toast('Photo ajoutée', 'success', 'camera');
          celebrateBadges(res.newBadges);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          label.classList.remove('loading');
          input.value = '';
        }
      },
      removePhoto: (el) => busy(el, async () => {
        await del(`/goals/${g.id}/photo`);
        g.photo = null;
        changed = true;
        redrawPhoto();
      }),
      send: (form) => busy(form, async () => {
        const input = form.elements.body;
        if (!input.value.trim()) return;
        const res = await post(`/goals/${g.id}/messages`, { body: input.value });
        input.value = '';
        messages.push(res.message);
        changed = true;
        drawMessages();
        celebrateBadges(res.newBadges);
      }),
      edit: () => {
        sheet.close();
        openGoalForm({ ctx, skills, goal: g, who: isSelf ? 'me' : 'partner' });
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

  function finishUpdate(res) {
    if (res.status !== g.status && res.status !== 'todo') {
      state.justDone = g.id;
      toast(`+${goalXp(res)} XP`, 'success', 'zap');
    } else {
      toast('Enregistré', 'success');
    }
    changed = true;
    sheet.close();
    celebrateBadges(res.newBadges);
  }

  function loadPhoto() {
    const img = sheet.el.querySelector('img[data-photo]');
    if (!img) return;
    blobUrl(`/photos/${img.dataset.photo}`)
      .then((url) => {
        img.src = url;
        img.parentElement.classList.add('ready');
      })
      .catch(() => img.parentElement.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Photo indisponible.' })));
  }

  function redrawPhoto() {
    sheet.el.querySelector('[data-block="photo"]').outerHTML = photoBlock();
    loadPhoto();
  }

  // --- Discussion ---
  let messages = [];
  const box = sheet.el.querySelector('.msgs');
  function drawMessages() {
    box.innerHTML = messages.length
      ? messages.map((m) => {
        const mine = m.authorId === me.id;
        return `
          <div class="msg ${mine ? 'mine' : ''}">
            <p>${esc(m.body)}</p>
            <span class="msg-meta">${mine ? '' : `${esc(firstName(m.authorName))} · `}${timeLabel(m.createdAt)}</span>
          </div>`;
      }).join('')
      : `<p class="muted small">Pas encore de message. ${isDoer ? 'Raconte comment ça se passe !' : `Encourage ${esc(otherName)} !`}</p>`;
    box.scrollTop = box.scrollHeight;
  }
  get(`/goals/${g.id}/messages`)
    .then((list) => {
      messages = list;
      drawMessages();
    })
    .catch(() => {
      box.innerHTML = '<p class="muted small">Messages indisponibles.</p>';
    });
  loadPhoto();
}
