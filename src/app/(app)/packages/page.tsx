'use client';

import Link from 'next/link';
import { useMaterials, usePagedList, useSuppliers } from '@/lib/hooks';
import { fmtDate, fmtQty, humanize } from '@/lib/format';
import type { PackageListItem } from '@/lib/types';
import { Card, ErrorState, Loading, PageHeader, Pagination, Table, Td } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { AvailabilityBadge, StatusBadge } from '@/components/StatusBadge';

const QC = ['NOT_REQUIRED', 'PENDING_SAMPLING', 'SAMPLED', 'TESTING', 'PASSED', 'FAILED', 'ON_HOLD', 'RETEST_REQUIRED'];
const STATUS = ['CREATED', 'AWAITING_PUTAWAY', 'STORED', 'ISSUED', 'REPACKED', 'DISPOSED', 'SUPPLIER_RETURNED'];

function ageDays(received: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(received).getTime()) / 86_400_000));
}

/** Material availability (spec §4E): every package with its source, QC state, location and availability. */
export default function PackagesPage() {
  const list = usePagedList<PackageListItem>('inventory/packages', { in_warehouse: 'true', ordering: 'received_at' });
  const materials = useMaterials();
  const suppliers = useSuppliers();
  const f = list.filters;

  return (
    <>
      <PageHeader title="Material availability" subtitle="Per package: source, lot, quantity, location, QC and whether it can be issued." />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Search" placeholder="Package, lot, material, receipt" value={f.search ?? ''} onChange={(e) => list.setFilter('search', e.target.value)} />
          <SelectField label="Material" placeholder="All" value={f.material ?? ''} onChange={(e) => list.setFilter('material', e.target.value)} options={materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))} />
          <SelectField label="Supplier" placeholder="All" value={f.supplier ?? ''} onChange={(e) => list.setFilter('supplier', e.target.value)} options={suppliers.items.map((s) => ({ value: s.id, label: s.name }))} />
          <SelectField label="QC status" placeholder="All" value={f.qc_status ?? ''} onChange={(e) => list.setFilter('qc_status', e.target.value)} options={QC.map((s) => ({ value: s, label: humanize(s) }))} />
          <SelectField label="Package status" placeholder="All" value={f.status ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} options={STATUS.map((s) => ({ value: s, label: humanize(s) }))} />
          <SelectField label="Availability" placeholder="All" value={f.available ?? ''} onChange={(e) => list.setFilter('available', e.target.value)} options={[{ value: 'true', label: 'Available for issue' }, { value: 'false', label: 'Blocked' }]} />
          <SelectField label="Scope" placeholder="Everything (incl. issued)" value={f.in_warehouse ?? ''} onChange={(e) => list.setFilter('in_warehouse', e.target.value)} options={[{ value: 'true', label: 'In warehouse' }, { value: 'false', label: 'Issued / disposed' }]} />
          <TextField label="Expiring on or before" type="date" value={f.expiring_before ?? ''} onChange={(e) => list.setFilter('expiring_before', e.target.value)} />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['Package', 'Material', 'Lot', 'Quantity', 'Location', 'Received', 'Age', 'Expiry / retest', 'QC', 'Status', 'Issue', 'Receipt']} empty={!list.rows.length}>
              {list.rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td><Link href={`/packages/${p.id}`} className="font-mono font-medium text-brand-700 hover:underline">{p.package_id}</Link></Td>
                  <Td className="whitespace-normal"><div>{p.material_code}</div><div className="text-xs text-slate-500">{p.material_name}</div></Td>
                  <Td className="font-mono">{p.batch_number || '—'}</Td>
                  <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
                  <Td>{p.location_code ?? '—'}{p.location_is_quarantine && <div className="text-xs text-amber-700">quarantine</div>}</Td>
                  <Td>{fmtDate(p.received_at)}</Td>
                  <Td>{ageDays(p.received_at)} d</Td>
                  <Td>{fmtDate(p.expiry_date)}{p.retest_date && <div className="text-xs text-slate-500">retest {fmtDate(p.retest_date)}</div>}</Td>
                  <Td><StatusBadge status={p.qc_status} label={p.qc_status_display} /></Td>
                  <Td><StatusBadge status={p.status} label={p.status_display} /></Td>
                  <Td><AvailabilityBadge available={p.is_available} onHold={p.is_on_hold} recalled={p.is_recalled} /></Td>
                  <Td className="font-mono text-xs">{p.receipt_number}</Td>
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
