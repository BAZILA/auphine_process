// Dates locales au format "YYYY-MM-DD".
const pad = (n) => String(n).padStart(2, '0');

export const toDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDay(new Date());

export function parseDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

export const mondayOf = (s) => addDays(s, -((parseDay(s).getDay() + 6) % 7));
export const weekDays = (s) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(s), i));

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

/** "lun", "mar"… */
export const dayShort = (s) => fmtWeekday.format(parseDay(s)).replace('.', '');
export const dayNum = (s) => parseDay(s).getDate();
/** "Samedi 11 octobre" */
export const dayLong = (s) => cap(fmtLong.format(parseDay(s)));
/** "11/10" */
export const dayShortNum = (s) => {
  const d = parseDay(s);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/** "Aujourd'hui", "Hier", "Demain" ou la date complète. */
export function relDay(s) {
  const t = today();
  if (s === t) return "Aujourd'hui";
  if (s === addDays(t, -1)) return 'Hier';
  if (s === addDays(t, 1)) return 'Demain';
  return dayLong(s);
}

/** "6 – 12 oct." ou "29 sept. – 5 oct." */
export function weekLabel(monday) {
  const a = parseDay(monday);
  const b = parseDay(addDays(monday, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${fmtMonth.format(b)}`
    : `${a.getDate()} ${fmtMonth.format(a)} – ${b.getDate()} ${fmtMonth.format(b)}`;
}
