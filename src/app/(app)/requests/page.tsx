'use client';

import Link from 'next/link';
import { useFactories, useMaterials, useMe, usePagedList } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDateTime, fmtQty, humanize } from '@/lib/format';
import type { MaterialRequest } from '@/lib/types';
import { Card, ErrorState, LinkButton, Loading, PageHeader, Pagination, Table, Td } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { StatusBadge } from '@/components/StatusBadge';

const STATUSES = ['SUBMITTED', 'ALLOCATED', 'PARTIALLY_ISSUED', 'FULFILLED', 'CLOSED', 'CANCELLED'];

export default function RequestsPage() {
  const me = useMe();
  const list = usePagedList<MaterialRequest>('inventory/requests', { status: ['SUBMITTED', 'ALLOCATED', 'PARTIALLY_ISSUED'] });
  const factories = useFactories();
  const materials = useMaterials();
  const f = list.filters;
  const statusValue = Array.isArray(f.status) ? 'open' : (f.status ?? '');

  return (
    <>
      <PageHeader
        title="Material requests"
        subtitle={me.data?.role === 'FACTORY' ? 'Your requests to the warehouse.' : 'Factory requests waiting to be picked and issued.'}
        actions={me.data && can.raiseRequest(me.data.role) && <LinkButton variant="primary" href="/requests/new">New request</LinkButton>}
      />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextField label="Search" placeholder="Request, production order, material" value={(f.search as string) ?? ''} onChange={(e) => list.setFilter('search', e.target.value)} />
          <SelectField label="Status" placeholder="All" value={statusValue} onChange={(e) => list.setFilter('status', e.target.value === 'open' ? ['SUBMITTED', 'ALLOCATED', 'PARTIALLY_ISSUED'] : e.target.value)}
            options={[{ value: 'open', label: 'Open' }, ...STATUSES.map((s) => ({ value: s, label: humanize(s) }))]} />
          <SelectField label="Factory" placeholder="All" value={(f.factory as string) ?? ''} onChange={(e) => list.setFilter('factory', e.target.value)} options={factories.items.map((x) => ({ value: x.id, label: x.name }))} />
          <SelectField label="Material" placeholder="All" value={(f.material as string) ?? ''} onChange={(e) => list.setFilter('material', e.target.value)} options={materials.items.map((m) => ({ value: m.id, label: m.code }))} />
        </div>
        {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['Request', 'Factory', 'Production order', 'Materials', 'Required by', 'Requested by', 'Status']} empty={!list.rows.length}>
              {list.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td><Link className="font-mono font-medium text-brand-700 hover:underline" href={`/requests/${r.id}`}>{r.request_number}</Link><div className="text-xs text-slate-500">{fmtDateTime(r.created_at)}</div></Td>
                  <Td>{r.factory_name}{r.department_name && <div className="text-xs text-slate-500">{r.department_name}</div>}</Td>
                  <Td>{r.production_order || '—'}</Td>
                  <Td>{r.lines.map((l) => <div key={l.id} className="text-xs">{l.material_code}: {fmtQty(l.issued_quantity)} / {fmtQty(l.requested_quantity, l.unit_symbol)}</div>)}</Td>
                  <Td>{fmtDateTime(r.required_by)}</Td>
                  <Td>{r.requested_by_name}</Td>
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
