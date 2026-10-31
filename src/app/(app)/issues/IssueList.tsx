'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFactories, useMe, usePagedList } from '@/lib/hooks';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { MaterialIssue } from '@/lib/types';
import { Card, ErrorState, Loading, PageHeader, Pagination, Table, Td } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { Badge, StatusBadge } from '@/components/StatusBadge';

export function IssueList() {
  const me = useMe();
  const params = useSearchParams();
  const list = usePagedList<MaterialIssue>('inventory/issues', params.get('material_request') ? { material_request: params.get('material_request')! } : {});
  const factories = useFactories();
  const f = list.filters;

  return (
    <>
      <PageHeader title="Material issues" subtitle={me.data?.role === 'FACTORY' ? 'Material issued to you — acknowledge what you received.' : 'Every issue to production, with lot traceability.'} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <TextField label="Search" placeholder="Issue, order, request, package" value={(f.search as string) ?? ''} onChange={(e) => list.setFilter('search', e.target.value)} className="sm:col-span-2" />
          <SelectField label="Status" placeholder="All" value={(f.status as string) ?? ''} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: 'ISSUED', label: 'Awaiting acknowledgement' }, { value: 'ACKNOWLEDGED', label: 'Acknowledged' }]} />
          <SelectField label="Factory" placeholder="All" value={(f.factory as string) ?? ''} onChange={(e) => list.setFilter('factory', e.target.value)} options={factories.items.map((x) => ({ value: x.id, label: x.name }))} />
          <SelectField label="FIFO override" placeholder="All" value={(f.fifo_override as string) ?? ''} onChange={(e) => list.setFilter('fifo_override', e.target.value)} options={[{ value: 'true', label: 'Overrides only' }]} />
        </div>
        {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['Issue', 'Date', 'Factory', 'Order', 'Lines', 'Issued by', 'Status']} empty={!list.rows.length}>
              {list.rows.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <Td><Link className="font-mono font-medium text-brand-700 hover:underline" href={`/issues/${i.id}`}>{i.issue_number}</Link>{i.request_number && <div className="font-mono text-xs text-slate-500">{i.request_number}</div>}</Td>
                  <Td>{fmtDateTime(i.issue_datetime)}</Td>
                  <Td>{i.factory_name}{i.department_name && <div className="text-xs text-slate-500">{i.department_name}</div>}</Td>
                  <Td>{i.production_order || '—'}</Td>
                  <Td>{i.issue_lines.map((l) => <div key={l.id} className="text-xs">{l.material_code} · {fmtQty(l.issued_quantity, l.unit_symbol)}</div>)}</Td>
                  <Td>{i.issued_by_name}</Td>
                  <Td><StatusBadge status={i.status} />{i.fifo_override && <div className="mt-1"><Badge tone="amber">FIFO override</Badge></div>}</Td>
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
