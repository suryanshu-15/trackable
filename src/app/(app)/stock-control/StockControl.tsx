'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, post } from '@/lib/api';
import { useApi, useMe, usePagedList, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDate, fmtDateTime, fmtQty, humanize } from '@/lib/format';
import type { Adjustment, Disposal, MaterialReturn, Package, Role } from '@/lib/types';
import { ActionError, Alert, Button, Card, ErrorState, Loading, PageHeader, Pagination, Table, Td, Tabs } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';
import { useToast } from '@/components/Toast';

type Tab = 'adjustments' | 'disposals' | 'returns' | 'reconciliation';

export function StockControl() {
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get('tab') as Tab) || 'adjustments';
  const role = me.data?.role;
  if (!role) return <Loading />;

  return (
    <>
      <PageHeader title="Returns, disposals & adjustments" subtitle="Every stock correction is a ledger movement with a reason and an approver." />
      <Tabs value={tab} onChange={(t) => router.replace(`/stock-control?tab=${t}`)} tabs={[
        { value: 'adjustments', label: 'Adjustments' }, { value: 'disposals', label: 'Disposals & supplier returns' },
        { value: 'returns', label: 'Returns from production' }, { value: 'reconciliation', label: 'Ledger reconciliation' },
      ]} />
      {tab === 'adjustments' && <Adjustments role={role} userId={me.data!.id} />}
      {tab === 'disposals' && <Disposals role={role} />}
      {tab === 'returns' && <Returns />}
      {tab === 'reconciliation' && <Reconciliation />}
    </>
  );
}

/** Scan or type a package ID and load the live record. */
function PackageLookup({ value, onChange }: { value: Package | null; onChange: (p: Package | null) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const find = async () => {
    setError(null);
    try {
      onChange(await api<Package>('inventory/packages/resolve', { query: { code: code.trim() } }));
    } catch (e) {
      onChange(null);
      setError(e);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <TextField className="flex-1" label="Package (scan or type)" value={code} onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } }} autoComplete="off" />
        <Button variant="secondary" onClick={find}>Find</Button>
      </div>
      <ActionError error={error} />
      {value && (
        <p className="text-sm">
          <span className="font-mono font-medium">{value.package_id}</span> · {value.material_code} · lot {value.batch_number || '—'} · {fmtQty(value.current_quantity, value.unit_symbol)}
          {Number(value.reserved_quantity) > 0 && <> · reserved {fmtQty(value.reserved_quantity, value.unit_symbol)}</>} · <StatusBadge status={value.qc_status} />
        </p>
      )}
    </div>
  );
}

