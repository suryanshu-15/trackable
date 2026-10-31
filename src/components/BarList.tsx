/**
 * Single-series horizontal bar list: one hue for magnitude, labels and values in text ink,
 * native hover tooltip, and the numbers always printed so nothing relies on colour alone.
 */
export function BarList({ rows, format = (v) => String(v), empty = 'No data in this period.' }: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (v: number) => string;
  empty?: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1.5" role="list">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ''}`}>
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="h-3 rounded-r bg-slate-100/80">
            <span className="block h-3 rounded-r transition-all" style={{ width: `${(r.value / max) * 100}%`, background: '#2a78d6' }} />
          </span>
          <span className="tabular-nums text-slate-900">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
