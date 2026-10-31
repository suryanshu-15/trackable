'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Paginated } from '@/lib/api';
import { useApi, useMe, usePagedList, useRefresh } from '@/lib/hooks';
import { useToast } from '@/components/Toast';
import { can } from '@/lib/roles';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { PackageListItem, SampleListItem } from '@/lib/types';
import { Button, Card, ErrorState, Loading, PageHeader, Pagination, Stat, StatGrid, Table, Td, Tabs, Alert } from '@/components/ui';
import { TextField } from '@/components/forms';
import { StatusBadge, Badge } from '@/components/StatusBadge';
import { SampleRequestDialog } from '@/components/lab/SampleRequestDialog';

type LabDash = {
  by_status: Record<string, number>; packages_awaiting_sampling: number; awaiting_collection: number; awaiting_tests: number;
  in_progress: number; awaiting_review: number; retest_queue: number; overdue: number;
  decisions_30d: Record<string, number>; active_holds: number; active_recalls: number;
};

const QUEUES: Record<string, { label: string; query: Record<string, string | string[]> }> = {
  active: { label: 'All open', query: { active: 'true' } },
  collection: { label: 'Awaiting collection', query: { status: 'REQUESTED' } },
  tests: { label: 'Awaiting tests', query: { status: ['COLLECTED', 'RECEIVED_BY_LAB'] } },
  progress: { label: 'In progress', query: { status: 'TESTING' } },
  review: { label: 'Awaiting review', query: { status: 'RESULTS_SUBMITTED' } },
  retest: { label: 'Retest queue', query: { status: 'RETEST_REQUIRED' } },
  overdue: { label: 'Overdue', query: { overdue: 'true' } },
  done: { label: 'Completed', query: { status: 'COMPLETED' } },
};
type QueueKey = keyof typeof QUEUES;

/** Laboratory dashboard (spec §4D). */
export function LabDashboard() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const refresh = useRefresh();
  const dash = useApi<LabDash>('laboratory/samples/dashboard');
  const pending = useApi<Paginated<PackageListItem>>('laboratory/samples/pending-packages', { page_size: 200 });
  const [queue, setQueue] = useState<QueueKey>('active');
  const samples = usePagedList<SampleListItem>('laboratory/samples', QUEUES.active.query);
  const [selected, setSelected] = useState<string[]>([]);
  const [requesting, setRequesting] = useState(false);

  // Arriving from a package page with ?sample=<package id> preselects it.
  useEffect(() => {
    const id = params.get('sample');
    if (id) { setSelected([id]); setRequesting(true); }
  }, [params]);

  const pickQueue = (q: QueueKey) => {
    setQueue(q);
    samples.replaceFilters({ ...QUEUES[q].query, search: samples.filters.search ?? '' });
  };

  const d = dash.data;
  const role = me.data?.role;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <PageHeader title="Laboratory" subtitle="Sampling, testing, review and quality decisions." />
      {dash.error ? <ErrorState error={dash.error} /> : !d ? <Loading /> : (
        <div className="space-y-3">
          <StatGrid>
            <Stat label="Packages awaiting sampling" value={d.packages_awaiting_sampling} tone={d.packages_awaiting_sampling ? 'warn' : 'neutral'} />
            <Stat label="Awaiting collection" value={d.awaiting_collection} />
            <Stat label="Awaiting tests" value={d.awaiting_tests} />
            <Stat label="Tests in progress" value={d.in_progress} />
            <Stat label="Awaiting review" value={d.awaiting_review} tone={d.awaiting_review ? 'warn' : 'neutral'} />
            <Stat label="Overdue" value={d.overdue} tone={d.overdue ? 'bad' : 'neutral'} hint={`Retest queue: ${d.retest_queue}`} />
          </StatGrid>
          <p className="text-sm text-slate-600">
            Last 30 days: {Object.entries(d.decisions_30d).map(([k, v]) => <span key={k} className="mr-3 inline-flex items-center gap-1"><StatusBadge status={k} /> {v}</span>)}
            {(d.active_holds > 0 || d.active_recalls > 0) && <Link href="/holds" className="ml-2 font-medium text-red-700 underline">{d.active_holds} hold(s), {d.active_recalls} recall(s) active</Link>}
          </p>
        </div>
      )}

      <Card title="Packages awaiting sampling" className="mt-6"
        actions={role && can.requestSample(role) && <Button size="sm" disabled={!selected.length} onClick={() => setRequesting(true)}>Request sample ({selected.length})</Button>}>
        {!pending.data ? <Loading /> : pending.data.results.length === 0 ? <p className="text-sm text-slate-500">No packages are waiting to be sampled.</p> : (
          <>
            <p className="mb-2 text-xs text-slate-500">Select bags to sample. Each bag gets its own sample, and its result applies to that bag only.</p>
            <Table head={['', 'Package', 'Material', 'Lot', 'Quantity', 'Location', 'Receipt', 'Received']}>
              {pending.data.results.map((p) => (
                <tr key={p.id} className={selected.includes(p.id) ? 'bg-brand-50' : ''}>
                  <Td><input type="checkbox" aria-label={`Select ${p.package_id}`} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} disabled={!role || !can.requestSample(role)} /></Td>
                  <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.id}`}>{p.package_id}</Link></Td>
                  <Td>{p.material_code}</Td>
                  <Td className="font-mono">{p.batch_number || '—'}</Td>
                  <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
                  <Td>{p.location_code ?? '—'}</Td>
                  <Td className="font-mono text-xs">{p.receipt_number}</Td>
                  <Td>{fmtDateTime(p.received_at)}</Td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>

      <Card title="Samples" className="mt-6">
        <Tabs tabs={Object.entries(QUEUES).map(([k, q]) => ({ value: k as QueueKey, label: q.label }))} value={queue} onChange={pickQueue} />
        <TextField label="Search" placeholder="Sample ID, material, lot, package" value={samples.filters.search ?? ''} onChange={(e) => samples.setFilter('search', e.target.value)} className="mb-3 max-w-md" />
        {samples.error ? <ErrorState error={samples.error} /> : !samples.data ? <Loading /> : (
          <>
            <Table head={['Sample', 'Material', 'Lot', 'Packages', 'Status', 'Sampled', 'Due']} empty={!samples.rows.length}>
              {samples.rows.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/lab/samples/${s.id}`)}>
                  <Td><Link className="font-mono text-brand-700 hover:underline" href={`/lab/samples/${s.id}`}>{s.sample_id}</Link></Td>
                  <Td>{s.material_code}<div className="text-xs text-slate-500">{s.material_name}</div></Td>
                  <Td className="font-mono">{s.batch_number || '—'}</Td>
                  <Td>{s.package_count}</Td>
                  <Td><StatusBadge status={s.status} label={s.status_display} /></Td>
                  <Td>{fmtDateTime(s.sampled_at)}</Td>
                  <Td>{fmtDateTime(s.required_by)} {s.is_overdue && <Badge tone="red">Overdue</Badge>}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={samples.page} totalPages={samples.data.total_pages} count={samples.data.count} onPage={samples.setPage} />
          </>
        )}
        {queue === 'tests' && <Alert tone="info">Collected samples move to testing once received in the lab.</Alert>}
      </Card>

      <SampleRequestDialog
        open={requesting}
        onClose={() => setRequesting(false)}
        packageIds={selected}
        onCreated={(ids) => {
          setSelected([]);
          if (ids.length === 1) router.push(`/lab/samples/${ids[0]}`);
          else { toast(`${ids.length} samples requested.`); refresh(); }
        }}
      />
    </>
  );
}
