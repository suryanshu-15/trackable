'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApi, useMe } from '@/lib/hooks';
import { BUSINESS_TZ, fmtQty, humanize } from '@/lib/format';
import type { ReportMeta } from '@/lib/types';
import { Alert, Card, ErrorState, Loading, PageHeader, Stat, cx } from '@/components/ui';
import { SelectField } from '@/components/forms';
import { BarList } from '@/components/BarList';
import { ColumnChart, DonutChart, Meter, SERIES, type Point } from '@/components/charts';
import { Icons, type IconName } from '@/components/icons';

type Mgmt = {
  period_days: number;
  inward: { receipts: number; by_day: { date: string; receipts: number }[]; by_supplier: { supplier__code: string; supplier__name: string; receipts: number }[]; by_material: { material__code: string; declared_unit__symbol: string; quantity: string; lines: number }[] };
  quality: { decisions: Record<string, number>; test_results: Record<string, number>; test_pass_rate_percent: number | null; avg_lab_turnaround_hours: number | null; avg_testing_hours: number | null; samples_open: number };
  flow: { avg_gate_to_putaway_hours: number | null; avg_unloading_hours: number | null };
  stock: { packages_in_warehouse: number; by_qc_status: Record<string, number>; available_packages: number; ageing_package_counts: Record<string, number>; near_expiry_or_retest: number; low_stock_materials: number };
  issues: { issues: number; by_day: { date: string; issues: number }[]; by_material: { material__code: string; unit__symbol: string; quantity: string }[] };
  reconciliation: { ledger_mismatches: number; open_receipt_discrepancies: number };
  exceptions: Record<string, number>;
};

// Colour follows the QC state, never its rank: each state keeps its palette slot.
const QC_ORDER = ['PASSED', 'TESTING', 'PENDING_SAMPLING', 'SAMPLED', 'RETEST_REQUIRED', 'NOT_REQUIRED', 'ON_HOLD', 'FAILED'];
const KEY_REPORTS = ['inward-register', 'current-stock', 'lab-register', 'qc-decisions', 'issue-register', 'stock-ageing'];
const REPORT_ICON: Record<string, IconName> = {
  'inward-register': 'truck', 'current-stock': 'stock', 'lab-register': 'lab', 'qc-decisions': 'check',
  'issue-register': 'send', 'stock-ageing': 'clock',
};
const EXCEPTIONS: { key: string; label: string; icon: IconName; href: string }[] = [
  { key: 'fifo_overrides', label: 'FIFO overrides', icon: 'alert', href: '/issues' },
  { key: 'adjustments_pending', label: 'Adjustments pending', icon: 'sliders', href: '/stock-control?tab=adjustments' },
  { key: 'open_receipt_discrepancies', label: 'Open receipt discrepancies', icon: 'truck', href: '/gate' },
  { key: 'active_holds', label: 'Active holds', icon: 'shield', href: '/holds' },
  { key: 'active_recalls', label: 'Active recalls', icon: 'shield', href: '/holds' },
  { key: 'disposals', label: 'Disposals', icon: 'bag', href: '/stock-control?tab=disposals' },
  { key: 'weight_corrections', label: 'Weight corrections', icon: 'audit', href: '/audit' },
  { key: 'adjustments_approved', label: 'Adjustments approved', icon: 'check', href: '/stock-control?tab=adjustments' },
];

const hours = (h: number | null) => (h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);
const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: BUSINESS_TZ });
const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });

/** Daily counts → continuous series (missing days are 0); periods longer than a month group by week. */
function series(rows: { date: string; count: number }[], days: number): Point[] {
  const byDate = new Map(rows.map((r) => [r.date, r.count]));
  const end = new Date();
  const out: Point[] = [];
  const step = days > 31 ? 7 : 1;
  for (let i = days - 1; i >= 0; i -= step) {
    let value = 0;
    const first = new Date(end.getTime() - i * 86_400_000);
    for (let k = 0; k < step && i - k >= 0; k++) {
      const d = new Date(end.getTime() - (i - k) * 86_400_000);
      value += byDate.get(isoDay(d)) ?? 0;
    }
    out.push({ label: dayLabel(first), value, detail: step === 1 ? dayLabel(first) : `Week from ${dayLabel(first)}` });
  }
  return out;
}

