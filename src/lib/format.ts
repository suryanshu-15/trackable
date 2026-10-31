/** Display formatting. Timestamps are shown in the configured business timezone (spec §13). */

export const BUSINESS_TZ = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || 'Asia/Kolkata';

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, day: '2-digit', month: 'short', year: 'numeric' });

export function fmtDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : dateTimeFmt.format(d);
}

/** Dates without a time (YYYY-MM-DD) are calendar dates: never shift them by timezone. */
export function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return dateFmt.format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
}

/** Quantities arrive as decimal strings ("250.0000"); trim trailing zeros, keep up to 4 places. */
export function fmtQty(value?: string | number | null, unit?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  const text = Number.isFinite(n)
    ? n.toLocaleString('en-IN', { maximumFractionDigits: 4 })
    : String(value);
  return unit ? `${text} ${unit}` : text;
}

export function humanize(code?: string | null): string {
  if (!code) return '—';
  return code.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Value for <input type="datetime-local"> in the business timezone. */
export function nowLocalInput(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

export function todayInput(): string {
  return nowLocalInput().slice(0, 10);
}
