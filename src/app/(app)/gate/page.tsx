'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ErrorState, LinkButton, Loading, PageHeader, Pagination, Stat, StatGrid, Table, Td } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { StatusBadge, statusLabel } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';
import { useToast } from '@/components/Toast';
import { post } from '@/lib/api';
import { useApi, useMe, usePagedList, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDate, fmtDateTime, fmtQty, nowLocalInput } from '@/lib/format';
import type { ReceiptListItem, ReceiptStatus } from '@/lib/types';

type GateDashboard = {
  trucks_on_site: number;
  waiting_to_weigh: number;
  ready_to_leave: number;
  unloading: { pending: number; in_progress: number; completed: number };
  exceptions: number;
};

const STATUSES: ReceiptStatus[] = ['DRAFT', 'AWAITING_UNLOADING', 'UNLOADING_IN_PROGRESS', 'VERIFICATION_PENDING',
  'EXCEPTION', 'UNLOADED', 'STORED', 'CLOSED', 'CANCELLED'];

/** A truck may leave once it has been weighed empty (or its entry was cancelled). */
const canLeave = (r: ReceiptListItem) => !r.gate_out_at && r.status !== 'DRAFT' && (r.tare_weight != null || r.status === 'CANCELLED');

export default function GatePage() {
  const me = useMe();
  const toast = useToast();
  const refresh = useRefresh();
  const dash = useApi<GateDashboard>('receiving/goods-receipts/dashboard');
  const list = usePagedList<ReceiptListItem>('receiving/goods-receipts');
  const [leaving, setLeaving] = useState<ReceiptListItem | null>(null);
  const [outAt, setOutAt] = useState('');
  const d = dash.data;
  const isGate = !!me.data && can.createReceipt(me.data.role);

  return (
    <>
      <PageHeader
        title="Gate register"
        subtitle="Every truck in and out, the same as the gate sheet."
        actions={isGate && <LinkButton href="/receipts/new" variant="primary" size="lg">New gate entry</LinkButton>}
      />

      {dash.error ? <ErrorState error={dash.error} onRetry={() => dash.refetch()} /> : !d ? <Loading /> : (
        <StatGrid>
          <Stat label="Trucks inside" value={d.trucks_on_site} hint="Came in, not yet gone out" />
          <Stat label="Waiting at receiving" value={d.unloading.pending} hint={`${d.waiting_to_weigh} still to be weighed`} />
          <Stat label="Unloading now" value={d.unloading.in_progress} />
          <Stat label="Ready to leave" value={d.ready_to_leave} tone={d.ready_to_leave ? 'warn' : 'neutral'} hint="Weighed empty — record Truck out" />
          <Stat label="Need a manager" value={d.exceptions} tone={d.exceptions ? 'bad' : 'neutral'} />
        </StatGrid>
      )}

      <Card title="Gate entries" className="mt-6">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Search" placeholder="Gate entry, vehicle, invoice, supplier, LR, e-way bill, DL no." value={list.filters.search ?? ''}
            onChange={(e) => list.setFilter('search', e.target.value)} className="lg:col-span-2" />
          <SelectField label="Status" value={list.filters.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} placeholder="All"
            options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
          <TextField label="Gate in on" type="date" value={list.filters.arrival_from ?? ''}
            onChange={(e) => { list.setFilter('arrival_from', e.target.value); list.setFilter('arrival_to', e.target.value); }} />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['Gate entry', 'Gate in', 'Gate out', 'Supplier / invoice', 'Materials', 'Vehicle / transporter', 'Status']} empty={!list.rows.length}>
              {list.rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50">
                  <Td><Link href={`/receipts/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{r.gate_entry_number ?? r.receipt_number}</Link></Td>
                  <Td>{fmtDateTime(r.arrival_datetime)}</Td>
                  <Td>
                    {r.gate_out_at ? fmtDateTime(r.gate_out_at)
                      : isGate && canLeave(r) ? <Button size="sm" onClick={() => { setOutAt(nowLocalInput()); setLeaving(r); }}>Truck out</Button>
                        : <span className="text-slate-400">Inside</span>}
                  </Td>
                  <Td className="whitespace-normal">
                    <div className="font-medium">{r.supplier_name}</div>
                    <div className="text-xs text-slate-500">Inv {r.invoice_number} · {fmtDate(r.invoice_date)}</div>
                  </Td>
                  <Td className="whitespace-normal text-sm">
                    {r.materials.map((m, i) => (
                      <div key={i}>{m.description} — {fmtQty(m.quantity, m.unit)}{m.location && <span className="text-xs text-slate-500"> · {m.location}</span>}</div>
                    ))}
                  </Td>
                  <Td>
                    <div className="font-mono">{r.vehicle_number}</div>
                    <div className="text-xs text-slate-500">{[r.transporter_name, r.lr_number && `LR ${r.lr_number}`].filter(Boolean).join(' · ')}</div>
                  </Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!leaving}
        onClose={() => setLeaving(null)}
        title={`Truck out — ${leaving?.vehicle_number ?? ''}`}
        description="Record the time the truck left the gate."
        confirmLabel="Save gate out"
        onConfirm={async () => {
          await post(`receiving/goods-receipts/${leaving!.id}/gate-out`, { at: outAt || null });
          toast(`${leaving!.vehicle_number} has left.`);
          refresh();
        }}
      >
        <TextField label="Gate out time" type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
      </ConfirmDialog>
    </>
  );
}
