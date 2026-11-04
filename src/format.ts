/** Display formatting from the installation's brand settings (locale, timezone, currency, date format). */
let locale = 'en-IN';
let tz = 'Asia/Kolkata';
let dateFormat = 'DD/MM/YYYY';
let currency = 'INR';
export const setLocalePrefs = (p: { locale?: string; timezone?: string; dateFormat?: string; currency?: string }) => {
  if (p.locale) locale = p.locale;
  if (p.timezone) tz = p.timezone;
  if (p.dateFormat) dateFormat = p.dateFormat;
  if (p.currency) currency = p.currency;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' business date → tenant display format (no timezone shifting). */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  if (dateFormat === 'YYYY-MM-DD') return `${y}-${m}-${day}`;
  if (dateFormat === 'DD-MMM-YYYY') return `${day}-${MONTHS[Number(m) - 1]}-${y}`;
  if (dateFormat === 'DD-MM-YYYY') return `${day}-${m}-${y}`;
  return `${day}/${m}/${y}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return `${fmtDate(local)} ${fmtTime(iso)}`;
}

/** The tenant-timezone date of a timestamp. Never slice an ISO timestamp: that gives the UTC date. */
export function fmtDateOfInstant(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fmtDate(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)));
}

export const fmtMinutes = (m: number | null | undefined) => (m == null ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);

/** Money in the installation's currency and locale. */
export const money = (n: number | string) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(n));

/** A plain number in the installation's locale. */
export const fmtNumber = (n: number | string, maximumFractionDigits = 2) => new Intl.NumberFormat(locale, { maximumFractionDigits }).format(Number(n));

/** The currency's symbol, for mask text and labels. */
export function currencySymbol(): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
}

/** "YYYY-MM" or "YYYY-MM-DD" as "June 2026". */
export const fmtMonth = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A clock time in a given timezone, for the punch card. */
export const fmtClock = (timeZone: string, at = new Date()) => new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12: true }).format(at);

/** Today's business date in the tenant timezone, 'YYYY-MM-DD'. */
export const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Local wall-clock 'YYYY-MM-DDTHH:MM' in the tenant tz → ISO with offset (IST only fixed offset; others via Intl). */
export function localInputToIso(value: string): string {
  const [date, time] = value.split('T') as [string, string];
  const naive = Date.parse(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(naive));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const offsetMin = (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - naive) / 60000;
  return new Date(naive - offsetMin * 60000).toISOString();
}

export const STATUS_LABEL: Record<string, string> = {
  present: 'Present', half_day: 'Half day', absent: 'Absent', missing_punch: 'Missing punch', weekly_off: 'Weekly off',
  holiday: 'Holiday', not_joined: 'Not employed', not_calculated: 'Not calculated', on_leave: 'On leave', on_duty: 'On field duty',
  self_submitted: 'Self-review done', manager_submitted: 'Manager review done', in_repair: 'In repair',
  not_started: 'Not started', acknowledged: 'Acknowledged', finalized: 'Finalized', available: 'Available', issued: 'Issued', lost: 'Lost',
};

export const EXCEPTION_LABEL: Record<string, string> = {
  duty_on_leave: 'Field duty during full-day leave', late_arrival: 'Late arrival', early_exit: 'Early exit', missing_out_punch: 'Missing out-punch', out_without_in: 'Out without in',
  consecutive_in_punches: 'Consecutive in-punches', repeat_punches_ignored: 'Repeat punches ignored', short_hours: 'Short hours',
  insufficient_hours: 'Insufficient hours', worked_on_weekly_off: 'Worked on weekly off', worked_on_holiday: 'Worked on holiday', worked_on_leave: 'Worked while on leave',
};
