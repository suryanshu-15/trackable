'use client';

/**
 * Laboratory, simple flow: take a sample from a bag → test it → record Pass or Fail.
 * Pass releases the bag so the warehouse can issue it to the factory; Fail blocks it in quarantine.
 */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, post, type Paginated } from '@/lib/api';
import { useApi, useMe, usePagedList, useRefresh } from '@/lib/hooks';
import { useToast } from '@/components/Toast';
import { can } from '@/lib/roles';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { PackageListItem, SampleListItem } from '@/lib/types';
import { Button, Card, ErrorState, Loading, PageHeader, Pagination, Stat, StatGrid, Table, Td } from '@/components/ui';
import { TextArea, TextField } from '@/components/forms';
import { Badge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';

type LabDash = { packages_awaiting_sampling: number; in_progress: number; decisions_30d: Record<string, number> };
type Verdict = 'PASS' | 'FAIL';

export function LabDashboard() {
  const me = useMe();
  const params = useSearchParams();
  const toast = useToast();
  const refresh = useRefresh();
  const dash = useApi<LabDash>('laboratory/samples/dashboard');
  const pending = useApi<Paginated<PackageListItem>>('laboratory/samples/pending-packages', { page_size: 200 });
  const testing = useApi<Paginated<SampleListItem>>('laboratory/samples', { status: 'TESTING', page_size: 200, ordering: 'created_at' });
  const done = usePagedList<SampleListItem>('laboratory/samples', { status: 'COMPLETED' }, 15);
  const [selected, setSelected] = useState<string[]>([]);
  const [taking, setTaking] = useState(false);
  const [result, setResult] = useState<{ sample: SampleListItem; verdict: Verdict } | null>(null);

  // Arriving from a bag page with ?sample=<bag id> preselects it.
  useEffect(() => { const id = params.get('sample'); if (id) setSelected([id]); }, [params]);

  const role = me.data?.role;
  const isLab = !!role && can.requestSample(role);
  const d = dash.data;
  const bags = pending.data?.results ?? [];
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <PageHeader title="Laboratory" subtitle="Take a sample from each bag, test it, and record Pass or Fail. Passed bags can be issued to the factory." />

      {dash.error ? <ErrorState error={dash.error} /> : !d ? <Loading /> : (
        <StatGrid>
          <Stat label="Bags waiting for a sample" value={d.packages_awaiting_sampling} tone={d.packages_awaiting_sampling ? 'warn' : 'neutral'} />
          <Stat label="In lab test" value={d.in_progress} />
          <Stat label="Passed (30 days)" value={d.decisions_30d.RELEASED ?? 0} tone="good" />
          <Stat label="Failed (30 days)" value={d.decisions_30d.REJECTED ?? 0} tone={(d.decisions_30d.REJECTED ?? 0) ? 'bad' : 'neutral'} />
        </StatGrid>
      )}

      <Card title={`1. Bags waiting for a sample (${bags.length})`} className="mt-6"
        actions={isLab && <Button disabled={!selected.length} onClick={() => setTaking(true)}>Take sample ({selected.length})</Button>}>
        {!pending.data ? <Loading /> : bags.length === 0 ? <p className="text-sm text-slate-500">No bags are waiting for the lab.</p> : (
          <>
            <p className="mb-2 text-xs text-slate-500">Tick the bags you take a sample from. Each bag gets its own result.</p>
            <Table head={['', 'Bag', 'Material', 'Lot', 'Quantity', 'Location', 'Arrived']}>
              {bags.map((p) => (
                <tr key={p.id} className={selected.includes(p.id) ? 'bg-brand-50' : ''}>
                  <Td><input type="checkbox" className="h-5 w-5" aria-label={`Select ${p.package_id}`} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} disabled={!isLab} /></Td>
                  <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.id}`}>{p.package_id}</Link></Td>
                  <Td>{p.material_name ?? p.material_code}</Td>
                  <Td className="font-mono">{p.batch_number || '—'}</Td>
                  <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
                  <Td>{p.location_code ?? '—'}</Td>
                  <Td>{fmtDateTime(p.received_at)}</Td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>

      <Card title={`2. In lab test — record the result (${testing.data?.count ?? '…'})`} className="mt-6">
        {testing.error ? <ErrorState error={testing.error} /> : !testing.data ? <Loading /> : testing.data.results.length === 0 ? (
          <p className="text-sm text-slate-500">No samples are being tested.</p>
        ) : (
          <Table head={['Sample', 'Bag', 'Material', 'Lot', 'Sample taken', 'Result']}>
            {testing.data.results.map((s) => (
              <tr key={s.id}>
                <Td><Link className="font-mono text-brand-700 hover:underline" href={`/lab/samples/${s.id}`}>{s.sample_id}</Link></Td>
                <Td className="font-mono">{s.bags.map((b) => b.package_id).join(', ')}</Td>
                <Td>{s.material_name}</Td>
                <Td className="font-mono">{s.batch_number || '—'}</Td>
                <Td>{fmtDateTime(s.sampled_at)}</Td>
                <Td>
                  {isLab ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => setResult({ sample: s, verdict: 'PASS' })}>Pass</Button>
                      <Button size="sm" variant="danger" onClick={() => setResult({ sample: s, verdict: 'FAIL' })}>Fail</Button>
                    </div>
                  ) : <span className="text-xs text-slate-500">Waiting for the lab</span>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="3. Results" className="mt-6">
        <TextField label="Search" placeholder="Bag, sample, material or lot" value={done.filters.search ?? ''} onChange={(e) => done.setFilter('search', e.target.value)} className="mb-3 max-w-md" />
        {done.error ? <ErrorState error={done.error} /> : !done.data ? <Loading /> : (
          <>
            <Table head={['Bag', 'Material', 'Lot', 'Result', 'Remarks', 'When', 'Sample']} empty={!done.rows.length} emptyText="No results yet.">
              {done.rows.map((s) => (
                <tr key={s.id}>
                  <Td className="font-mono">{s.bags.map((b) => <Link key={b.id} className="text-brand-700 hover:underline" href={`/packages/${b.id}`}>{b.package_id}</Link>)}</Td>
                  <Td>{s.material_name}</Td>
                  <Td className="font-mono">{s.batch_number || '—'}</Td>
                  <Td>{s.result?.verdict === 'PASS' ? <Badge tone="green">Pass</Badge> : s.result?.verdict === 'FAIL' ? <Badge tone="red">Fail</Badge> : <Badge>{s.result?.verdict ?? '—'}</Badge>}</Td>
                  <Td className="whitespace-normal text-sm">{s.result?.remarks}</Td>
                  <Td>{fmtDateTime(s.result?.decided_at)}</Td>
                  <Td><Link className="font-mono text-xs text-slate-500 hover:underline" href={`/lab/samples/${s.id}`}>{s.sample_id}</Link></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={done.page} totalPages={done.data.total_pages} count={done.data.count} onPage={done.setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={taking}
        onClose={() => setTaking(false)}
        title={`Take sample from ${selected.length} bag(s)`}
        description="The bags then show “In lab test” until you record the result."
        confirmLabel="Sample taken"
        onConfirm={async () => {
          await post('laboratory/samples/take', { packages: selected });
          toast(`${selected.length} sample(s) taken — record the result when testing is done.`);
          setSelected([]);
          refresh();
        }}
      />
      {result && <ResultDialog sample={result.sample} verdict={result.verdict} onClose={() => setResult(null)}
        onDone={(msg) => { toast(msg, result.verdict === 'PASS' ? 'good' : 'info'); refresh(); }} />}
    </>
  );
}

/** Pass or Fail with optional remarks. An expired bag can only pass with a new expiry date. */
function ResultDialog({ sample, verdict, onClose, onDone }: { sample: SampleListItem; verdict: Verdict; onClose: () => void; onDone: (msg: string) => void }) {
  const [remarks, setRemarks] = useState('');
  const [needDates, setNeedDates] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [retest, setRetest] = useState('');
  const pass = verdict === 'PASS';
  const bag = sample.bags.map((b) => b.package_id).join(', ');
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={pass ? `Pass — ${bag}` : `Fail — ${bag}`}
      variant={pass ? 'success' : 'danger'}
      description={pass ? 'The bag is released: the warehouse can issue it to the factory.' : 'The bag is blocked and stays in quarantine. It cannot be issued.'}
      confirmLabel={pass ? 'Record pass' : 'Record fail'}
      onConfirm={async () => {
        try {
          await post(`laboratory/samples/${sample.id}/result`, {
            result: verdict, remarks, new_expiry_date: expiry || null, new_retest_date: retest || null,
          });
        } catch (err) {
          if (err instanceof ApiError && ['new_expiry_required', 'new_retest_required'].includes(err.code)) setNeedDates(true);
          throw err;
        }
        onDone(pass ? `${bag} passed — available for the factory once it is on a shelf.` : `${bag} failed — blocked in quarantine.`);
      }}
    >
      <TextArea label="Remarks" rows={2} placeholder={pass ? 'e.g. All parameters within specification' : 'e.g. Moisture too high'} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      {needDates && (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="New expiry date" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <TextField label="Next retest date" type="date" value={retest} onChange={(e) => setRetest(e.target.value)} />
        </div>
      )}
    </ConfirmDialog>
  );
}
