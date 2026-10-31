'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { api, del, post, type Paginated } from '@/lib/api';
import { useApi, useMe, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDate, fmtDateTime, fmtQty, humanize } from '@/lib/format';
import type { InvoiceLine, PackageListItem, Receipt, TimelineEvent, Verification } from '@/lib/types';
import { Alert, Button, Card, DL, ErrorState, LinkButton, Loading, PageHeader, Table, Td } from '@/components/ui';
import { AvailabilityBadge, StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog, Modal } from '@/components/Dialog';
import { Timeline } from '@/components/Timeline';
import { Attachments } from '@/components/Attachments';
import { useToast } from '@/components/Toast';
import { LineDialog, PackagesDialog, VerifyDialog } from '@/components/receiving/LineDialogs';
import { ReceiptForm, initialReceipt } from '@/components/receiving/ReceiptForm';
import { TextField, SelectField } from '@/components/forms';

/** Receipt transitions: server name → URL action, label, styling, and whether a reason is mandatory. */
const TRANSITIONS: Record<string, { slug: string; label: string; variant?: 'primary' | 'danger' | 'success'; reason?: 'required' | 'optional'; help?: string }> = {
  register_at_gate: { slug: 'register', label: 'Register at gate', help: 'Confirms the truck is on site.' },
  submit_for_unloading: { slug: 'submit-unloading', label: 'Send for unloading', help: 'Invoice lines are locked after this.' },
  start_unloading: { slug: 'start-unloading', label: 'Start unloading' },
  mark_verification_pending: { slug: 'verification-pending', label: 'Submit verification' },
  flag_exception: { slug: 'flag-exception', label: 'Flag exception', variant: 'danger', reason: 'required' },
  mark_unloaded: { slug: 'mark-unloaded', label: 'Mark unloaded', variant: 'success', help: 'All accepted quantities must be packaged and labelled.' },
  start_putaway: { slug: 'start-putaway', label: 'Start put-away' },
  mark_stored: { slug: 'mark-stored', label: 'Mark stored', variant: 'success' },
  close: { slug: 'close', label: 'Close receipt', reason: 'optional' },
  cancel: { slug: 'cancel', label: 'Cancel receipt', variant: 'danger', reason: 'required' },
};

