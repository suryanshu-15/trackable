'use client';

/**
 * One truck, step by step: gate entry → weigh loaded → check materials → bags & labels →
 * weigh empty → put away → truck out. The "Next step" card always shows the one thing to do.
 */
import Link from 'next/link';
import { use, useState, type ReactNode } from 'react';
import { api, post, type Paginated } from '@/lib/api';
import { useApi, useMe, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDate, fmtDateTime, fmtQty, humanize, nowLocalInput } from '@/lib/format';
import type { InvoiceLine, PackageListItem, Receipt, TimelineEvent, Verification } from '@/lib/types';
import { Alert, Button, Card, DL, ErrorState, LinkButton, Loading, PageHeader, Table, Td, cx } from '@/components/ui';
import { AvailabilityBadge, StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog, Modal } from '@/components/Dialog';
import { Timeline } from '@/components/Timeline';
import { Attachments } from '@/components/Attachments';
import { useToast } from '@/components/Toast';
import { PackagesDialog, VerifyDialog } from '@/components/receiving/LineDialogs';
import { GateEntryForm, initialGateEntry } from '@/components/receiving/GateEntryForm';
import { WeighDialog } from '@/components/receiving/WeighDialog';
import { WeightCorrectionDialog } from '@/components/receiving/WeightCorrectionDialog';
import { BulkPutawayDialog } from '@/components/inventory/BulkPutawayDialog';
import { TextField } from '@/components/forms';

const DOC_TYPES = ['INVOICE', 'DELIVERY_CHALLAN', 'WEIGHMENT_SLIP', 'QC_REPORT', 'PACKING_LIST', 'OTHER'];
const STEPS = ['Gate entry', 'Weigh loaded', 'Check materials', 'Bags & labels', 'Weigh empty', 'Put away', 'Truck out'];
type WeightCheck = { difference: string; difference_percent: string; tolerance_percent: string; exceeds_tolerance: boolean; net_weight: string; declared_line_weight: string };

