'use client';

import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import { fmtDate, fmtDateTime, humanize } from '@/lib/format';
import { Card, ErrorState, Loading, PageHeader, Stat, StatGrid, Table, Td } from '@/components/ui';
import { SelectField } from '@/components/forms';
import { BarList } from '@/components/BarList';

type Series = { total: number; per_day_avg: number; peak_day: { date: string; count: number } | null; by_day: { date: string; count: number }[] };
type Usage = {
  period_days: number;
  note: string;
  users: {
    active_accounts: number; by_role: Record<string, number>; active_in_period: number;
    active_in_period_by_role: Record<string, number>; signed_in_in_period: number; actions_per_role: Record<string, number>;
  };
  concurrency: {
    peak_people_in_one_hour: number; peak_hour: string | null; avg_people_per_active_hour: number;
    active_hours: number; actions_by_hour_of_day: Record<string, number>;
  };
  volumes: Record<'receipts' | 'bags_created' | 'samples' | 'issues' | 'stock_movements' | 'scans' | 'label_prints', Series>;
  footprint: { warehouses: number; storage_locations: number; bags_in_stock: number; records: Record<string, number> };
};

const VOLUME_LABELS: Record<keyof Usage['volumes'], string> = {
  receipts: 'Truck receipts', bags_created: 'Bags created', samples: 'Lab samples', issues: 'Issues to factory',
  stock_movements: 'Stock movements', scans: 'Scans', label_prints: 'Label prints',
};

/** Usage & volume analysis (DECISIONS Q10): what the system actually handles. No targets are set. */
export default function UsagePage() {
  const [days, setDays] = useState('30');
  const q = useApi<Usage>('reports/usage-analysis', { days });
  const d = q.data;

  return (
    <>
      <PageHeader title="Usage analysis" subtitle="Measured users, workload and concurrency — observations only, no targets."
        actions={<SelectField label="Period" value={days} onChange={(e) => setDays(e.target.value || '30')} placeholder="30 days"
          options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} />} />
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d ? <Loading /> : (
        <div className="space-y-6">
          <StatGrid>
            <Stat label="Active accounts" value={d.users.active_accounts} hint={`${d.users.signed_in_in_period} signed in during the period`} />
            <Stat label="People who did work" value={d.users.active_in_period} hint="Recorded at least one action" />
            <Stat label="Peak people in one hour" value={d.concurrency.peak_people_in_one_hour} hint={d.concurrency.peak_hour ? fmtDateTime(d.concurrency.peak_hour) : '—'} />
            <Stat label="Avg people per working hour" value={d.concurrency.avg_people_per_active_hour} hint={`${d.concurrency.active_hours} hour${d.concurrency.active_hours === 1 ? "" : "s"} with activity`} />
            <Stat label="Warehouses / locations" value={`${d.footprint.warehouses} / ${d.footprint.storage_locations}`} />
            <Stat label="Bags in stock" value={d.footprint.bags_in_stock} />
          </StatGrid>

          <Card title="Workload over the period">
            <Table head={['Activity', 'Total', 'Average per day', 'Busiest day']}>
              {(Object.keys(VOLUME_LABELS) as (keyof Usage['volumes'])[]).map((k) => {
                const s = d.volumes[k];
                return (
                  <tr key={k}>
                    <Td>{VOLUME_LABELS[k]}</Td>
                    <Td className="tabular-nums">{s.total}</Td>
                    <Td className="tabular-nums">{s.per_day_avg}</Td>
                    <Td>{s.peak_day ? `${s.peak_day.count} on ${fmtDate(s.peak_day.date)}` : '—'}</Td>
                  </tr>
                );
              })}
            </Table>
            <p className="mt-2 text-xs text-slate-500">Averages include days with no activity ({d.period_days}-day period). Bags created excludes bags made by repacking.</p>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Bags created per day">
              <BarList rows={d.volumes.bags_created.by_day.map((r) => ({ label: fmtDate(r.date), value: r.count }))} empty="No bags created in this period." />
            </Card>
            <Card title="Activity by hour of day">
              <BarList rows={Object.entries(d.concurrency.actions_by_hour_of_day).filter(([, v]) => v > 0)
                .map(([h, v]) => ({ label: `${h.padStart(2, '0')}:00–${String(Number(h) + 1).padStart(2, '0')}:00`, value: v }))} empty="No recorded activity." />
              <p className="mt-2 text-xs text-slate-500">Recorded actions (changes, scans, prints, downloads) per clock hour, business time zone.</p>
            </Card>
            <Card title="People by role">
              <Table head={['Role', 'Accounts', 'Did work in period', 'Actions']}>
                {Object.keys({ ...d.users.by_role, ...d.users.active_in_period_by_role }).sort().map((r) => (
                  <tr key={r}>
                    <Td>{humanize(r)}</Td>
                    <Td className="tabular-nums">{d.users.by_role[r] ?? 0}</Td>
                    <Td className="tabular-nums">{d.users.active_in_period_by_role[r] ?? 0}</Td>
                    <Td className="tabular-nums">{d.users.actions_per_role[r] ?? 0}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Data held">
              <Table head={['Records', 'Count']}>
                {Object.entries(d.footprint.records).map(([k, v]) => (
                  <tr key={k}><Td>{humanize(k)}</Td><Td className="tabular-nums">{v.toLocaleString('en-IN')}</Td></tr>
                ))}
              </Table>
              <p className="mt-2 text-xs text-slate-500">Growth of these figures over time shows when database or retention settings need attention.</p>
            </Card>
          </div>
          <p className="text-xs text-slate-500">{d.note}</p>
        </div>
      )}
    </>
  );
}
