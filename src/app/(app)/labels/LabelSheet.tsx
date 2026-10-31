'use client';

import { useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, bffUrl, post } from '@/lib/api';
import { code128Bars } from '@/lib/code128';
import { fmtDate, fmtQty } from '@/lib/format';
import { useRefresh } from '@/lib/hooks';
import type { LabelData, Package } from '@/lib/types';
import { ActionError, Alert, Button, Card, ErrorState, Loading, PageHeader } from '@/components/ui';
import { TextArea, TextField } from '@/components/forms';
import { Modal } from '@/components/Dialog';
import { useToast } from '@/components/Toast';

/**
 * Label printing workflow. Labels are 100 × 60 mm, one per page, for thermal label printers
 * (set the printer's paper size to 100 × 60 mm and margins to none). After printing, the user
 * confirms the labels came out; only then is each print / reprint recorded against the package.
 * `kind=release` prints the green release tag (only for released, unblocked packages).
 */
export function LabelSheet() {
  const params = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean).slice(0, 200);
  const release = params.get('kind') === 'release';
  const toast = useToast();
  const refresh = useRefresh();
  const [printer, setPrinter] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const labels = useQueries({ queries: ids.map((id) => ({ queryKey: [`inventory/packages/${id}/label`, {}], queryFn: () => api<LabelData>(`inventory/packages/${id}/label`) })) });
  const details = useQueries({ queries: ids.map((id) => ({ queryKey: [`inventory/packages/${id}`, {}], queryFn: () => api<Package>(`inventory/packages/${id}`) })) });

  useEffect(() => {
    const after = () => setConfirming(true);
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);

  if (!ids.length) return <Alert tone="info">No packages selected. Open labels from a receipt or package page.</Alert>;
  const failed = [...labels, ...details].find((q) => q.error);
  if (failed) return <ErrorState error={failed.error} />;
  if (labels.some((q) => !q.data) || details.some((q) => !q.data)) return <Loading label="Preparing labels…" />;

  const pkgs = details.map((q) => q.data!);
  const reprints = release ? [] : pkgs.filter((p) => p.label_print_count > 0);
  const blocked = release ? pkgs.filter((p) => !p.allowed_actions.includes('print_release_tag')) : pkgs.filter((p) => !p.allowed_actions.some((a) => a === 'print_label' || a === 'reprint_label'));
  const needReason = reprints.length > 0 || release;

  const record = async () => {
    if (needReason && !reason.trim() && reprints.length > 0) { setError(new Error('A reason is required for reprints.')); return; }
    setBusy(true);
    setError(null);
    const failures: string[] = [];
    for (const p of pkgs) {
      if (blocked.includes(p)) continue;
      try {
        await post(`inventory/packages/${p.id}/${release ? 'print-release-tag' : 'print-label'}`, {
          printer_reference: printer, reason: p.label_print_count > 0 || release ? reason : '',
        });
      } catch (e) {
        failures.push(`${p.package_id}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    refresh();
    if (failures.length) setError(new Error(`Not recorded — ${failures.join('; ')}`));
    else {
      setConfirming(false);
      toast(`${pkgs.length - blocked.length} ${release ? 'release tag' : 'label'} print(s) recorded.`);
    }
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={release ? 'Print release tags' : 'Print package labels'}
          subtitle={`${pkgs.length} label(s) · 100 × 60 mm sticker · one label per page${release ? ' · load green label stock' : ''}`}
          actions={<Button onClick={() => window.print()} disabled={blocked.length === pkgs.length}>Print</Button>}
        />
        <Card className="mb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Printer" placeholder="e.g. ZEBRA-DOCK-1" value={printer} onChange={(e) => setPrinter(e.target.value)} hint="Recorded with the print event." />
            {needReason && <TextArea label={release ? 'Note' : `Reprint reason (${reprints.length} reprint${reprints.length > 1 ? 's' : ''})`} required={!release} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </div>
          {reprints.length > 0 && <Alert tone="warn">Reprints keep the same package ID. Who reprinted and why is recorded.</Alert>}
          {blocked.length > 0 && <Alert tone="bad" title="Cannot print for:">{blocked.map((p) => `${p.package_id} (${p.blocking_reasons.join(', ') || p.status_display})`).join('; ')}</Alert>}
          <p className="mt-3 text-xs text-slate-500">After printing you will be asked to confirm, and only then is the print recorded.{!release && ' The first recorded print releases a package for put-away.'}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => setConfirming(true)}>Already printed? Record it</Button>
        </Card>
      </div>

      <div className="label-sheet flex flex-wrap gap-4">
        {labels.map((q, i) => blocked.includes(pkgs[i]) ? null : <Label key={ids[i]} data={q.data!} id={ids[i]} release={release} />)}
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Did the labels print correctly?">
        <p className="text-sm text-slate-700">Confirm only if every label printed legibly and is ready to attach.</p>
        <div className="mt-3"><ActionError error={error} /></div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>No, not yet</Button>
          <Button onClick={record} loading={busy}>Yes, record print</Button>
        </div>
      </Modal>

      <style>{`
        @media print {
          @page { size: 100mm 60mm; margin: 0; }
          .label-sheet { display: block !important; }
          .label { margin: 0 !important; box-shadow: none !important; border: none !important; break-after: page; page-break-after: always; }
          main { padding: 0 !important; max-width: none !important; }
          .lg\\:pl-60 { padding-left: 0 !important; }
        }
      `}</style>
    </>
  );
}

function Barcode({ value }: { value: string }) {
  const bars = code128Bars(value);
  return (
    <svg viewBox={`0 0 ${bars.width} 30`} preserveAspectRatio="none" className="h-[9mm] w-full" role="img" aria-label={`Barcode ${value}`}>
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={30} fill="black" />)}
    </svg>
  );
}

function Label({ data, id, release }: { data: LabelData; id: string; release: boolean }) {
  return (
    <div
      className={`label flex h-[60mm] w-[100mm] flex-col overflow-hidden rounded border bg-white p-[3mm] text-black shadow-sm ${release ? 'border-[1.2mm] border-black' : 'border-slate-300'}`}
    >
      {/* Black on white only: label printers print one colour. Use green label stock for release tags. */}
      {release && <div className="mb-[1mm] bg-black py-[0.8mm] text-center text-[4mm] font-black tracking-widest text-white" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>✔ QC RELEASED</div>}
      <div className="flex flex-1 gap-[3mm]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bffUrl(`inventory/packages/${id}/qr`)} alt={`QR ${data.package_id}`} className="h-[30mm] w-[30mm] flex-none" />
        <div className="min-w-0 flex-1 text-[2.8mm] leading-tight">
          <div className="font-mono text-[4.2mm] font-bold">{data.package_id}</div>
          {data.package_type && <div className="text-[2.6mm] font-semibold uppercase tracking-wide">{data.package_type}</div>}
          <div className="mt-[1mm] truncate font-semibold">{data.material_code}</div>
          <div className="line-clamp-2">{data.material_name}</div>
          <div className="mt-[1mm]">Lot <b className="font-mono">{data.batch_number || '—'}</b></div>
          <div>Packed <b>{fmtQty(data.quantity, data.unit)}</b>{data.grade && ` · ${data.grade}`}</div>
          <div>Exp {fmtDate(data.expiry_date)}{data.retest_date && ` · Retest ${fmtDate(data.retest_date)}`}</div>
        </div>
      </div>
      <div className="mt-[1mm] truncate text-[2.4mm]">{data.supplier} · {data.receipt_number}/L{data.line_number} · rcvd {fmtDate(data.received_date)}{data.parent_package_id && ` · from ${data.parent_package_id}`}</div>
      <Barcode value={data.barcode_value} />
    </div>
  );
}
