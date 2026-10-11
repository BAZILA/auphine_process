// Centre de notifications : ouvert depuis la cloche de la barre du haut.
import { api, post } from '../api.js';
import { state } from '../state.js';
import { esc, icon, openSheet, toast, busy, timeAgo } from '../ui.js';
import { pushSupported, currentSubscription, enablePush } from '../push.js';

const KIND_ICON = {
  goals: 'target', social: 'message', badges: 'award', reminder: 'clock', weekly: 'chart', admin: 'megaphone', info: 'bell',
};

export async function openNotifications({ onRead } = {}) {
  const sheet = openSheet({
    title: 'Notifications',
    className: 'notif-sheet',
    html: '<div class="notif-push"></div><div class="notif-list"><div class="boot small-boot"><span class="spinner"></span></div></div>',
    handlers: {
      enable: (el) => busy(el, async () => {
        await enablePush();
        toast('Notifications activées sur cet appareil', 'success', 'bell');
        sheet.el.querySelector('.notif-push').innerHTML = '';
      }),
      go: (el) => {
        sheet.close();
        const target = el.dataset.url || '#/today';
        const hash = target.includes('#') ? target.slice(target.indexOf('#')) : '#/today';
        if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else location.hash = hash;
      },
    },
  });

  // Invitation à activer le push si cet appareil ne le reçoit pas encore.
  if (pushSupported() && Notification.permission !== 'denied') {
    currentSubscription().then((sub) => {
      if (sub) return;
      sheet.el.querySelector('.notif-push').innerHTML = `
        <div class="card notif-callout">
          <span class="banner-icon">${icon('bell')}</span>
          <span class="grow small"><strong>Reçois-les aussi sur ce téléphone</strong><br><span class="muted">Même quand l'appli est fermée.</span></span>
          <button type="button" class="btn btn-primary btn-sm" data-action="enable">Activer</button>
        </div>`;
    }).catch(() => {});
  }

  try {
    const { items } = await api('GET', '/notifications'); // toujours à jour, jamais depuis le cache
    const list = sheet.el.querySelector('.notif-list');
    list.innerHTML = items.length
      ? items.map((n) => `
          <button type="button" class="notif ${n.read ? '' : 'unread'}" data-action="go" data-url="${esc(n.url)}">
            <span class="notif-icon k-${esc(n.kind)}">${icon(KIND_ICON[n.kind] || 'bell')}</span>
            <span class="notif-text">
              <strong>${esc(n.title)}</strong>
              ${n.body ? `<span>${esc(n.body)}</span>` : ''}
              <small>${timeAgo(n.createdAt)}</small>
            </span>
          </button>`).join('')
      : `<div class="empty"><div class="empty-icon">${icon('bell')}</div><p class="empty-title">Rien de neuf</p>
          <p class="muted">Les objectifs fixés, réactions, messages et badges apparaîtront ici.</p></div>`;
    if (items.some((n) => !n.read)) {
      await post('/notifications/read');
      if (state.me) state.me.unread = 0;
      onRead?.();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}
