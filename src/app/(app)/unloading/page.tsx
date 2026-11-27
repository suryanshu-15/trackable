'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, post, type Paginated } from '@/lib/api';
import { useApi, useMe, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { matchesTruck, plateKey } from '@/lib/trucks';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { Package, PackageListItem, ReceiptListItem } from '@/lib/types';
import { ActionError, Button, Card, ErrorState, LinkButton, Loading, PageHeader, Table, Td, Alert } from '@/components/ui';
import { TextField } from '@/components/forms';
import { Icons } from '@/components/icons';
import { StatusBadge } from '@/components/StatusBadge';
import { ScanBox } from '@/components/Scanner';
import { MoveDialog } from '@/components/inventory/PackageActions';
import { useToast } from '@/components/Toast';
import { WeighDialog } from '@/components/receiving/WeighDialog';
import { BulkPutawayDialog } from '@/components/inventory/BulkPutawayDialog';
import { WeightCorrectionDialog } from '@/components/receiving/WeightCorrectionDialog';

/** What receiving does next with a truck in the queue. */
function nextFor(r: ReceiptListItem): string {
  switch (r.status) {
    case 'AWAITING_UNLOADING': return r.gross_weight == null ? 'Weigh the loaded truck' : 'Start unloading';
    case 'UNLOADING_IN_PROGRESS': return 'Check materials and make bags';
    case 'EXCEPTION': return 'Waiting for a manager decision';
    case 'VERIFICATION_PENDING': return r.tare_weight == null ? 'Weigh the empty truck' : 'Finish unloading';
    case 'UNLOADED': case 'PUTAWAY_IN_PROGRESS': return 'Put the bags away';
    default: return '';
  }
}

const QUEUE = ['AWAITING_UNLOADING', 'UNLOADING_IN_PROGRESS', 'EXCEPTION', 'VERIFICATION_PENDING', 'UNLOADED', 'PUTAWAY_IN_PROGRESS'];

/** Receiving floor (spec §4B): unloading queue, labels to print and put-away tasks. Tablet-friendly. */
export default function UnloadingPage() {
  const toast = useToast();
  const refresh = useRefresh();
  const queue = useApi<Paginated<ReceiptListItem>>('receiving/goods-receipts', { status: QUEUE, page_size: 100, ordering: 'arrival_datetime' });
  const unlabelled = useApi<Paginated<PackageListItem>>('inventory/packages', { status: 'CREATED', page_size: 200, ordering: 'created_at' });
  const putaway = useApi<Paginated<PackageListItem>>('inventory/packages', { status: 'AWAITING_PUTAWAY', page_size: 200, ordering: 'created_at' });
  const [scanned, setScanned] = useState<Package | null>(null);
  const [scanError, setScanError] = useState<unknown>(null);
  const router = useRouter();
  const me = useMe();
  const [truck, setTruck] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<unknown>(null);
  const [weighing, setWeighing] = useState<ReceiptListItem | null>(null);
  const [editingWeight, setEditingWeight] = useState<ReceiptListItem | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const inQueue = QUEUE.flatMap((s) => (queue.data?.results ?? []).filter((r) => r.status === s));
  const found = inQueue.filter((r) => matchesTruck(r, truck));
  // Not in the queue? Say where that truck is (e.g. still a draft at the gate).
  const elsewhere = useApi<Paginated<ReceiptListItem>>(
    truck.trim().length >= 4 && queue.data && found.length === 0 ? 'receiving/goods-receipts' : null, { search: plateKey(truck), page_size: 5 });

  const startUnloading = async (r: ReceiptListItem) => {
    setStarting(r.id);
    setStartError(null);
    try {
      await post(`receiving/goods-receipts/${r.id}/start-unloading`, {});
      toast(`Unloading started for ${r.vehicle_number}.`);
      refresh();
      router.push(`/receipts/${r.id}`);
    } catch (e) {
      setStartError(e);
      setStarting(null);
    }
  };

  const onScan = async (code: string) => {
    setScanError(null);
    try {
      const pkg = await api<Package>('inventory/packages/resolve', { query: { code } });
      if (pkg.allowed_actions.includes('putaway')) setScanned(pkg);
      else setScanError(new Error(`${pkg.package_id} is ${pkg.status_display.toLowerCase()} — ${pkg.status === 'CREATED' ? 'print its label first' : 'nothing to put away'}.`));
    } catch (e) {
      setScanError(e);
    }
  };

  return (
    <>
      <PageHeader title="Receiving" subtitle="Weigh the truck, unload, check, make bags and put them away." />
      <div className="space-y-4">
        <Card title={`Trucks at receiving (${inQueue.length})`}>
          <TextField
            label="Find truck"
            placeholder="Vehicle no., gate entry or invoice — e.g. OD02AB4521"
            value={truck}
            autoFocus
            autoComplete="off"
            onChange={(e) => { setTruck(e.target.value); setStartError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && found.length === 1) { e.preventDefault(); router.push(`/receipts/${found[0].id}`); } }}
            hint={truck && found.length === 1 ? 'Press Enter to open this truck.' : 'Type or scan the plate; spaces and dashes are ignored.'}
            className="mb-4 max-w-xl"
          />
          <ActionError error={startError} />
          {queue.error ? <ErrorState error={queue.error} /> : !queue.data ? <Loading /> : inQueue.length === 0 ? <p className="text-sm text-slate-500">No trucks waiting.</p> : found.length === 0 ? (
            <Alert tone="warn" title={`No truck matching “${truck}” in the unloading queue`}>
              {elsewhere.data?.results.length ? (
                <ul className="mt-1 space-y-1">
                  {elsewhere.data.results.map((r) => (
                    <li key={r.id}>
                      <Link href={`/receipts/${r.id}`} className="font-mono font-semibold underline">{r.vehicle_number}</Link> · {r.gate_entry_number ?? r.receipt_number} — <StatusBadge status={r.status} />
                      {['DRAFT', 'GATE_REGISTERED'].includes(r.status) && ' (the gate must finish the entry and send it to receiving first)'}
                    </li>
                  ))}
                </ul>
              ) : truck.trim().length >= 4 ? 'No receipt has this number. Check the plate, or ask the gate to register the truck.' : 'Keep typing…'}
            </Alert>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {found.map((r) => (
                <div key={r.id} className={`rounded-lg border p-4 transition hover:shadow ${truck && found.length === 1 ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/receipts/${r.id}`} className="flex items-center gap-2 font-mono text-lg font-bold text-slate-900 hover:text-brand-700">
                      <Icons.truck size={20} className="text-slate-400" />{r.vehicle_number}
                    </Link>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{r.supplier_name}</div>
                  <div className="text-xs text-slate-500">{r.gate_entry_number ?? r.receipt_number} · gate in {fmtDateTime(r.arrival_datetime)}</div>
                  <ul className="mt-1 text-xs text-slate-600">{r.materials.map((m, i) => <li key={i}>{m.description} — {fmtQty(m.quantity, m.unit)}</li>)}</ul>
                  {r.gross_weight != null && (
                    <p className="mt-1 text-xs text-slate-600">Loaded {fmtQty(r.gross_weight, r.weight_unit_symbol)}{r.tare_weight != null && <> · empty {fmtQty(r.tare_weight, r.weight_unit_symbol)}</>}</p>
                  )}
                  {nextFor(r) && <p className="mt-2 text-sm font-medium text-brand-700">Next: {nextFor(r)}</p>}
                  <div className="mt-3 flex gap-2">
                    {r.status === 'AWAITING_UNLOADING' && me.data && can.unload(me.data.role) && (r.gross_weight == null
                      ? <Button size="sm" onClick={() => setWeighing(r)}>Weigh loaded truck</Button>
                      : <Button size="sm" loading={starting === r.id} disabled={!!starting} onClick={() => startUnloading(r)}>Start unloading</Button>)}
                    {r.gross_weight != null && me.data && can.correctWeights(me.data.role) && (
                      <Button size="sm" variant="secondary" onClick={() => setEditingWeight(r)}>Edit weight</Button>
                    )}
                    <LinkButton size="sm" href={`/receipts/${r.id}`}>Open</LinkButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Put a bag away">
          <ScanBox onScan={onScan} label="Scan the bag label" autoFocus={false} />
          <div className="mt-2"><ActionError error={scanError} /></div>
        </Card>

        <Card title={`Labels to print (${unlabelled.data?.count ?? '…'})`}
          actions={!!unlabelled.data?.results.length && <LinkButton size="sm" variant="primary" href={`/labels?ids=${unlabelled.data.results.map((p) => p.id).join(',')}`}>Print all</LinkButton>}>
          {!unlabelled.data ? <Loading /> : unlabelled.data.results.length === 0 ? <p className="text-sm text-slate-500">All packages are labelled.</p> : (
            <PackageTable rows={unlabelled.data.results} />
          )}
        </Card>

        <Card title={`Bags waiting for put-away (${putaway.data?.count ?? '…'})`}
          actions={me.data && can.unload(me.data.role) && !!putaway.data?.results.length && (
            <Button disabled={!picked.length} onClick={() => setBulk(true)}>Put away selected ({picked.length})</Button>
          )}>
          {!putaway.data ? <Loading /> : putaway.data.results.length === 0 ? <p className="text-sm text-slate-500">Nothing awaiting put-away.</p> : (
            <>
              <p className="mb-2 text-xs text-slate-500">Tick the bags going to the same place (or tick the box in the header for all), then <strong>Put away selected</strong>. Bags waiting for the lab can only go to quarantine.</p>
              <PackageTable rows={putaway.data.results} picked={picked} onPick={setPicked} />
            </>
          )}
        </Card>
      </div>
      {editingWeight && (
        <WeightCorrectionDialog open receipt={editingWeight} onClose={() => setEditingWeight(null)}
          onDone={() => { toast(`Weight updated for ${editingWeight.vehicle_number}; the change is recorded.`); refresh(); }} />
      )}
      <BulkPutawayDialog open={bulk} bags={(putaway.data?.results ?? []).filter((p) => picked.includes(p.id))} onClose={() => setBulk(false)}
        onDone={(stored) => { toast(`${stored.length} bag(s) put away at ${stored[0]?.location_code ?? 'the location'}.`); setPicked([]); refresh(); }} />
      {weighing && (
        <WeighDialog stage="LOADED" receipt={{ id: weighing.id, gross_weight: null, weight_unit: null, weight_unit_symbol: '', invoice_weight_kg: weighing.invoice_weight_kg }}
          onClose={() => setWeighing(null)}
          onDone={(msg) => { toast(msg); refresh(); router.push(`/receipts/${weighing.id}`); }} />
      )}
      {scanned && (
        <MoveDialog kind="putaway" pkg={scanned} open onClose={() => setScanned(null)}
          onDone={(p) => { toast(`${p.package_id} stored at ${p.location_display}.`); refresh(); }} />
      )}
    </>
  );
}

function PackageTable({ rows, picked, onPick }: { rows: PackageListItem[]; picked?: string[]; onPick?: (ids: string[]) => void }) {
  const selectable = !!onPick && !!picked;
  const all = selectable && rows.length > 0 && rows.every((p) => picked!.includes(p.id));
  const toggle = (id: string) => onPick?.(picked!.includes(id) ? picked!.filter((x) => x !== id) : [...picked!, id]);
  return (
    <Table head={[
      ...(selectable ? [<input key="all" type="checkbox" className="h-5 w-5" aria-label="Select all bags" checked={all} onChange={() => onPick!(all ? [] : rows.map((p) => p.id))} />] : []),
      'Bag', 'Material', 'Lot', 'Quantity', 'Lab', 'Gate entry',
    ]}>
      {rows.map((p) => (
        <tr key={p.id} className={selectable && picked!.includes(p.id) ? 'bg-brand-50' : ''}>
          {selectable && <Td><input type="checkbox" className="h-5 w-5" aria-label={`Select ${p.package_id}`} checked={picked!.includes(p.id)} onChange={() => toggle(p.id)} /></Td>}
          <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.id}`}>{p.package_id}</Link></Td>
          <Td>{p.material_name ?? p.material_code}</Td>
          <Td className="font-mono">{p.batch_number || '—'}</Td>
          <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
          <Td><StatusBadge status={p.qc_status} />{p.requires_quarantine && <span className="ml-1 text-xs text-amber-700">→ quarantine</span>}</Td>
          <Td className="font-mono text-xs">{p.gate_entry_number ?? p.receipt_number}</Td>
        </tr>
      ))}
    </Table>
  );
}