const DOC_TYPES = ['INVOICE', 'DELIVERY_CHALLAN', 'WEIGHMENT_SLIP', 'QC_REPORT', 'PACKING_LIST', 'OTHER'];

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

  const [transition, setTransition] = useState<string | null>(null);
  const [lineDialog, setLineDialog] = useState<{ open: boolean; line?: InvoiceLine }>({ open: false });
  const [verifyLine, setVerifyLine] = useState<InvoiceLine | null>(null);
  const [packLine, setPackLine] = useState<InvoiceLine | null>(null);
  const [deleteLine, setDeleteLine] = useState<InvoiceLine | null>(null);
  const [acceptV, setAcceptV] = useState<Verification | null>(null);
  const [editing, setEditing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [created, setCreated] = useState<PackageListItem[] | null>(null);

  if (receipt.error) return <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} />;
  if (!receipt.data || !role) return <Loading />;
  const r = receipt.data;
  const vByLine = new Map((verifications.data?.results ?? []).map((v) => [v.invoice_line, v]));
  const linesEditable = can.editLines(role) && ['DRAFT', 'GATE_REGISTERED'].includes(r.status);
  const verifiable = can.unload(role) && ['UNLOADING_IN_PROGRESS', 'EXCEPTION'].includes(r.status);
  const packageable = can.unload(role) && ['UNLOADING_IN_PROGRESS', 'EXCEPTION', 'VERIFICATION_PENDING'].includes(r.status);
  const wd = r.weight_discrepancy as null | { difference: string; difference_percent: string; tolerance_percent: string; exceeds_tolerance: boolean; net_weight: string; declared_line_weight: string };
  const t = transition ? TRANSITIONS[transition] : null;
  const pkgs = packages.data?.results ?? [];
  const unlabelled = pkgs.filter((p) => p.label_print_count === 0);

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{r.receipt_number}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} label={r.status_display} /> {r.supplier_detail?.name} · invoice {r.invoice_number}</span>}
        actions={
          <>
            {r.status === 'DRAFT' && can.createReceipt(role) && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
            {can.correctWeights(role) && !['DRAFT', 'CLOSED', 'CANCELLED'].includes(r.status) && <Button variant="secondary" onClick={() => setCorrecting(true)}>Correct weights</Button>}
            {r.allowed_transitions.filter((n) => TRANSITIONS[n]).map((n) => (
              <Button key={n} variant={TRANSITIONS[n].variant ?? 'primary'} onClick={() => setTransition(n)}>{TRANSITIONS[n].label}</Button>
            ))}
          </>
        }
      />

      <div className="space-y-4">
        {r.duplicate_warning.length > 0 && (
          <Alert tone="warn" title="Duplicate invoice warning">Other receipts exist for this supplier invoice: <span className="font-mono">{r.duplicate_warning.join(', ')}</span></Alert>
        )}
        {wd?.exceeds_tolerance && (
          <Alert tone="warn" title="Weight discrepancy">
            Net weight {fmtQty(wd.net_weight, r.weight_unit_symbol)} vs invoice lines {fmtQty(wd.declared_line_weight, r.weight_unit_symbol)}: difference {fmtQty(wd.difference)} ({wd.difference_percent}%), tolerance {wd.tolerance_percent}%.
          </Alert>
        )}

        <Card title="Gate details">
          <DL items={[
            ['Supplier', r.supplier_detail?.name], ['Invoice', `${r.invoice_number} · ${fmtDate(r.invoice_date)}`],
            ['Truck', <span key="v" className="font-mono">{r.vehicle_number}</span>], ['Driver', r.driver_name || '—'],
            ['Arrived', fmtDateTime(r.arrival_datetime)], ['PO / challan', [r.purchase_order_number, r.delivery_challan_number].filter(Boolean).join(' / ') || '—'],
            ['Gross / tare', `${fmtQty(r.gross_weight)} / ${fmtQty(r.tare_weight)} ${r.weight_unit_symbol ?? ''}`],
            ['Net weight', fmtQty(r.net_weight, r.weight_unit_symbol)], ['Weighing', `${humanize(r.weighing_method)}${r.weighbridge_reference ? ` · ${r.weighbridge_reference}` : ''}`],
            ['Created by', r.created_by_name], ['Unloading', r.unloading_started_at ? `${fmtDateTime(r.unloading_started_at)} → ${fmtDateTime(r.unloading_completed_at)}` : '—'],
            ['Stored', fmtDateTime(r.stored_at)],
          ]} />
          {r.gate_notes && <p className="mt-3 text-sm text-slate-600">Notes: {r.gate_notes}</p>}
        </Card>

        <Card title="Invoice lines & verification" actions={linesEditable && <Button size="sm" onClick={() => setLineDialog({ open: true })}>Add line</Button>}>
          {r.invoice_lines.length === 0 ? (
            <Alert tone="warn">No invoice lines yet. Add every line from the supplier invoice before sending the truck for unloading.</Alert>
          ) : (
            <Table head={['#', 'Material', 'Lot', 'Invoice qty', 'Received', 'Accepted', 'Short / excess', 'Verification', 'Packaged', '']}>
              {r.invoice_lines.map((line) => {
                const v = vByLine.get(line.id);
                const remaining = v ? Number(v.accepted_quantity) - Number(v.packaged_quantity) : 0;
                const okForPackages = v && ['VERIFIED', 'EXCEPTION_ACCEPTED'].includes(v.verification_status ?? '') && remaining > 0;
                return (
                  <tr key={line.id} className="align-top">
                    <Td>{line.line_number}</Td>
                    <Td>
                      <div className="font-medium">{line.material_name || line.material_name_declared}</div>
                      {!line.material && <div className="text-xs text-amber-700">Not mapped to master</div>}
                    </Td>
                    <Td className="font-mono">{line.batch_number || '—'}</Td>
                    <Td>{fmtQty(line.declared_quantity, line.declared_unit_symbol)}</Td>
                    <Td>{v ? fmtQty(v.received_quantity, v.received_unit_symbol) : '—'}</Td>
                    <Td>{v ? fmtQty(v.accepted_quantity, v.received_unit_symbol) : '—'}</Td>
                    <Td>
                      {v && Number(v.short_quantity) > 0 && <span className="text-red-700">−{fmtQty(v.short_quantity)}</span>}
                      {v && Number(v.excess_quantity) > 0 && <span className="text-amber-700">+{fmtQty(v.excess_quantity)}</span>}
                      {v && Number(v.damaged_quantity) > 0 && <div className="text-xs text-red-700">damaged {fmtQty(v.damaged_quantity)}</div>}
                      {(!v || (Number(v.short_quantity) === 0 && Number(v.excess_quantity) === 0)) && '—'}
                    </Td>
                    <Td>
                      {v ? <StatusBadge status={v.verification_status} /> : <span className="text-xs text-slate-500">Not verified</span>}
                      {v && v.discrepancy_status !== 'NONE' && <div className="mt-1 text-xs text-slate-600">{humanize(v.discrepancy_status)}</div>}
                    </Td>
                    <Td>{line.package_count} pkg{v && <div className="text-xs text-slate-500">{fmtQty(v.packaged_quantity)} of {fmtQty(v.accepted_quantity)}</div>}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {linesEditable && <Button size="sm" variant="secondary" onClick={() => setLineDialog({ open: true, line })}>Edit</Button>}
                        {linesEditable && <Button size="sm" variant="ghost" onClick={() => setDeleteLine(line)}>Delete</Button>}
                        {verifiable && <Button size="sm" variant={v ? 'secondary' : 'primary'} onClick={() => setVerifyLine(line)}>{v ? 'Re-verify' : 'Verify'}</Button>}
                        {v?.verification_status === 'DISCREPANT' && can.acceptDiscrepancy(role) && <Button size="sm" variant="danger" onClick={() => setAcceptV(v)}>Accept discrepancy</Button>}
                        {packageable && okForPackages && <Button size="sm" onClick={() => setPackLine(line)}>Create packages</Button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
          {(verifications.data?.results ?? []).filter((v) => v.discrepancy_notes || v.exception_reason).map((v) => (
            <p key={v.id} className="mt-2 text-xs text-slate-600">
              <span className="font-medium">{v.invoice_line_display}:</span> {v.discrepancy_notes}
              {v.exception_reason && <> · accepted by {v.exception_authorized_by_name}: {v.exception_reason}</>}
            </p>
          ))}
        </Card>

        <Card
          title={`Packages (${pkgs.length})`}
          actions={pkgs.length > 0 && (
            <>
              {unlabelled.length > 0 && <LinkButton size="sm" variant="primary" href={`/labels?ids=${unlabelled.map((p) => p.id).join(',')}`}>Print {unlabelled.length} new label(s)</LinkButton>}
              <LinkButton size="sm" href={`/labels?ids=${pkgs.map((p) => p.id).join(',')}`}>Labels for all</LinkButton>
            </>
          )}
        >
          {pkgs.length === 0 ? <p className="text-sm text-slate-500">Packages are created after each line is verified.</p> : (
            <Table head={['Package', 'Lot', 'Quantity', 'Status', 'QC', 'Location', 'Label', 'Availability']}>
              {pkgs.map((p) => (
                <tr key={p.id}>
                  <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.id}`}>{p.package_id}</Link></Td>
                  <Td className="font-mono">{p.batch_number}</Td>
                  <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
                  <Td><StatusBadge status={p.status} label={p.status_display} /></Td>
                  <Td><StatusBadge status={p.qc_status} label={p.qc_status_display} /></Td>
                  <Td>{p.location_code ?? '—'}{p.location_is_quarantine && <span className="ml-1 text-xs text-amber-700">(quarantine)</span>}</Td>
                  <Td>{p.label_print_count ? `printed ×${p.label_print_count}` : <span className="text-amber-700">not printed</span>}</Td>
                  <Td><AvailabilityBadge available={p.is_available} onHold={p.is_on_hold} recalled={p.is_recalled} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Documents">
          <Attachments
            docs={r.documents}
            uploadPath={`receiving/goods-receipts/${r.id}/documents`}
            types={DOC_TYPES}
            canUpload={can.uploadReceiptDocs(role) && !['CLOSED', 'CANCELLED'].includes(r.status)}
            onUploaded={refresh}
          />
        </Card>

        <Card title="History">
          {timeline.data ? <Timeline events={timeline.data} /> : <Loading />}
        </Card>
      </div>

      <ConfirmDialog
        open={!!t}
        onClose={() => setTransition(null)}
        title={t?.label}
        description={t?.help ?? `Move receipt ${r.receipt_number} to the next stage.`}
        confirmLabel={t?.label}
        variant={t?.variant}
        reason={t?.reason}
        onConfirm={async (reason) => {
          await post(`receiving/goods-receipts/${r.id}/${t!.slug}`, { reason });
          toast(`${t!.label}: done.`);
          refresh();
        }}
      />
      <LineDialog open={lineDialog.open} line={lineDialog.line} receiptId={r.id} onClose={() => setLineDialog({ open: false })} onSaved={() => { toast('Invoice line saved.'); refresh(); }} />
      <VerifyDialog open={!!verifyLine} line={verifyLine} onClose={() => setVerifyLine(null)}
        onSaved={(v) => { toast(v.verification_status === 'VERIFIED' ? 'Line verified.' : 'Discrepancy recorded.', v.verification_status === 'VERIFIED' ? 'good' : 'info'); refresh(); }} />
      <PackagesDialog open={!!packLine} line={packLine} verification={packLine ? vByLine.get(packLine.id) : undefined} onClose={() => setPackLine(null)}
        onCreated={(p) => { setCreated(p); refresh(); }} />
      <ConfirmDialog open={!!deleteLine} onClose={() => setDeleteLine(null)} title={`Delete line ${deleteLine?.line_number}?`} variant="danger" confirmLabel="Delete"
        description="The line is removed from this receipt. This is recorded in the audit trail."
        onConfirm={async () => { await del(`receiving/invoice-lines/${deleteLine!.id}`); refresh(); }} />
      <ConfirmDialog open={!!acceptV} onClose={() => setAcceptV(null)} title="Accept discrepancy" variant="danger" confirmLabel="Accept" reason="required"
        description={<>Authorise packaging of <strong>{acceptV?.invoice_line_display}</strong> despite the recorded discrepancy. You cannot accept a discrepancy you verified yourself.</>}
        onConfirm={async (reason) => { await post(`receiving/verifications/${acceptV!.id}/accept-discrepancy`, { reason }); toast('Discrepancy accepted.'); refresh(); }} />

      <Modal open={!!created} onClose={() => setCreated(null)} title="Packages created">
        <p className="text-sm text-slate-700">{created?.length} package(s) created. Print their labels and attach one to each package before put-away.</p>
        <ul className="mt-3 max-h-48 overflow-y-auto font-mono text-sm">{created?.map((p) => <li key={p.id}>{p.package_id} — {fmtQty(p.current_quantity, p.unit_symbol)}</li>)}</ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreated(null)}>Later</Button>
          <LinkButton variant="primary" href={`/labels?ids=${created?.map((p) => p.id).join(',')}`}>Print labels</LinkButton>
        </div>
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit draft receipt" wide>
        <ReceiptForm initial={initialReceipt(r)} submitLabel="Save changes" onSubmit={async (data, acknowledge) => {
          await api(`receiving/goods-receipts/${r.id}`, { method: 'PATCH', body: data, query: acknowledge ? { acknowledge_duplicate: 'true' } : undefined });
          setEditing(false);
          toast('Receipt updated.');
          refresh();
        }} />
      </Modal>
      <WeightCorrection open={correcting} onClose={() => setCorrecting(false)} receipt={r} onDone={() => { toast('Weights corrected; the change is audited.'); refresh(); }} />
    </>
  );
}

function WeightCorrection({ open, onClose, receipt, onDone }: { open: boolean; onClose: () => void; receipt: Receipt; onDone: () => void }) {
  const [gross, setGross] = useState(receipt.gross_weight ?? '');
  const [tare, setTare] = useState(receipt.tare_weight ?? '');
  const [ref, setRef] = useState(receipt.weighbridge_reference ?? '');
  const [method, setMethod] = useState<string>(receipt.weighing_method ?? 'WEIGHBRIDGE');
  const invalid = gross !== '' && tare !== '' && Number(tare) > Number(gross);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Correct weights"
      description="The original values are kept in the audit trail with your reason."
      reason="required"
      confirmLabel="Save correction"
      onConfirm={async (reason) => {
        if (invalid) throw new Error('Tare cannot exceed gross weight.');
        await post(`receiving/goods-receipts/${receipt.id}/correct-weights`, {
          gross_weight: gross || null, tare_weight: tare || null, weighbridge_reference: ref, weighing_method: method, reason,
        });
        onDone();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField label={`Gross (${receipt.weight_unit_symbol ?? ''})`} type="number" step="any" min="0" value={gross} onChange={(e) => setGross(e.target.value)} />
        <TextField label={`Tare (${receipt.weight_unit_symbol ?? ''})`} type="number" step="any" min="0" value={tare} onChange={(e) => setTare(e.target.value)} error={invalid ? 'Tare exceeds gross.' : undefined} />
        <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={['WEIGHBRIDGE', 'PLATFORM_SCALE', 'VENDOR_DECLARED', 'OTHER'].map((m) => ({ value: m, label: humanize(m) }))} />
        <TextField label="Weighbridge reference" value={ref} onChange={(e) => setRef(e.target.value)} />
      </div>
    </ConfirmDialog>
  );
}
