'use client';

import { useState } from 'react';
import { post } from '@/lib/api';
import { useMe, usePagedList, useRefresh } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import type { Role, User } from '@/lib/types';
import { Button, Card, ErrorState, Loading, PageHeader, Pagination, Table, Td } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { Badge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';
import { useToast } from '@/components/Toast';

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Administrator' }, { value: 'GATE', label: 'Gate operator' }, { value: 'RECEIVING', label: 'Receiving / unloading' },
  { value: 'WAREHOUSE', label: 'Warehouse operator' }, { value: 'LAB_TECH', label: 'Lab technician' }, { value: 'LAB_REVIEWER', label: 'Lab reviewer / QA' },
  { value: 'FACTORY', label: 'Factory / requester' }, { value: 'AUDITOR', label: 'Auditor (read-only)' }, { value: 'MANAGER', label: 'Manager' },
];

/** User administration. Master data (materials, suppliers, locations, tests) is maintained in Django admin. */
export default function UsersPage() {
  const me = useMe();
  const toast = useToast();
  const refresh = useRefresh();
  const list = usePagedList<User>('auth/users', {}, 50);
  const [creating, setCreating] = useState(false);
  const [roleFor, setRoleFor] = useState<User | null>(null);
  const [toggle, setToggle] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', email: '', first_name: '', last_name: '', role: 'GATE', employee_id: '', password: '' });
  const [newRole, setNewRole] = useState('');

  return (
    <>
      <PageHeader title="Users" subtitle="Roles decide what each person can do; the API enforces them." actions={<Button onClick={() => setCreating(true)}>Add user</Button>} />
      <Card>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <TextField label="Search" value={(list.filters.search as string) ?? ''} onChange={(e) => list.setFilter('search', e.target.value)} />
          <SelectField label="Role" placeholder="All" value={(list.filters.role as string) ?? ''} onChange={(e) => list.setFilter('role', e.target.value)} options={ROLES} />
        </div>
        {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['User', 'Name', 'Role', 'Employee ID', 'Last login', 'Status', '']} empty={!list.rows.length}>
              {list.rows.map((u) => (
                <tr key={u.id}>
                  <Td className="font-mono">{u.username}</Td>
                  <Td>{u.display_name}<div className="text-xs text-slate-500">{u.email}</div></Td>
                  <Td>{u.role_display}</Td>
                  <Td>{u.employee_id || '—'}</Td>
                  <Td>{fmtDateTime(u.last_login)}</Td>
                  <Td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</Td>
                  <Td>
                    {u.id !== me.data?.id && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => { setNewRole(u.role); setRoleFor(u); }}>Role</Button>
                        <Button size="sm" variant={u.is_active ? 'danger' : 'success'} onClick={() => setToggle(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog open={creating} onClose={() => setCreating(false)} title="Add user" confirmLabel="Create user"
        onConfirm={async () => {
          if (!form.username || !form.email || form.password.length < 8) throw new Error('Username, email and a password of 8+ characters are required.');
          await post('auth/users', { ...form, password_confirm: form.password });
          toast(`User ${form.username} created.`);
          setForm({ username: '', email: '', first_name: '', last_name: '', role: 'GATE', employee_id: '', password: '' });
          refresh();
        }}>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
          <TextField label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextField label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <TextField label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <SelectField label="Role" required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={ROLES} />
          <TextField label="Employee ID" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
          <TextField label="Initial password" type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="col-span-2" />
        </div>
      </ConfirmDialog>
      <ConfirmDialog open={!!roleFor} onClose={() => setRoleFor(null)} title={`Change role — ${roleFor?.username}`} confirmLabel="Change role"
        description="Takes effect on the user's next request. The change is audited."
        onConfirm={async () => { await post(`auth/users/${roleFor!.id}/set-role`, { role: newRole }); toast('Role changed.'); refresh(); }}>
        <SelectField label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value)} options={ROLES} />
      </ConfirmDialog>
      <ConfirmDialog open={!!toggle} onClose={() => setToggle(null)} title={`${toggle?.is_active ? 'Deactivate' : 'Activate'} ${toggle?.username}`} variant={toggle?.is_active ? 'danger' : 'success'}
        confirmLabel={toggle?.is_active ? 'Deactivate' : 'Activate'}
        description={toggle?.is_active ? 'They can no longer sign in; existing sessions end at the next token refresh.' : 'They can sign in again.'}
        onConfirm={async () => { await post(`auth/users/${toggle!.id}/${toggle!.is_active ? 'deactivate' : 'activate'}`); toast('Done.'); refresh(); }} />
    </>
  );
}
