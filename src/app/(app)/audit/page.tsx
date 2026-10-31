'use client';

import { useState } from 'react';
import { usePagedList } from '@/lib/hooks';
import { fmtDateTime, humanize } from '@/lib/format';
import type { AuditEvent } from '@/lib/types';
import { Card, ErrorState, Loading, PageHeader, Pagination, Table, Td } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { Modal } from '@/components/Dialog';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'TRANSITION', 'PRINT', 'ISSUE', 'RETURN', 'ADJUST', 'APPROVE', 'REJECT', 'OVERRIDE', 'UPLOAD', 'DOWNLOAD', 'LOGIN', 'LOGOUT', 'SCAN'];

/** Immutable audit trail (read-only for administrators, auditors and managers). */
export default function AuditPage() {
  const list = usePagedList<AuditEvent>('audit-events', {}, 50);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const f = list.filters;
  return (
    <>
      <PageHeader title="Audit trail" subtitle="Every change, approval, override, print, scan and download — append-only." />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextField label="Search" placeholder="Entity ID, reason, username, request ID" value={(f.search as string) ?? ''} onChange={(e) => list.setFilter('search', e.target.value)} />
          <SelectField label="Action" placeholder="All" value={(f.action as string) ?? ''} onChange={(e) => list.setFilter('action', e.target.value)} options={ACTIONS.map((a) => ({ value: a, label: humanize(a) }))} />
          <TextField label="Entity type" placeholder="e.g. Package" value={(f.entity_type as string) ?? ''} onChange={(e) => list.setFilter('entity_type', e.target.value)} />
          <TextField label="Entity ID" value={(f.entity_id as string) ?? ''} onChange={(e) => list.setFilter('entity_id', e.target.value)} />
        </div>
        {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['When', 'Who', 'Action', 'Entity', 'Reason', '']} empty={!list.rows.length}>
              {list.rows.map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDateTime(e.timestamp)}</Td>
                  <Td>{e.actor_name || 'system'}</Td>
                  <Td>{humanize(e.action)}</Td>
                  <Td>{e.entity_type}<div className="max-w-[14rem] truncate font-mono text-xs text-slate-500">{e.entity_id}</div></Td>
                  <Td className="max-w-xs whitespace-normal">{e.reason || '—'}</Td>
                  <Td><button type="button" className="text-sm text-brand-700 underline" onClick={() => setOpen(e)}>Details</button></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
          </>
        )}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Audit event" wide>
        {open && (
          <pre className="max-h-[60vh] overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(open, null, 2)}</pre>
        )}
      </Modal>
    </>
  );
}
