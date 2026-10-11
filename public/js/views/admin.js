// Espace d'administration : vue d'ensemble, comptes, annonces, journal.
// L'admin gère les comptes mais ne lit ni les messages ni les photos des binômes.
import { get, post, del } from '../api.js';
import { state } from '../state.js';
import {
  esc, icon, delegate, busy, toast, openSheet, confirmBox, segmented, emptyState, initial, timeAgo,
} from '../ui.js';

const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} Mo`;
function duration(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}
const tile = (iconName, value, label) => `
  <div class="stat"><span class="stat-ico">${icon(iconName)}</span><span class="stat-val">${value}</span><span class="stat-lbl">${label}</span></div>`;

function bars(days, key, color) {
  const max = Math.max(1, ...days.map((d) => d[key]));
  return `
    <div class="mini-bars" role="img">
      ${days.map((d) => `
        <div class="mb" title="${d.day} : ${d[key]}">
          <div class="mb-track"><div class="mb-bar" style="height:${(d[key] / max) * 100}%;background:${color}"></div></div>
          <span>${Number(d.day.slice(8))}</span>
        </div>`).join('')}
    </div>`;
}

function overviewTab(o) {
  const s = o.server;
  return `
    <div class="stats">
      ${tile('users', o.users, `comptes${o.disabled ? ` · ${o.disabled} désactivé${o.disabled > 1 ? 's' : ''}` : ''}`)}
      ${tile('activity', o.active1, "actifs aujourd'hui")}
      ${tile('trending-up', o.active7, 'actifs sur 7 jours')}
      ${tile('link', o.pairs, 'binômes liés')}
      ${tile('target', `${o.week.done}<small>/${o.week.total}</small>`, 'objectifs cette semaine')}
      ${tile('check-circle', o.week.rate == null ? '–' : `${o.week.rate}<small> %</small>`, 'réussite cette semaine')}
      ${tile('message', o.messages, 'messages')}
      ${tile('camera', o.photos, 'preuves photo')}
    </div>
    <section class="section">
      <div class="section-head"><h2>Objectifs réussis · 14 jours</h2></div>
      <div class="card">${bars(o.days, 'done', 'var(--success)')}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Inscriptions · 14 jours</h2></div>
      <div class="card">${bars(o.days, 'signups', 'var(--primary)')}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Serveur</h2></div>
      <div class="card kv">
        <div><span>Version</span><strong>v${esc(s.version)} · ${esc(s.build)}</strong></div>
        <div><span>En ligne depuis</span><strong>${duration(s.uptime)}</strong></div>
        <div><span>Mémoire utilisée</span><strong>${mb(s.memory)}</strong></div>
        <div><span>Base de données</span><strong>${mb(s.dbSize)}</strong></div>
        <div><span>Photos</span><strong>${mb(s.uploadsSize)}</strong></div>
        <div><span>Appareils notifiés</span><strong>${o.devices}</strong></div>
        <div><span>Administrateurs</span><strong>${o.admins}</strong></div>
        <div><span>Node.js</span><strong>${esc(s.node)}</strong></div>
      </div>
    </section>`;
}

function usersTab(users) {
  return `
    <div class="search">
      ${icon('search')}
      <input type="search" placeholder="Rechercher un nom ou un e-mail" data-input="search" aria-label="Rechercher un compte">
    </div>
    <p class="muted small" data-count>${users.length} compte${users.length > 1 ? 's' : ''}</p>
    <div class="admin-users">
      ${users.map((u) => `
        <button type="button" class="admin-user ${u.disabled ? 'is-off' : ''}" data-action="user" data-id="${u.id}"
          data-search="${esc(`${u.name} ${u.email}`.toLowerCase())}">
          <span class="avatar">${esc(initial(u.name))}</span>
          <span class="grow">
            <span class="row gap-s"><strong>${esc(u.name)}</strong>
              ${u.isAdmin ? '<span class="badge b-admin">Admin</span>' : ''}
              ${u.disabled ? '<span class="badge b-missed">Désactivé</span>' : ''}</span>
            <span class="small muted ellipsis">${esc(u.email)}</span>
            <span class="small muted">${u.partnerName ? `Binôme : ${esc(u.partnerName)}` : 'Sans binôme'} · vu ${timeAgo(u.lastSeen)}</span>
          </span>
          ${icon('chevR')}
        </button>`).join('')}
    </div>`;
}

function broadcastTab(count) {
  return `
    <form data-form="broadcast" class="card stack">
      <p class="small muted">L'annonce arrive dans la cloche de tous les comptes actifs, et en notification sur les appareils où elles sont activées.</p>
      <label class="field"><span>Titre</span><input name="title" required maxlength="80" placeholder="Ex : Nouvelle version disponible"></label>
      <label class="field"><span>Message <em>(facultatif)</em></span><textarea name="body" rows="3" maxlength="300" placeholder="Ce qui change, une info importante…"></textarea></label>
      <button type="submit" class="btn btn-primary btn-block">${icon('megaphone')} Envoyer à ${count} compte${count > 1 ? 's' : ''}</button>
    </form>`;
}

function logTab(entries) {
  return entries.length
    ? `<div class="card log">${entries.map((e) => `
        <div class="log-row">
          <strong>${esc(e.action)}</strong>
          <span class="small muted">${esc(e.target)}</span>
          <span class="small muted">${esc(e.adminName || 'Admin supprimé')} · ${timeAgo(e.createdAt)}</span>
        </div>`).join('')}</div>`
    : emptyState('clock', 'Journal vide', 'Les actions des administrateurs apparaîtront ici.');
}

export async function AdminView(ctx) {
  if (!state.me.isAdmin) {
    return { html: emptyState('lock', 'Accès réservé', 'Cet espace est réservé aux administrateurs.') };
  }
  const tab = state.adminTab;
  let body;
  let users = [];
  if (tab === 'users' || tab === 'broadcast') users = await get('/admin/users');
  if (tab === 'overview') body = overviewTab(await get('/admin/overview'));
  else if (tab === 'users') body = usersTab(users);
  else if (tab === 'broadcast') body = broadcastTab(users.filter((u) => !u.disabled).length);
  else body = logTab(await get('/admin/log'));

  const html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${icon('shield', 'xs')} Administration</p>
        <h1>Tableau de bord</h1>
        <p class="sub">Comptes, activité et santé du serveur.</p>
      </div>
      <button type="button" class="icon-btn" data-action="refresh" aria-label="Actualiser">${icon('refresh')}</button>
    </header>
    <div class="tabs">
      ${segmented('tab', [
        { value: 'overview', label: 'Vue', icon: 'chart' },
        { value: 'users', label: 'Comptes', icon: 'users' },
        { value: 'broadcast', label: 'Annonce', icon: 'megaphone' },
        { value: 'log', label: 'Journal', icon: 'clock' },
      ], tab, 'Rubrique')}
    </div>
    <div class="admin-body">${body}</div>`;

  return {
    html,
    bind: (main) => delegate(main, {
      tab: (el) => {
        state.adminTab = el.dataset.value;
        ctx.rerender();
      },
      refresh: () => ctx.rerender({ fresh: true }),
      search: (input) => {
        const q = input.value.trim().toLowerCase();
        let shown = 0;
        main.querySelectorAll('.admin-user').forEach((el) => {
          const ok = !q || el.dataset.search.includes(q);
          el.hidden = !ok;
          if (ok) shown++;
        });
        main.querySelector('[data-count]').textContent = `${shown} compte${shown > 1 ? 's' : ''}`;
      },
      user: (el) => openUser(users.find((u) => u.id === Number(el.dataset.id)), ctx),
      broadcast: (form) => busy(form, async () => {
        const fd = new FormData(form);
        if (!(await confirmBox(`Envoyer « ${fd.get('title')} » à tous les comptes ?`, 'Envoyer'))) return;
        const { sent } = await post('/admin/broadcast', { title: fd.get('title'), body: fd.get('body') });
        toast(`Annonce envoyée à ${sent} compte${sent > 1 ? 's' : ''}`, 'success', 'megaphone');
        form.reset();
      }),
    }),
  };
}

