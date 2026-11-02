'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { ApiError, del, patch } from '@/lib/api';
import { useMe, usePagedList, usePolicy, useRefresh } from '@/lib/hooks';
import { Alert, Button, Card, ErrorState, Loading, PageHeader, Pagination, Table, Td, cx } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { Badge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';
import { useToast } from '@/components/Toast';
import { MASTER_KINDS, kindBySlug } from '@/components/master/config';
import { MasterEditor } from '@/components/master/MasterEditor';

type Row = Record<string, unknown> & { id: number; is_active?: boolean };

/** Admin Master data: list, search, add, edit, activate / deactivate and (unused records only) delete. */
export default function MasterDataPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: slug } = use(params);
  const kind = kindBySlug(slug);
  const me = useMe();
  const managers = usePolicy().data?.['master.manage_roles'] ?? ['ADMIN', 'MANAGER'];
  if (!kind) return <ErrorState error={new Error('Unknown master data type.')} />;
  if (me.data && !managers.includes(me.data.role)) return <ErrorState error={new ApiError(403, { message: 'Master data is maintained by administrators and managers.' }, null)} />;
  return <MasterList key={kind.slug} slug={kind.slug} />;
}

function MasterList({ slug }: { slug: string }) {
  const kind = kindBySlug(slug)!;
  const toast = useToast();
  const refresh = useRefresh();
  const list = usePagedList<Row>(kind.path, kind.hasActive ? { is_active: 'true' } : {}, 50);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [toggling, setToggling] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const q = String(list.filters.search ?? '');
  // The server searches every field of the record (see search_fields in master/views.py).
  const rows = list.rows;
  const label = (r: Row) => String(r.name ?? r.code ?? `${r.from_unit_display} → ${r.to_unit_display}`);

  return (
    <>
      <PageHeader title="Master data" subtitle="Reference lists used across Trackable. Changes are recorded in the audit trail."
        actions={<Button onClick={() => setEditing('new')}>+ Add {kind.noun}</Button>} />

      <nav aria-label="Master data types" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {MASTER_KINDS.map((k) => (
          <Link key={k.slug} href={`/admin/master/${k.slug}`} aria-current={k.slug === slug ? 'page' : undefined}
            className={cx('whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition',
              k.slug === slug ? 'bg-brand-600 text-white shadow' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900')}>
            {k.title}
          </Link>
        ))}
      </nav>

      <Card title={kind.title}>
        <p className="mb-4 text-sm text-slate-500">{kind.description}</p>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField label="Search" placeholder={kind.searchHint} value={String(list.filters.search ?? '')} onChange={(e) => list.setFilter('search', e.target.value)} className="sm:col-span-2" />
          {kind.hasActive && (
            <SelectField label="Show" placeholder="All" value={String(list.filters.is_active ?? '')} onChange={(e) => list.setFilter('is_active', e.target.value)}
              options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
          )}
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data ? <Loading /> : (
          <>
            <Table head={[...kind.columns.map((c) => c.label), ...(kind.hasActive ? ['Status'] : []), '']} empty={!rows.length}
              emptyText={q ? 'No records match.' : `No ${kind.noun}s yet — add the first one.`}>
              {rows.map((r) => (
                <tr key={r.id} className={cx('hover:bg-slate-50', r.is_active === false && 'text-slate-400')}>
                  {kind.columns.map((c, i) => <Td key={c.label} className={i === 0 ? 'font-mono font-medium' : 'whitespace-normal'}>{c.value(r)}</Td>)}
                  {kind.hasActive && <Td>{r.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</Td>}
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Edit</Button>
                      {kind.hasActive && (
                        <Button size="sm" variant="ghost" onClick={() => setToggling(r)}>{r.is_active ? 'Deactivate' : 'Activate'}</Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDeleting(r)}>Delete</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
          </>
        )}
      </Card>

      <MasterEditor kind={kind} record={editing} onClose={() => setEditing(null)}
        onSaved={(created) => { toast(`${kind.noun.charAt(0).toUpperCase() + kind.noun.slice(1)} ${created ? 'added' : 'saved'}.`); refresh(); }} />
      <ConfirmDialog open={!!toggling} onClose={() => setToggling(null)}
        title={toggling?.is_active ? `Deactivate ${toggling ? label(toggling) : ''}?` : `Activate ${toggling ? label(toggling) : ''}?`}
        variant={toggling?.is_active ? 'danger' : 'success'} confirmLabel={toggling?.is_active ? 'Deactivate' : 'Activate'}
        description={toggling?.is_active
          ? 'It disappears from dropdowns for new entries. Existing records that use it keep it, and you can activate it again at any time.'
          : 'It becomes available in dropdowns again.'}
        onConfirm={async () => {
          await patch(`${kind.path}/${toggling!.id}`, { is_active: !toggling!.is_active });
          toast(toggling!.is_active ? 'Deactivated.' : 'Activated.');
          refresh();
        }} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title={`Delete ${deleting ? label(deleting) : ''}?`} variant="danger" confirmLabel="Delete"
        description={<>Only records that nothing uses yet can be deleted. {kind.hasActive && 'If it has been used, deactivate it instead.'}</>}
        onConfirm={async () => { await del(`${kind.path}/${deleting!.id}`); toast('Deleted.'); refresh(); }} />
      {!kind.hasActive && <div className="mt-4"><Alert tone="info">{kind.title} have no active / inactive state; delete unused ones instead.</Alert></div>}
    </>
  );
}