function Adjustments({ role, userId }: { role: Role; userId: number }) {
  const toast = useToast();
  const refresh = useRefresh();
  const list = usePagedList<Adjustment>('inventory/adjustments', { status: 'PENDING' });
  const [creating, setCreating] = useState(false);
  const [decide, setDecide] = useState<{ adj: Adjustment; approve: boolean } | null>(null);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [type, setType] = useState('CORRECTION');
  const [qty, setQty] = useState('');
  const [reference, setReference] = useState('');

  return (
    <Card title="Stock adjustments" actions={can.requestAdjustment(role) && <Button size="sm" onClick={() => { setPkg(null); setQty(''); setCreating(true); }}>Request adjustment</Button>}>
      <SelectField label="Status" className="mb-3 max-w-xs" placeholder="All" value={(list.filters.status as string) ?? ''} onChange={(e) => list.setFilter('status', e.target.value)}
        options={['PENDING', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: humanize(s) }))} />
      {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
        <>
          <Table head={['Package', 'Type', 'Quantity', 'Reason', 'Requested', 'Status', 'Decision', '']} empty={!list.rows.length}>
            {list.rows.map((a) => (
              <tr key={a.id}>
                <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${a.package}`}>{a.package_code}</Link></Td>
                <Td>{humanize(a.adjustment_type)}</Td>
                <Td>{a.adjustment_type === 'CORRECTION' ? `count = ${fmtQty(a.quantity_change, a.unit_symbol)}` : fmtQty(a.quantity_change, a.unit_symbol)}{a.applied_delta && <div className="text-xs text-slate-500">applied {fmtQty(a.applied_delta)}</div>}</Td>
                <Td className="max-w-xs whitespace-normal">{a.reason}{a.reference && <div className="text-xs text-slate-500">{a.reference}</div>}</Td>
                <Td className="text-xs">{a.created_by_name}<div>{fmtDateTime(a.created_at)}</div></Td>
                <Td><StatusBadge status={a.status} /></Td>
                <Td className="text-xs">{a.approved_by_name ? <>{a.approved_by_name}<div>{a.approval_notes}</div></> : '—'}</Td>
                <Td>
                  {a.status === 'PENDING' && can.approveAdjustment(role) && a.created_by !== userId && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="success" onClick={() => setDecide({ adj: a, approve: true })}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => setDecide({ adj: a, approve: false })}>Reject</Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
        </>
      )}
      <ConfirmDialog open={creating} onClose={() => setCreating(false)} title="Request stock adjustment" reason="required" confirmLabel="Submit for approval"
        description="A manager (not you) approves it; only then does the ledger change."
        onConfirm={async (reason) => {
          if (!pkg) throw new Error('Find the package first.');
          if (qty === '' || Number(qty) < 0 || (type !== 'CORRECTION' && !(Number(qty) > 0))) throw new Error('Enter a valid quantity.');
          await post('inventory/adjustments', { package: pkg.id, adjustment_type: type, quantity_change: qty, unit: pkg.unit, reason, reference });
          toast('Adjustment submitted for approval.');
          refresh();
        }}>
        <PackageLookup value={pkg} onChange={setPkg} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value || 'CORRECTION')} placeholder="Correction"
            options={[{ value: 'CORRECTION', label: 'Correction (physical count)' }, { value: 'INCREASE', label: 'Increase' }, { value: 'DECREASE', label: 'Decrease' }]} />
          <TextField label={type === 'CORRECTION' ? `Counted quantity${pkg ? ` (${pkg.unit_symbol})` : ''}` : `Quantity${pkg ? ` (${pkg.unit_symbol})` : ''}`} type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <TextField label="Reference (count sheet, etc.)" value={reference} onChange={(e) => setReference(e.target.value)} />
      </ConfirmDialog>
      <ConfirmDialog open={!!decide} onClose={() => setDecide(null)} title={decide?.approve ? 'Approve adjustment' : 'Reject adjustment'}
        variant={decide?.approve ? 'success' : 'danger'} confirmLabel={decide?.approve ? 'Approve' : 'Reject'} reason={decide?.approve ? 'optional' : 'required'} reasonLabel="Notes"
        description={decide && <>{decide.adj.package_code}: {humanize(decide.adj.adjustment_type)} {fmtQty(decide.adj.quantity_change, decide.adj.unit_symbol)} — “{decide.adj.reason}”</>}
        onConfirm={async (notes) => { await post(`inventory/adjustments/${decide!.adj.id}/${decide!.approve ? 'approve' : 'reject'}`, { notes }); toast('Decision recorded.'); refresh(); }} />
    </Card>
  );
}

function Disposals({ role }: { role: Role }) {
  const toast = useToast();
  const refresh = useRefresh();
  const list = usePagedList<Disposal>('inventory/disposals');
  const [creating, setCreating] = useState(false);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [type, setType] = useState('SCRAP');
  const [qty, setQty] = useState('');
  const [reference, setReference] = useState('');

  return (
    <Card title="Disposals & supplier returns" actions={can.dispose(role) && <Button size="sm" variant="danger" onClick={() => { setPkg(null); setQty(''); setCreating(true); }}>Record disposal</Button>}>
      {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
        <>
          <Table head={['Number', 'Type', 'Package', 'Quantity', 'Reason', 'Date', 'Authorised by']} empty={!list.rows.length}>
            {list.rows.map((d) => (
              <tr key={d.id}>
                <Td className="font-mono">{d.disposal_number}</Td>
                <Td>{humanize(d.disposal_type)}</Td>
                <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${d.package}`}>{d.package_code}</Link></Td>
                <Td>{fmtQty(d.quantity, d.unit_symbol)}</Td>
                <Td className="max-w-xs whitespace-normal">{d.reason}</Td>
                <Td>{fmtDate(d.disposal_date)}</Td>
                <Td>{d.authorized_by_name}</Td>
              </tr>
            ))}
          </Table>
          <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
        </>
      )}
      <ConfirmDialog open={creating} onClose={() => setCreating(false)} title="Record disposal" variant="danger" reason="required" confirmLabel="Dispose"
        description="Stock leaves the warehouse through the ledger. Scrapping released, usable stock needs a manager."
        onConfirm={async (reason) => {
          if (!pkg) throw new Error('Find the package first.');
          if (!(Number(qty) > 0)) throw new Error('Enter a quantity above zero.');
          await post('inventory/disposals', { package: pkg.id, disposal_type: type, quantity: qty, reason, reference });
          toast('Disposal recorded.');
          refresh();
        }}>
        <PackageLookup value={pkg} onChange={(p) => { setPkg(p); if (p) setQty(p.current_quantity); }} />
        {pkg?.is_available && <Alert tone="warn">This package is released and usable.</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value || 'SCRAP')} placeholder="Scrap" options={[{ value: 'SCRAP', label: 'Scrap' }, { value: 'SUPPLIER_RETURN', label: 'Return to supplier' }]} />
          <TextField label="Quantity" type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <TextField label="Reference (debit note, scrap note…)" value={reference} onChange={(e) => setReference(e.target.value)} />
      </ConfirmDialog>
    </Card>
  );
}

