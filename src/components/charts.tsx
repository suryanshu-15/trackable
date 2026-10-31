'use client';

/**
 * Hand-written SVG charts (no chart library): thin columns with 4px rounded caps from one
 * baseline, hairline grid, per-mark hover tooltips, and a donut whose legend doubles as the
 * table view. Colours come from the validated categorical palette (light mode).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const GRID = '#e2e8f0';
const MUTED = '#64748b';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const compact = (v: number) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}K` : `${+v.toFixed(2)}`);

export type Point = { label: string; value: number; detail?: string };

/** Single-series column chart (counts over time or ordered buckets). */
export function ColumnChart({ data, height = 200, color = SERIES[0], format = compact, empty = 'No data in this period.' }: {
  data: Point[]; height?: number; color?: string; format?: (v: number) => string; empty?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length || data.every((d) => d.value === 0)) {
    return <div className="flex items-center justify-center text-sm text-slate-500" style={{ height }}>{empty}</div>;
  }
  const left = 36, right = 8, top = 12, bottom = 26;
  const plotW = Math.max(0, width - left - right);
  const plotH = height - top - bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const band = plotW / data.length;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64))));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Column chart">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED}>{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = left + band * i + band / 2;
            const h = Math.max(0, y(0) - y(d.value));
            const x = cx - barW / 2;
            const r = Math.min(4, barW / 2, h);
            const top0 = y(0) - h;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={left + band * i} y={top} width={band} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${y(0)} V${top0 + r} Q${x},${top0} ${x + r},${top0} H${x + barW - r} Q${x + barW},${top0} ${x + barW},${top0 + r} V${y(0)} Z`}
                    fill={color} opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={MUTED}>{d.label}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: Math.min(Math.max(left + band * hover + band / 2, 60), width - 60), top: y(data[hover].value) - 6 }}>
          <div className="font-semibold">{format(data[hover].value)}</div>
          <div className="text-slate-300">{data[hover].detail ?? data[hover].label}</div>
        </div>
      )}
    </div>
  );
}

export type Slice = { key: string; label: string; value: number; color: string };

/** Part-to-whole donut. The legend lists every slice with count and share (the table view). */
export function DonutChart({ slices, centerLabel, size = 176 }: { slices: Slice[]; centerLabel: string; size?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return <p className="text-sm text-slate-500">Nothing to show.</p>;
  const r = size / 2, inner = r * 0.62;
  let angle = -Math.PI / 2;
  const arcs = slices.filter((s) => s.value > 0).map((s) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`;
    const d = sweep >= Math.PI * 2 - 1e-6
      ? `M${p(r, 0)} A${r},${r} 0 1 1 ${p(r, Math.PI)} A${r},${r} 0 1 1 ${p(r, 0)} M${p(inner, 0)} A${inner},${inner} 0 1 0 ${p(inner, Math.PI)} A${inner},${inner} 0 1 0 ${p(inner, 0)} Z`
      : `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
    return { ...s, d };
  });
  const focus = hover ? slices.find((s) => s.key === hover) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel} className="flex-none">
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill={a.color} stroke="#fff" strokeWidth={2} fillRule="evenodd"
            opacity={hover === null || hover === a.key ? 1 : 0.4}
            onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x={r} y={r - 4} textAnchor="middle" fontSize={26} fontWeight={700} fill="#0f172a">{focus ? focus.value : total}</text>
        <text x={r} y={r + 16} textAnchor="middle" fontSize={11} fill={MUTED}>{focus ? focus.label : centerLabel}</text>
      </svg>
      <table className="w-full text-sm">
        <tbody>
          {slices.map((s) => (
            <tr key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} className={hover === s.key ? 'bg-slate-50' : ''}>
              <td className="py-1 pr-2"><span className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: s.color }} /></td>
              <td className="py-1 pr-3 text-slate-700">{s.label}</td>
              <td className="py-1 pr-3 text-right font-semibold tabular-nums text-slate-900">{s.value}</td>
              <td className="py-1 text-right tabular-nums text-slate-500">{Math.round((s.value / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Compact progress meter, e.g. a pass rate. */
export function Meter({ value, color = SERIES[0] }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}
