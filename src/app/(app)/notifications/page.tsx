'use client';

import Link from 'next/link';
import { post } from '@/lib/api';
import { usePagedList, useRefresh } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import type { Notification } from '@/lib/types';
import { Button, Card, ErrorState, Loading, PageHeader, Pagination, cx } from '@/components/ui';
import { SelectField } from '@/components/forms';
import { StatusBadge } from '@/components/StatusBadge';

export default function NotificationsPage() {
  const list = usePagedList<Notification>('notifications', { is_read: 'false' });
  const refresh = useRefresh();
  const read = async (n: Notification) => { if (!n.is_read) { await post(`notifications/${n.id}/mark-read`); refresh(); } };

  return (
    <>
      <PageHeader title="Notifications" actions={<Button variant="secondary" onClick={async () => { await post('notifications/mark-all-read'); refresh(); }}>Mark all read</Button>} />
      <Card>
        <SelectField label="Show" className="mb-3 max-w-xs" placeholder="All" value={(list.filters.is_read as string) ?? ''} onChange={(e) => list.setFilter('is_read', e.target.value)} options={[{ value: 'false', label: 'Unread' }, { value: 'true', label: 'Read' }]} />
        {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : list.rows.length === 0 ? <p className="text-sm text-slate-500">No notifications.</p> : (
          <>
            <ul className="divide-y divide-slate-100">
              {list.rows.map((n) => (
                <li key={n.id} className={cx('flex flex-wrap items-start justify-between gap-2 py-3', !n.is_read && 'font-medium')}>
                  <div>
                    <div className="flex items-center gap-2"><StatusBadge status={n.level} /> <span>{n.title}</span></div>
                    <p className="mt-1 text-sm font-normal text-slate-600">{n.message}</p>
                    <p className="text-xs font-normal text-slate-400">{fmtDateTime(n.created_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    {n.link_url && n.link_url.startsWith('/') && <Link href={n.link_url} onClick={() => read(n)} className="text-sm text-brand-700 underline">Open</Link>}
                    {!n.is_read && <Button size="sm" variant="ghost" onClick={() => read(n)}>Mark read</Button>}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
          </>
        )}
      </Card>
    </>
  );
}
