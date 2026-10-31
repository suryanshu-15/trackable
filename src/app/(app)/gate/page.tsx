'use client';

import Link from 'next/link';
import { Card, ErrorState, LinkButton, Loading, PageHeader, Pagination, Stat, StatGrid, Table, Td, Alert } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { StatusBadge } from '@/components/StatusBadge';
import { useApi, useMe, usePagedList, useSuppliers, useMaterials } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDate, fmtDateTime, fmtQty, humanize } from '@/lib/format';
import type { ReceiptListItem, ReceiptStatus } from '@/lib/types';

type GateDashboard = {
  today_receipts: number;
  week_receipts: number;
  by_status: Record<ReceiptStatus, number>;
  trucks_on_site: number;
  awaiting_line_entry: number;
  unloading: { pending: number; in_progress: number; completed: number };
  exceptions: number;
  quantity_discrepancy_receipts: number;
  weight_discrepancy_receipts: string[];
};

const STATUSES: ReceiptStatus[] = ['DRAFT', 'GATE_REGISTERED', 'AWAITING_UNLOADING', 'UNLOADING_IN_PROGRESS', 'VERIFICATION_PENDING',
  'EXCEPTION', 'UNLOADED', 'PUTAWAY_IN_PROGRESS', 'STORED', 'CLOSED', 'CANCELLED'];

export default function GatePage() {
  const me = useMe();
  const dash = useApi<GateDashboard>('receiving/goods-receipts/dashboard');
  const list = usePagedList<ReceiptListItem>('receiving/goods-receipts');
  const suppliers = useSuppliers();
  const materials = useMaterials();
  const d = dash.data;

  return (
    <>
      <PageHeader
        title="Gate & inward"
        subtitle="Trucks on site, receipts and discrepancies — live from the server."
        actions={me.data && can.createReceipt(me.data.role) && <LinkButton href="/receipts/new" variant="primary">New gate receipt</LinkButton>}
      />

      {dash.error ? <ErrorState error={dash.error} onRetry={() => dash.refetch()} /> : !d ? <Loading /> : (
        <div className="space-y-4">
          <StatGrid>
            <Stat label="Trucks on site" value={d.trucks_on_site} hint="Arrived, not yet unloaded" />
            <Stat label="Receipts today" value={d.today_receipts} />
            <Stat label="This week" value={d.week_receipts} />
            <Stat label="Awaiting line entry" value={d.awaiting_line_entry} tone={d.awaiting_line_entry ? 'warn' : 'neutral'} />
            <Stat label="Unloading pending" value={d.unloading.pending} hint={`${d.unloading.in_progress} in progress · ${d.unloading.completed} completed`} />
            <Stat label="Exceptions" value={d.exceptions} tone={d.exceptions ? 'bad' : 'neutral'} />
          </StatGrid>
          {(d.weight_discrepancy_receipts.length > 0 || d.quantity_discrepancy_receipts > 0) && (
            <Alert tone="warn" title="Discrepancy alerts">
              {d.weight_discrepancy_receipts.length > 0 && (
                <p>Net weight outside tolerance: {d.weight_discrepancy_receipts.map((r, i) => (
                  <span key={r}>{i > 0 && ', '}<button type="button" className="font-mono underline" onClick={() => list.setFilter('search', r)}>{r}</button></span>
                ))}</p>
              )}
              {d.quantity_discrepancy_receipts > 0 && <p>{d.quantity_discrepancy_receipts} receipt(s) with unresolved quantity discrepancies.</p>}
            </Alert>
          )}
        </div>
      )}

      <Card title="Receipts" className="mt-6">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Search" placeholder="Receipt, invoice, truck, supplier" value={list.filters.search ?? ''} onChange={(e) => list.setFilter('search', e.target.value)} className="lg:col-span-2" />
          <SelectField label="Status" value={list.filters.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} placeholder="All" options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
          <SelectField label="Supplier" value={list.filters.supplier ?? ''} onChange={(e) => list.setFilter('supplier', e.target.value)} placeholder="All" options={suppliers.items.map((s) => ({ value: s.id, label: s.name }))} />
          <SelectField label="Material" value={list.filters.material ?? ''} onChange={(e) => list.setFilter('material', e.target.value)} placeholder="All" options={materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))} />
          <TextField label="Arrived from" type="date" value={list.filters.arrival_from ?? ''} onChange={(e) => list.setFilter('arrival_from', e.target.value)} />
          <TextField label="Arrived to" type="date" value={list.filters.arrival_to ?? ''} onChange={(e) => list.setFilter('arrival_to', e.target.value)} />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['Receipt', 'Supplier', 'Invoice', 'Truck', 'Arrived', 'Lines', 'Net weight', 'Status']} empty={!list.rows.length}>
              {list.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td><Link href={`/receipts/${r.id}`} className="font-mono font-medium text-brand-700 hover:underline">{r.receipt_number}</Link></Td>
                  <Td className="whitespace-normal">{r.supplier_name}</Td>
                  <Td>{r.invoice_number}<div className="text-xs text-slate-500">{fmtDate(r.invoice_date)}</div></Td>
                  <Td className="font-mono">{r.vehicle_number}</Td>
                  <Td>{fmtDateTime(r.arrival_datetime)}</Td>
                  <Td>{r.line_count}</Td>
                  <Td>{fmtQty(r.net_weight)}</Td>
                  <Td><StatusBadge status={r.status} label={r.status_display} /></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
          </>
        )}
      </Card>
    </>
  );
}