type Step = { index: number; title: string; text: ReactNode; action?: ReactNode; tone?: 'info' | 'warn' | 'good' };

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const role = me.data?.role;
  const toast = useToast();
  const refresh = useRefresh();
  const receipt = useApi<Receipt>(`receiving/goods-receipts/${id}`);
  const verifications = useApi<Paginated<Verification>>('receiving/verifications', { invoice_line__receipt: id, page_size: 200 });
  const packages = useApi<Paginated<PackageListItem>>('inventory/packages', { receipt: id, page_size: 200, ordering: 'package_id' });
  const timeline = useApi<TimelineEvent[]>(`receiving/goods-receipts/${id}/timeline`);

  const [weighing, setWeighing] = useState<'LOADED' | 'EMPTY' | null>(null);
  const [verifyLine, setVerifyLine] = useState<InvoiceLine | null>(null);
  const [packLine, setPackLine] = useState<InvoiceLine | null>(null);
  const [acceptV, setAcceptV] = useState<Verification | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | 'cancel' | 'problem' | 'close' | 'finish' | 'out'>(null);
  const [correcting, setCorrecting] = useState(false);
  const [puttingAway, setPuttingAway] = useState(false);
  const [created, setCreated] = useState<PackageListItem[] | null>(null);
  const [outAt, setOutAt] = useState('');

  if (receipt.error) return <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} />;
  if (!receipt.data || !role) return <Loading />;
  const r = receipt.data;
  const vByLine = new Map((verifications.data?.results ?? []).map((v) => [v.invoice_line, v]));
  const pkgs = packages.data?.results ?? [];
  const unlabelled = pkgs.filter((p) => p.label_print_count === 0);
  const awaiting = pkgs.filter((p) => p.status === 'AWAITING_PUTAWAY');
  const wd = r.weight_discrepancy as WeightCheck | null;
  const unloading = ['UNLOADING_IN_PROGRESS', 'EXCEPTION', 'VERIFICATION_PENDING'].includes(r.status);
  const canUnload = can.unload(role);

  const lineState = (line: InvoiceLine) => {
    const v = vByLine.get(line.id);
    const ok = v && ['VERIFIED', 'EXCEPTION_ACCEPTED'].includes(v.verification_status ?? '');
    const remaining = v ? Number(v.accepted_quantity ?? 0) - Number(v.packaged_quantity ?? 0) : 0;
    return { v, ok: !!ok, needsBags: !!ok && remaining > 0, mismatch: v?.verification_status === 'DISCREPANT' };
  };
  const states = r.invoice_lines.map(lineState);
  const unchecked = states.filter((s) => !s.v).length;
  const mismatches = states.filter((s) => s.mismatch).length;
  const needBags = states.filter((s) => s.needsBags).length;

  const step = nextStep();

  function nextStep(): Step {
    const waitFor = (who: string) => <span className="text-slate-600">Waiting for {who}.</span>;
    switch (r.status) {
      case 'DRAFT':
        return { index: 0, title: 'Finish the gate entry', text: 'This entry is saved as a draft. Check it and send it to receiving.',
          action: can.createReceipt(role!) ? <Button size="lg" onClick={() => setEditing(true)}>Open and send to receiving</Button> : waitFor('the gate') };
      case 'GATE_REGISTERED':
        return { index: 0, title: 'Send to receiving', text: 'The truck is registered at the gate.',
          action: can.createReceipt(role!) ? <Button size="lg" onClick={() => go('submit-unloading', 'Sent to receiving.')}>Send to receiving</Button> : waitFor('the gate') };
      case 'AWAITING_UNLOADING':
        if (r.gross_weight == null) {
          return { index: 1, title: 'Weigh the loaded truck', text: 'Drive the truck onto the weighbridge with the material still on it.',
            action: canUnload ? <Button size="lg" onClick={() => setWeighing('LOADED')}>Enter loaded weight</Button> : waitFor('receiving') };
        }
        return { index: 2, title: 'Start unloading', text: `Loaded weight ${fmtQty(r.gross_weight, r.weight_unit_symbol)} is recorded.`,
          action: canUnload ? <Button size="lg" onClick={() => go('start-unloading', 'Unloading started.')}>Start unloading</Button> : waitFor('receiving') };
      case 'UNLOADING_IN_PROGRESS':
      case 'EXCEPTION':
      case 'VERIFICATION_PENDING':
        if (mismatches) {
          return { index: 2, tone: 'warn', title: 'A manager must decide on a mismatch',
            text: `${mismatches} material(s) do not match the invoice. Check again if it was a typing mistake, otherwise a manager accepts or rejects it below.` };
        }
        if (unchecked) {
          return { index: 2, title: 'Check each material', text: `Count the bags and press Check on each material below (${unchecked} left).` };
        }
        if (needBags) {
          return { index: 3, title: 'Make bags and print labels', text: `Press Make bags on each material below (${needBags} left), then stick a label on every bag.` };
        }
        if (r.tare_weight == null) {
          return { index: 4, title: 'Weigh the empty truck', text: 'All material is off the truck. Weigh the empty truck to check the total weight.',
            action: canUnload ? <Button size="lg" onClick={() => setWeighing('EMPTY')}>Enter empty weight</Button> : waitFor('receiving') };
        }
        return { index: 4, title: 'Finish unloading', text: 'Everything is checked, bagged and weighed.',
          action: canUnload ? <Button size="lg" variant="success" onClick={() => setConfirm('finish')}>Finish unloading</Button> : waitFor('receiving') };
      case 'UNLOADED':
      case 'PUTAWAY_IN_PROGRESS':
        return { index: 5, title: 'Put the bags away', text: `${awaiting.length} bag(s) to put away. Choose one location for several bags at once; bags waiting for the lab go to quarantine.`,
          action: canUnload ? (awaiting.length
            ? <Button size="lg" onClick={() => setPuttingAway(true)}>Put away bags ({awaiting.length})</Button>
            : <span className="text-slate-600">Print the labels first — bags can be put away once labelled.</span>) : waitFor('receiving') };
      case 'STORED':
      case 'CLOSED':
        if (!r.gate_out_at) {
          return { index: 6, title: 'Record truck out', text: 'The material is stored. Record the time the truck left the gate.',
            action: can.createReceipt(role!) ? <Button size="lg" onClick={() => { setOutAt(nowLocalInput()); setConfirm('out'); }}>Truck out</Button> : waitFor('the gate') };
        }
        return { index: 7, tone: 'good', title: 'Done', text: `All material is stored and the truck left at ${fmtDateTime(r.gate_out_at)}.` };
      case 'CANCELLED':
        return { index: -1, tone: 'warn', title: 'Cancelled', text: 'This gate entry was cancelled.',
          action: !r.gate_out_at && can.createReceipt(role!) ? <Button onClick={() => { setOutAt(nowLocalInput()); setConfirm('out'); }}>Truck out</Button> : undefined };
      default:
        return { index: 0, title: humanize(r.status), text: '' };
    }
  }

  async function go(slug: string, message: string, reason = '') {
    await post(`receiving/goods-receipts/${r.id}/${slug}`, { reason });
    toast(message);
    refresh();
  }

  const truckOutAllowed = !r.gate_out_at && can.createReceipt(role) && (r.tare_weight != null || r.status === 'CANCELLED') && step.index !== 6;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{r.gate_entry_number ?? r.receipt_number}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /> {r.supplier_detail?.name} · <span className="font-mono">{r.vehicle_number}</span></span>}
        actions={
          <>
            {truckOutAllowed && <Button variant="secondary" onClick={() => { setOutAt(nowLocalInput()); setConfirm('out'); }}>Truck out</Button>}
            {r.allowed_transitions.includes('flag_exception') && <Button variant="secondary" onClick={() => setConfirm('problem')}>Report a problem</Button>}
            {r.allowed_transitions.includes('close') && <Button variant="secondary" onClick={() => setConfirm('close')}>Close</Button>}
            {r.allowed_transitions.includes('cancel') && <Button variant="danger" onClick={() => setConfirm('cancel')}>Cancel entry</Button>}
          </>
        }
      />

      <Stepper current={step.index} />

      <div className={cx('mt-4 rounded-2xl border p-5 shadow-sm',
        step.tone === 'warn' ? 'border-amber-300 bg-amber-50' : step.tone === 'good' ? 'border-emerald-300 bg-emerald-50' : 'border-brand-200 bg-brand-50')}>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{step.index >= 0 && step.index < STEPS.length ? `Step ${step.index + 1} of ${STEPS.length}` : 'Status'}</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{step.title}</h2>
        {step.text && <p className="mt-1 text-slate-700">{step.text}</p>}
        {step.action && <div className="mt-4">{step.action}</div>}
      </div>

      <div className="mt-4 space-y-4">
        {r.duplicate_warning.length > 0 && (
          <Alert tone="warn" title="Same invoice entered before">Other entries exist for this supplier invoice: <span className="font-mono">{r.duplicate_warning.join(', ')}</span></Alert>
        )}

        <Card title="Materials">
          <Table head={['Material', 'Invoice qty', 'Store at', 'Received', 'Check', 'Bags', '']}>
            {r.invoice_lines.map((line, i) => {
              const { v, needsBags, mismatch } = states[i];
              return (
                <tr key={line.id} className="align-top">
                  <Td className="whitespace-normal">
                    <div className="font-medium">{line.material_name_declared || line.material_name}</div>
                    {line.batch_number && <div className="text-xs text-slate-500">Lot {line.batch_number}</div>}
                  </Td>
                  <Td>{fmtQty(line.declared_quantity, line.declared_unit_symbol)}</Td>
                  <Td>{line.storage_location_code ?? '—'}</Td>
                  <Td>
                    {v ? fmtQty(v.received_quantity, v.received_unit_symbol) : '—'}
                    {v && Number(v.short_quantity) > 0 && <div className="text-xs text-red-700">short {fmtQty(v.short_quantity)}</div>}
                    {v && Number(v.excess_quantity) > 0 && <div className="text-xs text-amber-700">extra {fmtQty(v.excess_quantity)}</div>}
                    {v && Number(v.damaged_quantity) > 0 && <div className="text-xs text-red-700">damaged {fmtQty(v.damaged_quantity)}</div>}
                  </Td>
                  <Td>{v ? <StatusBadge status={v.verification_status} /> : <span className="text-xs text-slate-500">Not checked</span>}</Td>
                  <Td>{line.package_count ? `${line.package_count} bag(s)` : '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {canUnload && ['UNLOADING_IN_PROGRESS', 'EXCEPTION'].includes(r.status) && (
                        <Button size="sm" variant={v ? 'secondary' : 'primary'} onClick={() => setVerifyLine(line)}>{v ? 'Check again' : 'Check'}</Button>
                      )}
                      {mismatch && can.acceptDiscrepancy(role) && v && <Button size="sm" variant="danger" onClick={() => setAcceptV(v)}>Manager decision</Button>}
                      {canUnload && unloading && needsBags && <Button size="sm" onClick={() => setPackLine(line)}>Make bags</Button>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
          {(verifications.data?.results ?? []).filter((v) => v.discrepancy_notes || v.exception_reason).map((v) => (
            <p key={v.id} className="mt-2 text-xs text-slate-600">
              <span className="font-medium">{v.invoice_line_display}:</span> {v.discrepancy_notes}
              {v.exception_reason && <> · decided by {v.exception_authorized_by_name}: {v.exception_reason}</>}
            </p>
          ))}
          {unlabelled.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {unlabelled.length} bag label(s) not printed yet.
              <LinkButton size="sm" variant="primary" href={`/labels?ids=${unlabelled.map((p) => p.id).join(',')}`}>Print labels</LinkButton>
            </div>
          )}
        </Card>

        <Card title="Weighbridge">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Weight label="Loaded truck" value={r.gross_weight} unit={r.weight_unit_symbol} at={r.gross_weighed_at} />
            <Weight label="Empty truck" value={r.tare_weight} unit={r.weight_unit_symbol} at={r.tare_weighed_at} />
            <Weight label="Material (net)" value={r.net_weight} unit={r.weight_unit_symbol} />
            <Weight label="As per invoice" value={wd?.declared_line_weight} unit={r.weight_unit_symbol} />
          </div>
          {wd && (
            <p className={cx('mt-4 rounded-lg p-3 text-sm', wd.exceeds_tolerance ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900')}>
              {wd.exceeds_tolerance
                ? <>Weight difference of {fmtQty(wd.difference, r.weight_unit_symbol)} ({wd.difference_percent}%) — more than the allowed {wd.tolerance_percent}%. The manager has been told.</>
                : <>Weight matches the invoice (difference {wd.difference_percent}%, allowed {wd.tolerance_percent}%).</>}
            </p>
          )}
          {r.weighbridge_reference && <p className="mt-2 text-xs text-slate-500">Weighbridge slip: {r.weighbridge_reference}</p>}
          {can.correctWeights(role) && r.gross_weight != null && !['CLOSED', 'CANCELLED'].includes(r.status) && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setCorrecting(true)}>Edit weight</Button>
          )}
        </Card>

        <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-slate-700">More details — gate entry, bags, documents, history</summary>
          <div className="space-y-6 border-t border-slate-100 p-5">
            <DL items={[
              ['Gate entry no.', <span key="g" className="font-mono">{r.gate_entry_number ?? '—'}</span>],
              ['Gate in', fmtDateTime(r.arrival_datetime)], ['Gate out', r.gate_out_at ? fmtDateTime(r.gate_out_at) : 'Still inside'],
              ['Supplier', r.supplier_detail?.name], ['Invoice', `${r.invoice_number} · ${fmtDate(r.invoice_date)}`],
              ['Vehicle no.', <span key="v" className="font-mono">{r.vehicle_number}</span>], ['Transporter', r.transporter_name || '—'],
              ['LR no.', r.lr_number || '—'], ['E-way bill no.', r.eway_bill_number || '—'],
              ['Driver', [r.driver_name, r.driver_mobile].filter(Boolean).join(' · ') || '—'],
              ['DL no.', r.driver_licence_number || '—'],
              ['Entered by', r.created_by_name], ['System no.', <span key="s" className="font-mono text-xs">{r.receipt_number}</span>],
            ]} />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Bags ({pkgs.length})</h3>
              {pkgs.length === 0 ? <p className="text-sm text-slate-500">Bags are made after each material is checked.</p> : (
                <Table head={['Bag', 'Quantity', 'Status', 'Lab', 'Location', 'Label', 'Can be issued']}>
                  {pkgs.map((p) => (
                    <tr key={p.id}>
                      <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.id}`}>{p.package_id}</Link></Td>
                      <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
                      <Td><StatusBadge status={p.status} /></Td>
                      <Td><StatusBadge status={p.qc_status} /></Td>
                      <Td>{p.location_code ?? '—'}{p.location_is_quarantine && <span className="ml-1 text-xs text-amber-700">(quarantine)</span>}</Td>
                      <Td>{p.label_print_count ? 'printed' : <span className="text-amber-700">not printed</span>}</Td>
                      <Td><AvailabilityBadge available={p.is_available} onHold={p.is_on_hold} recalled={p.is_recalled} /></Td>
                    </tr>
                  ))}
                </Table>
              )}
              {pkgs.length > 0 && <div className="mt-2"><LinkButton size="sm" href={`/labels?ids=${pkgs.map((p) => p.id).join(',')}`}>Reprint labels</LinkButton></div>}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Documents</h3>
              <Attachments docs={r.documents} uploadPath={`receiving/goods-receipts/${r.id}/documents`} types={DOC_TYPES}
                canUpload={can.uploadReceiptDocs(role) && !['CLOSED', 'CANCELLED'].includes(r.status)} onUploaded={refresh} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">History</h3>
              {timeline.data ? <Timeline events={timeline.data} /> : <Loading />}
            </div>
          </div>
        </details>
      </div>

      <WeighDialog stage={weighing} receipt={r} onClose={() => setWeighing(null)} onDone={(msg) => { toast(msg); refresh(); }} />
      <VerifyDialog open={!!verifyLine} line={verifyLine} onClose={() => setVerifyLine(null)}
        onSaved={(v) => { toast(v.verification_status === 'VERIFIED' ? 'Matches the invoice.' : 'Mismatch recorded — a manager must decide.', v.verification_status === 'VERIFIED' ? 'good' : 'info'); refresh(); }} />
      <PackagesDialog open={!!packLine} line={packLine} verification={packLine ? vByLine.get(packLine.id) : undefined} onClose={() => setPackLine(null)}
        onCreated={(p) => { setCreated(p); refresh(); }} />
      <ConfirmDialog open={!!acceptV} onClose={() => setAcceptV(null)} title="Manager decision on mismatch" variant="danger" confirmLabel="Accept and continue" reason="required"
        description={<>Allow <strong>{acceptV?.invoice_line_display}</strong> to continue as checked. You cannot decide on a check you made yourself.</>}
        onConfirm={async (reason) => { await post(`receiving/verifications/${acceptV!.id}/accept-discrepancy`, { reason }); toast('Decision recorded.'); refresh(); }} />

      <ConfirmDialog open={confirm === 'finish'} onClose={() => setConfirm(null)} title="Finish unloading" variant="success" confirmLabel="Finish unloading"
        description="The bags then go to put-away."
        onConfirm={async () => {
          if (['UNLOADING_IN_PROGRESS', 'EXCEPTION'].includes(r.status)) await post(`receiving/goods-receipts/${r.id}/verification-pending`, {});
          await go('mark-unloaded', 'Unloading finished — put the bags away.');
        }} />
      <ConfirmDialog open={confirm === 'cancel'} onClose={() => setConfirm(null)} title="Cancel this gate entry?" variant="danger" confirmLabel="Cancel entry" reason="required"
        description="Use this when the truck is turned back. The entry stays in the register as cancelled."
        onConfirm={(reason) => go('cancel', 'Entry cancelled.', reason)} />
      <ConfirmDialog open={confirm === 'problem'} onClose={() => setConfirm(null)} title="Report a problem" variant="danger" confirmLabel="Report" reason="required"
        description="Stops this truck until a manager looks at it (for example: wrong material, leaking bags)."
        onConfirm={(reason) => go('flag-exception', 'Problem reported to the manager.', reason)} />
      <ConfirmDialog open={confirm === 'close'} onClose={() => setConfirm(null)} title="Close this entry" confirmLabel="Close" reason="optional"
        onConfirm={(reason) => go('close', 'Entry closed.', reason)} />
      <ConfirmDialog open={confirm === 'out'} onClose={() => setConfirm(null)} title={`Truck out — ${r.vehicle_number}`} confirmLabel="Save gate out"
        description="Record the time the truck left the gate."
        onConfirm={async () => { await post(`receiving/goods-receipts/${r.id}/gate-out`, { at: outAt || null }); toast('Truck out recorded.'); refresh(); }}>
        <TextField label="Gate out time" type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
      </ConfirmDialog>

      <Modal open={!!created} onClose={() => setCreated(null)} title="Bags made">
        <p className="text-sm text-slate-700">{created?.length} bag(s) made. Print the labels and stick one on each bag.</p>
        <ul className="mt-3 max-h-48 overflow-y-auto font-mono text-sm">{created?.map((p) => <li key={p.id}>{p.package_id} — {fmtQty(p.current_quantity, p.unit_symbol)}</li>)}</ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreated(null)}>Later</Button>
          <LinkButton variant="primary" href={`/labels?ids=${created?.map((p) => p.id).join(',')}`}>Print labels</LinkButton>
        </div>
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title={`Gate entry ${r.gate_entry_number ?? ''}`} wide>
        <GateEntryForm initial={initialGateEntry(r)} gateEntryNumber={r.gate_entry_number} onCancel={() => setEditing(false)}
          onSave={async (body, acknowledge, send) => {
            await api(`receiving/goods-receipts/${r.id}/gate-entry`, { method: 'PUT', body, query: acknowledge ? { acknowledge_duplicate: 'true' } : undefined });
            setEditing(false);
            toast(send ? 'Sent to receiving.' : 'Draft saved.');
            refresh();
          }} />
      </Modal>
      <BulkPutawayDialog open={puttingAway} bags={awaiting} onClose={() => setPuttingAway(false)}
        onDone={(stored) => { toast(`${stored.length} bag(s) put away at ${stored[0]?.location_code ?? 'the location'}.`); refresh(); }} />
      <WeightCorrectionDialog open={correcting} onClose={() => setCorrecting(false)} receipt={r} onDone={() => { toast('Weight updated; the change is recorded.'); refresh(); }} />
    </>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = current > i;
        const now = current === i;
        return (
          <li key={s} aria-current={now ? 'step' : undefined}
            className={cx('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              done ? 'bg-emerald-100 text-emerald-800' : now ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
            <span aria-hidden="true">{done ? '✓' : i + 1}</span>{s}
          </li>
        );
      })}
    </ol>
  );
}

function Weight({ label, value, unit, at }: { label: string; value?: string | null; unit?: string | null; at?: string | null }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value != null ? fmtQty(value, unit) : '—'}</p>
      {at && <p className="text-xs text-slate-500">{fmtDateTime(at)}</p>}
    </div>
  );
}