/** Admin / management dashboard (spec §4F): graphical, every figure from persisted records. */
export default function ManagementPage() {
  const me = useMe();
  const [days, setDays] = useState('30');
  const q = useApi<Mgmt>('reports/management-dashboard', { days });
  const reports = useApi<ReportMeta[]>('reports');
  const d = q.data;
  const n = Number(days);
  const keyReports = (reports.data ?? []).filter((r) => KEY_REPORTS.includes(r.key))
    .sort((a, b) => KEY_REPORTS.indexOf(a.key) - KEY_REPORTS.indexOf(b.key));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back${me.data ? `, ${me.data.display_name.replace(/\[.*?\]\s*/, '')}` : ''} — warehouse at a glance.`}
        actions={<SelectField label="Period" value={days} onChange={(e) => setDays(e.target.value || '30')} placeholder="30 days"
          options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} />}
      />

      {/* Reports first: the most used reports, one click away. */}
      <section aria-labelledby="reports-heading" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="reports-heading" className="text-[15px] font-semibold text-slate-800">Reports</h2>
          <Link href="/reports" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">All reports <Icons.arrowRight size={16} /></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {keyReports.map((r) => {
            const Icon = Icons[REPORT_ICON[r.key] ?? 'report'];
            return (
              <Link key={r.key} href={`/reports/${r.key}`}
                className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white"><Icon size={20} /></span>
                <span className="text-sm font-semibold leading-snug text-slate-800">{r.title}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d ? <Loading /> : (
        <div className="space-y-6">
          {d.reconciliation.ledger_mismatches > 0 && (
            <Alert tone="bad" title={`${d.reconciliation.ledger_mismatches} ledger mismatch(es)`}>
              Bag balances do not match the movement ledger. <Link className="underline" href="/stock-control?tab=reconciliation">Investigate</Link>.
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Receipts" value={d.inward.receipts} href="/gate" icon={<Icons.truck />} hint={`last ${n} days`} />
            <Stat label="Bags in stock" value={d.stock.packages_in_warehouse} href="/packages" icon={<Icons.bag />} hint={`${d.stock.available_packages} available`} />
            <Stat label="QC pass rate" value={d.quality.test_pass_rate_percent === null ? '—' : `${d.quality.test_pass_rate_percent}%`} icon={<Icons.lab />} hint={`${d.quality.samples_open} samples open`} />
            <Stat label="Issues" value={d.issues.issues} href="/issues" icon={<Icons.send />} hint={`last ${n} days`} />
            <Stat label="Gate → put-away" value={hours(d.flow.avg_gate_to_putaway_hours)} icon={<Icons.clock />} hint={`lab ${hours(d.quality.avg_lab_turnaround_hours)}`} />
            <Stat label="Expiry / retest due" value={d.stock.near_expiry_or_retest} href="/stock" icon={<Icons.alert />}
              tone={d.stock.near_expiry_or_retest ? 'warn' : 'neutral'} hint={`${d.stock.low_stock_materials} low-stock material(s)`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Inward receipts" className="xl:col-span-2"
              actions={<span className="text-xs text-slate-500">{n > 31 ? 'per week' : 'per day'} · total {d.inward.receipts}</span>}>
              <ColumnChart data={series(d.inward.by_day.map((r) => ({ date: r.date, count: r.receipts })), n)} height={220} />
            </Card>
            <Card title="Stock by QC status">
              <DonutChart centerLabel="bags in stock"
                slices={QC_ORDER.map((k, i) => ({ key: k, label: humanize(k), value: d.stock.by_qc_status[k] ?? 0, color: SERIES[i] }))
                  .filter((s) => s.value > 0)} />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Issues to factory" actions={<span className="text-xs text-slate-500">{n > 31 ? 'per week' : 'per day'} · total {d.issues.issues}</span>}>
              <ColumnChart data={series(d.issues.by_day.map((r) => ({ date: r.date, count: r.issues })), n)} height={200} />
            </Card>
            <Card title="Stock ageing" actions={<span className="text-xs text-slate-500">bags by days since receipt</span>}>
              <ColumnChart data={Object.entries(d.stock.ageing_package_counts).map(([k, v]) => ({ label: `${k} d`, value: v, detail: `${k} days old` }))} height={200} />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Top suppliers">
              <BarList rows={d.inward.by_supplier.map((r) => ({ label: r.supplier__name.replace(/\[DEMO\]\s*/, ''), value: r.receipts, hint: r.supplier__code }))} empty="No receipts in this period." />
            </Card>
            <Card title="Material received vs issued">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Received</p>
              <BarList rows={d.inward.by_material.map((r) => ({ label: `${r.material__code ?? 'Unmapped material'} (${r.declared_unit__symbol})`, value: Number(r.quantity) }))} format={(v) => fmtQty(v)} />
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Issued</p>
              <BarList rows={d.issues.by_material.map((r) => ({ label: `${r.material__code ?? 'Unmapped material'} (${r.unit__symbol})`, value: Number(r.quantity) }))} format={(v) => fmtQty(v)} empty="Nothing issued in this period." />
            </Card>
            <Card title="Quality">
              <div className="mb-1 flex items-end justify-between">
                <span className="text-sm text-slate-600">Test pass rate</span>
                <span className="text-2xl font-bold text-slate-900">{d.quality.test_pass_rate_percent ?? '—'}{d.quality.test_pass_rate_percent !== null && '%'}</span>
              </div>
              <Meter value={d.quality.test_pass_rate_percent ?? 0} />
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Decisions</p>
              <BarList rows={Object.entries(d.quality.decisions).map(([k, v]) => ({ label: humanize(k), value: v }))} empty="No decisions in this period." />
            </Card>
          </div>

          <Card title="Exceptions to review">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {EXCEPTIONS.map((e) => {
                const v = e.key === 'open_receipt_discrepancies' ? d.reconciliation.open_receipt_discrepancies : d.exceptions[e.key] ?? 0;
                const Icon = Icons[e.icon];
                const flagged = v > 0 && !['adjustments_approved', 'disposals', 'weight_corrections'].includes(e.key);
                return (
                  <Link key={e.key} href={e.href} className={cx('flex items-center gap-3 rounded-lg border p-3 transition hover:shadow-md',
                    flagged ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/50')}>
                    <span className={cx('flex h-9 w-9 flex-none items-center justify-center rounded-lg', flagged ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500')}><Icon size={18} /></span>
                    <span>
                      <span className="block text-xl font-bold leading-none text-slate-900">{v}</span>
                      <span className="text-xs text-slate-600">{e.label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-4 text-xs"><Link className="font-semibold text-brand-600 hover:underline" href="/audit">Open the audit trail →</Link></p>
          </Card>
        </div>
      )}
    </>
  );
}
