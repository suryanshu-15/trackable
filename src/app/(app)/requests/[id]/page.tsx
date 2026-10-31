'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { post } from '@/lib/api';
import { useApi, useMe, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { MaterialRequest } from '@/lib/types';
import { Button, Card, DL, ErrorState, Loading, PageHeader, Table, Td } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';
import { IssueForm } from '@/components/issuing/IssueForm';
import { useToast } from '@/components/Toast';

const OPEN = ['SUBMITTED', 'ALLOCATED', 'PARTIALLY_ISSUED'];
type Act = 'allocate' | 'release-allocation' | 'cancel' | 'close';

export default function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefresh();
  const req = useApi<MaterialRequest>(`inventory/requests/${id}`);
  const [act, setAct] = useState<Act | null>(null);

  if (req.error) return <ErrorState error={req.error} onRetry={() => req.refetch()} />;
  if (!req.data || !me.data) return <Loading />;
  const r = req.data;
  const role = me.data.role;
  const open = OPEN.includes(r.status);
  const reserved = r.lines.some((l) => l.reservations.some((x) => x.is_active));
  const mine = r.requested_by === me.data.id;

  const ACTS: Record<Act, { label: string; reason?: 'required'; variant?: 'danger'; help: string }> = {
    allocate: { label: 'Allocate stock', help: 'Reserve released stock in FIFO / FEFO order so nobody else can issue it.' },
    'release-allocation': { label: 'Release reservations', reason: 'required', help: 'The reserved stock becomes free for other requests.' },
    cancel: { label: 'Cancel request', reason: 'required', variant: 'danger', help: 'Reservations are released. Issued material is unaffected.' },
    close: { label: 'Close request', reason: 'required', help: 'Close with the remaining quantity unissued.' },
  };
  const a = act ? ACTS[act] : null;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{r.request_number}</span>}
        subtitle={<span className="flex items-center gap-2"><StatusBadge status={r.status} label={r.status_display} /> {r.factory_name}{r.department_name && ` / ${r.department_name}`}</span>}
        actions={open && (
          <>
            {can.allocate(role) && <Button variant="secondary" onClick={() => setAct('allocate')}>{reserved ? 'Re-allocate' : 'Allocate stock'}</Button>}
            {can.allocate(role) && reserved && <Button variant="secondary" onClick={() => setAct('release-allocation')}>Release reservations</Button>}
            {can.allocate(role) && r.status === 'PARTIALLY_ISSUED' && <Button variant="secondary" onClick={() => setAct('close')}>Close</Button>}
            {(can.allocate(role) || mine) && <Button variant="danger" onClick={() => setAct('cancel')}>Cancel</Button>}
          </>
        )}
      />
      <div className="space-y-4">
        <Card title="Request">
          <DL items={[
            ['Requested by', r.requested_by_name], ['Raised', fmtDateTime(r.created_at)], ['Required by', fmtDateTime(r.required_by)],
            ['Production order', r.production_order || '—'], ['Cost centre', r.cost_centre || '—'], ['Notes', r.notes || '—'],
          ]} />
          {r.closed_reason && <p className="mt-2 text-sm text-slate-600">Closed: {r.closed_reason}</p>}
        </Card>
        <Card title="Lines">
          <Table head={['Material', 'Requested', 'Issued', 'Remaining', 'Reserved packages']}>
            {r.lines.map((l) => (
              <tr key={l.id}>
                <Td>{l.material_code}<div className="text-xs text-slate-500">{l.material_name}</div></Td>
                <Td>{fmtQty(l.requested_quantity, l.unit_symbol)}</Td>
                <Td>{fmtQty(l.issued_quantity, l.unit_symbol)}</Td>
                <Td className="font-semibold">{fmtQty(l.remaining_quantity, l.unit_symbol)}</Td>
                <Td>{l.reservations.filter((x) => x.is_active).map((x) => (
                  <div key={x.id} className="text-xs"><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${x.package}`}>{x.package_code}</Link> · {fmtQty(x.reserved_quantity, l.unit_symbol)}</div>
                ))}</Td>
              </tr>
            ))}
          </Table>
          {r.issue_numbers.length > 0 && <p className="mt-3 text-sm">Issues: {r.issue_numbers.map((n) => <span key={n} className="mr-2 font-mono">{n}</span>)} — see <Link className="text-brand-700 underline" href={`/issues?material_request=${r.id}`}>issues</Link></p>}
        </Card>
        {open && can.issue(role) && (
          <Card title="Issue material">
            <IssueForm request={r} onIssued={(iss) => { toast(`Issued ${iss.issue_number}${iss.fifo_override ? ' (FIFO override recorded)' : ''}.`); refresh(); router.push(`/issues/${iss.id}`); }} />
          </Card>
        )}
      </div>
      <ConfirmDialog open={!!a} onClose={() => setAct(null)} title={a?.label} description={a?.help} confirmLabel={a?.label} reason={a?.reason} variant={a?.variant}
        onConfirm={async (reason) => {
          await post(`inventory/requests/${r.id}/${act}`, a?.reason ? { reason } : {});
          toast(`${a!.label}: done.`);
          refresh();
        }} />
    </>
  );
}
