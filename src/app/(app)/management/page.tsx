'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import { fmtDate, fmtQty, humanize } from '@/lib/format';
import { Alert, Card, ErrorState, Loading, PageHeader, Stat, StatGrid } from '@/components/ui';
import { SelectField } from '@/components/forms';
import { BarList } from '@/components/BarList';

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

const hours = (h: number | null) => (h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);

/** Management dashboard (spec §4F). All figures come from persisted records. */
export default function ManagementPage() {
  const [days, setDays] = useState('30');
  const q = useApi<Mgmt>('reports/management-dashboard', { days });
  const d = q.data;

  return (
    <>
      <PageHeader title="Management dashboard" subtitle="Inward, quality, flow, stock and exceptions."
        actions={<SelectField label="Period" value={days} onChange={(e) => setDays(e.target.value || '30')} placeholder="30 days"
          options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} />} />
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d ? <Loading /> : (
        <div className="space-y-6">
          {(d.reconciliation.ledger_mismatches > 0) && (
            <Alert tone="bad" title={`${d.reconciliation.ledger_mismatches} ledger mismatch(es)`}>Package balances do not match the movement ledger. <Link className="underline" href="/stock-control?tab=reconciliation">Investigate</Link>.</Alert>
          )}
          <StatGrid>
            <Stat label="Receipts" value={d.inward.receipts} href="/gate" />
            <Stat label="QC pass rate" value={d.quality.test_pass_rate_percent === null ? '—' : `${d.quality.test_pass_rate_percent}%`} hint={`${d.quality.samples_open} samples open`} />
            <Stat label="Gate → put-away" value={hours(d.flow.avg_gate_to_putaway_hours)} hint={`Unloading ${hours(d.flow.avg_unloading_hours)}`} />
            <Stat label="Lab turnaround" value={hours(d.quality.avg_lab_turnaround_hours)} hint={`Testing ${hours(d.quality.avg_testing_hours)}`} />
            <Stat label="Issues" value={d.issues.issues} href="/issues" />
            <Stat label="Near expiry / retest" value={d.stock.near_expiry_or_retest} tone={d.stock.near_expiry_or_retest ? 'warn' : 'neutral'} href="/stock" />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Inward receipts by day"><BarList rows={d.inward.by_day.map((r) => ({ label: fmtDate(r.date), value: r.receipts }))} /></Card>
            <Card title="Receipts by supplier (top 10)"><BarList rows={d.inward.by_supplier.map((r) => ({ label: r.supplier__name, value: r.receipts, hint: r.supplier__code }))} /></Card>
            <Card title="Material received (top 10 by lines)">
              <BarList rows={d.inward.by_material.map((r) => ({ label: `${r.material__code} (${r.declared_unit__symbol})`, value: Number(r.quantity), hint: `${r.lines} line(s)` }))} format={(v) => fmtQty(v)} />
              <p className="mt-2 text-xs text-slate-500">Each bar is in its own unit; units are never added together.</p>
            </Card>
            <Card title="Material issued (top 10)">
              <BarList rows={d.issues.by_material.map((r) => ({ label: `${r.material__code} (${r.unit__symbol})`, value: Number(r.quantity) }))} format={(v) => fmtQty(v)} />
            </Card>
            <Card title="Issues by day"><BarList rows={d.issues.by_day.map((r) => ({ label: fmtDate(r.date), value: r.issues }))} /></Card>
            <Card title="Quality decisions">
              <BarList rows={Object.entries(d.quality.decisions).map(([k, v]) => ({ label: humanize(k), value: v }))} empty="No decisions in this period." />
              <p className="mt-3 text-xs text-slate-500">Test results: {Object.entries(d.quality.test_results).map(([k, v]) => `${humanize(k)} ${v}`).join(' · ') || 'none'}</p>
            </Card>
            <Card title="Stock ageing (packages in warehouse)">
              <BarList rows={Object.entries(d.stock.ageing_package_counts).map(([k, v]) => ({ label: `${k} days`, value: v }))} />
              <p className="mt-2 text-xs text-slate-500">{d.stock.packages_in_warehouse} packages · {d.stock.available_packages} available · {d.stock.low_stock_materials} material(s) below minimum</p>
            </Card>
            <Card title="Exceptions & reconciliation">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[...Object.entries(d.exceptions), ['open_receipt_discrepancies', d.reconciliation.open_receipt_discrepancies] as [string, number]].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-slate-100 py-1">
                    <dt className="text-slate-600">{humanize(k)}</dt>
                    <dd className={v > 0 && /recall|hold|pending|discrep|override/.test(k) ? 'font-semibold text-amber-700' : 'text-slate-900'}>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs"><Link className="text-brand-700 underline" href="/audit">Audit trail</Link> · <Link className="text-brand-700 underline" href="/reports">Reports & exports</Link></p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