function openUser(u, ctx) {
  const self = u.id === state.me.id;
  const action = (name, iconName, label, kind = 'btn-ghost', hidden = false) => (hidden ? '' : `
    <button type="button" class="btn ${kind} btn-block admin-act" data-action="${name}">${icon(iconName)} ${label}</button>`);
  let changed = false;

  const sheet = openSheet({
    title: u.name,
    html: `
      <div class="card kv">
        <div><span>E-mail</span><strong class="ellipsis">${esc(u.email)}</strong></div>
        <div><span>Inscrit</span><strong>${timeAgo(u.createdAt)}</strong></div>
        <div><span>Dernière activité</span><strong>${timeAgo(u.lastSeen)}</strong></div>
        <div><span>Binôme</span><strong>${u.partnerName ? esc(u.partnerName) : '–'}</strong></div>
        <div><span>Objectifs</span><strong>${u.done} réussis / ${u.goals}</strong></div>
        <div><span>Appareils notifiés</span><strong>${u.devices}</strong></div>
      </div>
      <div class="password-out" hidden></div>
      <div class="stack mt">
        ${action('password', 'key', 'Réinitialiser le mot de passe')}
        ${action('logout', 'logout', 'Déconnecter de tous les appareils')}
        ${action('unpair', 'link', 'Délier le binôme', 'btn-ghost', !u.partnerName)}
        ${action('toggleAdmin', 'shield', u.isAdmin ? 'Retirer les droits admin' : 'Donner les droits admin', 'btn-ghost', self)}
        ${action('toggleDisabled', u.disabled ? 'check-circle' : 'ban', u.disabled ? 'Réactiver le compte' : 'Désactiver le compte', 'btn-danger', self)}
        ${action('remove', 'user-x', 'Supprimer le compte', 'btn-danger', self)}
      </div>
      ${self ? '<p class="hint center">Certaines actions ne sont pas possibles sur ton propre compte.</p>' : ''}`,
    onClose: () => {
      if (changed) ctx.rerender({ fresh: true });
    },
    handlers: {
      password: (el) => busy(el, async () => {
        if (!(await confirmBox(`Générer un nouveau mot de passe pour ${u.name} ? Ses sessions seront fermées.`, 'Réinitialiser'))) return;
        const { password } = await post(`/admin/users/${u.id}/password`);
        const out = sheet.el.querySelector('.password-out');
        out.hidden = false;
        out.innerHTML = `
          <div class="card password-card">
            <span class="small muted">Nouveau mot de passe (affiché une seule fois) :</span>
            <div class="row between gap"><code>${esc(password)}</code>
              <button type="button" class="icon-btn" data-action="copyPassword" data-p="${esc(password)}" aria-label="Copier">${icon('copy')}</button></div>
            <span class="small muted">Transmets-le à ${esc(u.name)} : il ou elle pourra le changer dans son Profil.</span>
          </div>`;
      }),
      copyPassword: async (el) => {
        try {
          await navigator.clipboard.writeText(el.dataset.p);
          toast('Mot de passe copié', 'success');
        } catch {
          toast('Copie impossible : recopie-le à la main', 'error');
        }
      },
      logout: (el) => busy(el, async () => {
        const { sessions } = await post(`/admin/users/${u.id}/logout`);
        toast(`${sessions} session${sessions > 1 ? 's' : ''} fermée${sessions > 1 ? 's' : ''}`, 'success');
      }),
      unpair: (el) => busy(el, async () => {
        if (!(await confirmBox(`Délier ${u.name} de ${u.partnerName} ?`, 'Délier'))) return;
        await post(`/admin/users/${u.id}/unpair`);
        changed = true;
        toast('Binôme délié', 'success');
        sheet.close();
      }),
      toggleAdmin: (el) => busy(el, async () => {
        await post(`/admin/users/${u.id}/admin`, { isAdmin: !u.isAdmin });
        changed = true;
        toast(u.isAdmin ? 'Droits admin retirés' : 'Droits admin donnés', 'success', 'shield');
        sheet.close();
      }),
      toggleDisabled: (el) => busy(el, async () => {
        if (!u.disabled && !(await confirmBox(`Désactiver le compte de ${u.name} ? Il ou elle sera déconnecté·e et ne pourra plus se connecter.`, 'Désactiver'))) return;
        await post(`/admin/users/${u.id}/disabled`, { disabled: !u.disabled });
        changed = true;
        toast(u.disabled ? 'Compte réactivé' : 'Compte désactivé', 'success');
        sheet.close();
      }),
      remove: (el) => busy(el, async () => {
        if (!(await confirmBox(`Supprimer définitivement le compte de ${u.name}, ses objectifs, messages et photos ? Cette action est irréversible.`, 'Supprimer définitivement'))) return;
        await del(`/admin/users/${u.id}`);
        changed = true;
        toast('Compte supprimé', 'success');
        sheet.close();
      }),
    },
  });
}