function Returns() {
  const list = usePagedList<MaterialReturn>('inventory/returns');
  return (
    <Card title="Returns from production">
      <p className="mb-3 text-sm text-slate-500">Record a return from the issue it came from (Issues → issue → Receive return).</p>
      {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
        <>
          <Table head={['Return', 'Issue', 'New package', 'Quantity', 'Reason', 'Returned by', 'QC', 'When']} empty={!list.rows.length}>
            {list.rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-mono">{r.return_number}</Td>
                <Td className="font-mono">{r.issue_number}</Td>
                <Td>{r.return_package && <Link className="font-mono text-brand-700 hover:underline" href={`/packages/${r.return_package}`}>{r.return_package_code}</Link>}</Td>
                <Td>{fmtQty(r.returned_quantity, r.unit_symbol)}</Td>
                <Td className="max-w-xs whitespace-normal">{r.reason}</Td>
                <Td>{r.returned_by_name || '—'}</Td>
                <Td>{r.requires_qc ? 'Retest' : 'Inspection hold'}</Td>
                <Td>{fmtDateTime(r.created_at)}</Td>
              </tr>
            ))}
          </Table>
          <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
        </>
      )}
    </Card>
  );
}

function Reconciliation() {
  const rec = useApi<{ reconciled: boolean; issues: { id: string; package_id: string; problems: string[] }[] }>('inventory/stock/reconciliation');
  const issues = rec.data?.issues ?? [];
  return (
    <Card title="Package balances vs movement ledger">
      {rec.error ? <ErrorState error={rec.error} /> : !rec.data ? <Loading /> : rec.data.reconciled ? (
        <Alert tone="good" title="Ledger reconciled">Every package balance and location matches its movement history.</Alert>
      ) : (
        <>
          <Alert tone="bad" title={`${issues.length} package(s) do not reconcile`}>Investigate the package history, then correct physical counts with an approved adjustment — never by editing the database.</Alert>
          <Table head={['Package', 'Problems']}>
            {issues.map((r) => (
              <tr key={r.id}>
                <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${r.id}`}>{r.package_id}</Link></Td>
                <Td className="whitespace-normal">{r.problems.join('; ')}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Card>
  );
}
