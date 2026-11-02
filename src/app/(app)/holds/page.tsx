'use client';

import { useState } from 'react';
import { api, post } from '@/lib/api';
import { useApi, useMaterials, useMe, usePagedList, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { Hold, Package } from '@/lib/types';
import { ActionError, Button, Card, ErrorState, Loading, PageHeader, Pagination, Table, Td, Tabs } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { Badge } from '@/components/StatusBadge';
import { ConfirmDialog, Modal } from '@/components/Dialog';
import { useToast } from '@/components/Toast';
import { MasterSelect } from '@/components/master/MasterSelect';

type Impact = {
  in_stock: { package_id: string; quantity: string; unit: string; location: string | null; status: string }[];
  issued: { issue_number: string; factory: string; package_id: string; quantity: string; unit: string; issued_at: string }[];
};

/** Holds block issue immediately without changing QC records; recalls also trace what already left. */
export default function HoldsPage() {
  const me = useMe();
  const toast = useToast();
  const refresh = useRefresh();
  const [tab, setTab] = useState<'true' | 'false'>('true');
  const list = usePagedList<Hold>('laboratory/holds', { is_active: 'true' });
  const [creating, setCreating] = useState(false);
  const [release, setRelease] = useState<Hold | null>(null);
  const [impactOf, setImpactOf] = useState<Hold | null>(null);
  const impact = useApi<Impact>(impactOf ? `laboratory/holds/${impactOf.id}/impact` : null);
  const role = me.data?.role;

  return (
    <>
      <PageHeader title="Holds & recalls" subtitle="Block material from issue at once; recalls trace forward to factories."
        actions={role && can.hold(role) && <Button variant="danger" onClick={() => setCreating(true)}>Place hold / recall</Button>} />
      <Card>
        <Tabs tabs={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Released' }]} value={tab} onChange={(v) => { setTab(v); list.setFilter('is_active', v); }} />
        {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : (
          <>
            <Table head={['Reference', 'Type', 'Scope', 'Packages', 'Reason', 'Placed', 'Released', '']} empty={!list.rows.length}>
              {list.rows.map((h) => (
                <tr key={h.id}>
                  <Td className="font-mono">{h.reference}</Td>
                  <Td><Badge tone="red">{h.hold_type}</Badge></Td>
                  <Td>{h.material_code ? `${h.material_code}${h.batch_number ? ` / lot ${h.batch_number}` : ''}` : 'Selected packages'}</Td>
                  <Td>{h.package_ids.length}</Td>
                  <Td className="max-w-xs whitespace-normal">{h.reason}</Td>
                  <Td className="text-xs">{h.held_by_name}<div>{fmtDateTime(h.held_at)}</div></Td>
                  <Td className="text-xs">{h.released_at ? <>{h.released_by_name}<div>{fmtDateTime(h.released_at)}</div></> : '—'}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setImpactOf(h)}>Impact</Button>
                      {h.is_active && role && can.hold(role) && <Button size="sm" onClick={() => setRelease(h)}>Release</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.page} totalPages={list.data.total_pages} count={list.data.count} onPage={list.setPage} />
          </>
        )}
      </Card>

      <CreateHold open={creating} onClose={() => setCreating(false)} onDone={() => { toast('Hold placed — affected stock is blocked from issue.'); refresh(); }} />
      <ConfirmDialog open={!!release} onClose={() => setRelease(null)} title={`Release ${release?.reference}`} reason="required" reasonLabel="Release notes"
        description="Packages become issuable again only if nothing else blocks them (QC status, other holds)."
        onConfirm={async (notes) => { await post(`laboratory/holds/${release!.id}/release`, { notes }); toast('Hold released.'); refresh(); }} />
      <Modal open={!!impactOf} onClose={() => setImpactOf(null)} title={`Impact of ${impactOf?.reference}`} wide>
        {!impact.data ? <Loading /> : (
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="mb-1 font-semibold">Still in stock ({impact.data.in_stock.length})</h3>
              <Table head={['Package', 'Quantity', 'Location', 'Status']} empty={!impact.data.in_stock.length}>
                {impact.data.in_stock.map((p) => <tr key={p.package_id}><Td className="font-mono">{p.package_id}</Td><Td>{fmtQty(p.quantity, p.unit)}</Td><Td>{p.location ?? '—'}</Td><Td>{p.status}</Td></tr>)}
              </Table>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Already issued ({impact.data.issued.length})</h3>
              <Table head={['Issue', 'Factory', 'Package', 'Quantity', 'When']} empty={!impact.data.issued.length}>
                {impact.data.issued.map((l, i) => <tr key={i}><Td className="font-mono">{l.issue_number}</Td><Td>{l.factory}</Td><Td className="font-mono">{l.package_id}</Td><Td>{fmtQty(l.quantity, l.unit)}</Td><Td>{fmtDateTime(l.issued_at)}</Td></tr>)}
              </Table>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function CreateHold({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const materials = useMaterials();
  const [type, setType] = useState('HOLD');
  const [scope, setScope] = useState<'lot' | 'packages'>('lot');
  const [material, setMaterial] = useState('');
  const [batch, setBatch] = useState('');
  const [code, setCode] = useState('');
  const [pkgs, setPkgs] = useState<Package[]>([]);
  const [lookupError, setLookupError] = useState<unknown>(null);

  const add = async () => {
    if (!code.trim()) return;
    setLookupError(null);
    try {
      const p = await api<Package>('inventory/packages/resolve', { query: { code: code.trim() } });
      setPkgs((x) => (x.some((y) => y.id === p.id) ? x : [...x, p]));
      setCode('');
    } catch (e) {
      setLookupError(e);
    }
  };

  return (
    <ConfirmDialog open={open} onClose={onClose} title="Place hold or recall" variant="danger" confirmLabel="Place" reason="required"
      onConfirm={async (reason) => {
        if (scope === 'lot' && !material) throw new Error('Choose the material.');
        if (scope === 'packages' && !pkgs.length) throw new Error('Add at least one package.');
        await post('laboratory/holds', {
          hold_type: type, reason,
          ...(scope === 'lot' ? { material: Number(material), batch_number: batch } : { packages: pkgs.map((p) => p.id) }),
        });
        setPkgs([]);
        onDone();
      }}>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value || 'HOLD')} placeholder="Hold" options={[{ value: 'HOLD', label: 'Hold' }, { value: 'RECALL', label: 'Recall (includes issued stock)' }]} />
        <SelectField label="Scope" value={scope} onChange={(e) => setScope((e.target.value || 'lot') as 'lot' | 'packages')} placeholder="Material / lot" options={[{ value: 'lot', label: 'Material / lot' }, { value: 'packages', label: 'Specific packages' }]} />
      </div>
      {scope === 'lot' ? (
        <div className="grid grid-cols-2 gap-3">
          <MasterSelect kind="material" label="Material" value={material} onChange={(val) => setMaterial(val)} options={materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))} />
          <TextField label="Lot / batch" hint="Leave empty for every lot of the material." value={batch} onChange={(e) => setBatch(e.target.value)} />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <TextField label="Scan or type package ID" value={code} onChange={(e) => setCode(e.target.value)} className="flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <Button variant="secondary" onClick={add}>Add</Button>
          </div>
          <ActionError error={lookupError} />
          <ul className="font-mono text-sm">{pkgs.map((p) => <li key={p.id}>{p.package_id} <button type="button" className="ml-2 text-xs text-red-700" onClick={() => setPkgs((x) => x.filter((y) => y.id !== p.id))}>remove</button></li>)}</ul>
        </div>
      )}
    </ConfirmDialog>
  );
}
