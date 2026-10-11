// État global de l'application (volontairement minimal).
import { today, mondayOf } from './dates.js';

export const state = {
  me: null,          // { id, name, email, inviteCode, notifPrefs }
  partner: null,     // { id, name } | null
  day: today(),      // jour sélectionné (vues Aujourd'hui / Binôme)
  reportWeek: mondayOf(today()),
  reportWho: 'me',   // bilan affiché : 'me' | 'partner'
  progressWho: 'me', // vue Progrès : 'me' | 'partner'
  progressTab: 'skills', // 'skills' | 'badges' | 'calendar'
  calMonth: today().slice(0, 7),
  adminTab: 'overview', // 'overview' | 'users' | 'broadcast' | 'log'
  justDone: null,    // id d'un objectif qui vient d'être coché (animation)
  installPrompt: null,
};

export function setProfile({ user, partner }) {
  state.me = user;
  state.partner = partner;
}
