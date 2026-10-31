'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, type Paginated } from '@/lib/api';
import { useApi, useRefresh } from '@/lib/hooks';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { Package, PackageListItem, ReceiptListItem } from '@/lib/types';
import { ActionError, Card, ErrorState, LinkButton, Loading, PageHeader, Table, Td, Alert } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ScanBox } from '@/components/Scanner';
import { MoveDialog } from '@/components/inventory/PackageActions';
import { useToast } from '@/components/Toast';

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

  const byStatus = (s: string) => (queue.data?.results ?? []).filter((r) => r.status === s);

  return (
    <>
      <PageHeader title="Unloading & put-away" subtitle="Verify trucks, label packages and put them away." />
      <div className="space-y-4">
        <Card title="Scan to put away">
          <ScanBox onScan={onScan} label="Scan a package label" autoFocus />
          <div className="mt-2"><ActionError error={scanError} /></div>
        </Card>

        <Card title="Unloading queue">
          {queue.error ? <ErrorState error={queue.error} /> : !queue.data ? <Loading /> : queue.data.results.length === 0 ? <p className="text-sm text-slate-500">No trucks waiting.</p> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {QUEUE.flatMap((s) => byStatus(s)).map((r) => (
                <Link key={r.id} href={`/receipts/${r.id}`} className="block rounded-lg border border-slate-200 p-4 transition hover:border-brand-500 hover:shadow">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{r.vehicle_number}</span>
                    <StatusBadge status={r.status} label={r.status_display} />
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{r.supplier_name}</div>
                  <div className="text-xs text-slate-500">{r.receipt_number} · invoice {r.invoice_number} · {r.line_count} line(s)</div>
                  <div className="text-xs text-slate-500">Arrived {fmtDateTime(r.arrival_datetime)}</div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Labels to print (${unlabelled.data?.count ?? '…'})`}
          actions={!!unlabelled.data?.results.length && <LinkButton size="sm" variant="primary" href={`/labels?ids=${unlabelled.data.results.map((p) => p.id).join(',')}`}>Print all</LinkButton>}>
          {!unlabelled.data ? <Loading /> : unlabelled.data.results.length === 0 ? <p className="text-sm text-slate-500">All packages are labelled.</p> : (
            <PackageTable rows={unlabelled.data.results} />
          )}
        </Card>

        <Card title={`Put-away tasks (${putaway.data?.count ?? '…'})`}>
          {!putaway.data ? <Loading /> : putaway.data.results.length === 0 ? <p className="text-sm text-slate-500">Nothing awaiting put-away.</p> : (
            <>
              {putaway.data.results.some((p) => p.requires_quarantine) && <Alert tone="info">Packages pending QC must go to a quarantine location.</Alert>}
              <div className="mt-2"><PackageTable rows={putaway.data.results} /></div>
            </>
          )}
        </Card>
      </div>
      {scanned && (
        <MoveDialog kind="putaway" pkg={scanned} open onClose={() => setScanned(null)}
          onDone={(p) => { toast(`${p.package_id} stored at ${p.location_display}.`); refresh(); }} />
      )}
    </>
  );
}

function PackageTable({ rows }: { rows: PackageListItem[] }) {
  return (
    <Table head={['Package', 'Material', 'Lot', 'Quantity', 'QC', 'Receipt']}>
      {rows.map((p) => (
        <tr key={p.id}>
          <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.id}`}>{p.package_id}</Link></Td>
          <Td>{p.material_code}</Td>
          <Td className="font-mono">{p.batch_number || '—'}</Td>
          <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
          <Td><StatusBadge status={p.qc_status} label={p.qc_status_display} />{p.requires_quarantine && <span className="ml-1 text-xs text-amber-700">→ quarantine</span>}</Td>
          <Td className="font-mono text-xs">{p.receipt_number}</Td>
        </tr>
      ))}
    </Table>
  );
}
