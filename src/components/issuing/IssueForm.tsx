'use client';

import { useMemo, useState } from 'react';
import { ApiError, api, newIdempotencyKey, post } from '@/lib/api';
import { useApi, usePolicy } from '@/lib/hooks';
import { fmtDate, fmtQty } from '@/lib/format';
import type { LineSuggestions, MaterialIssue, MaterialRequest, Package } from '@/lib/types';
import { ActionError, Alert, Button, Table, Td } from '../ui';
import { TextArea, TextField, inputCls } from '../forms';
import { ScanBox } from '../Scanner';

type Pick = { package: string; package_id: string; quantity: string; batch: string; unit: string; available: string };
type Violation = { package_id: string; older_stock_not_used: string[] };

/**
 * Pick and issue against a request. The server re-checks everything inside one transaction:
 * QC / hold / expiry blocks, free quantity, request balance and FIFO / FEFO order.
 */
export function IssueForm({ request, onIssued }: { request: MaterialRequest; onIssued: (issue: MaterialIssue) => void }) {
  const suggestions = useApi<LineSuggestions[]>(`inventory/requests/${request.id}/suggestions`);
  // Business rule (default): bags are issued whole, never partly.
  const wholeOnly = usePolicy().data?.['issue.whole_packages_only'] !== false;
  const [picks, setPicks] = useState<Pick[]>([]);
  const [receivedBy, setReceivedBy] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [violations, setViolations] = useState<{ list: Violation[]; policy: unknown } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const body = {
    material_request: request.id, received_by_name: receivedBy, reference, notes,
    override_reason: violations ? overrideReason : '',
    lines: picks.map((p) => ({ package: p.package, quantity: p.quantity })),
  };
  // Same payload → same key, so a retried submit after a timeout cannot issue twice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = useMemo(() => newIdempotencyKey(), [JSON.stringify(body)]);

  const useSuggested = () => {
    setViolations(null);
    setPicks((suggestions.data ?? []).flatMap((l) => l.suggestions.map((s) => ({
      package: s.package, package_id: s.package_id, quantity: s.quantity, batch: s.batch_number, unit: s.unit, available: s.quantity,
    }))));
  };

  const addScanned = async (code: string) => {
    setError(null);
    try {
      const p = await api<Package>('inventory/packages/resolve', { query: { code } });
      if (!p.is_available) throw new Error(`${p.package_id} cannot be issued: ${p.blocking_reasons.join('; ') || p.status_display}.`);
      const line = request.lines.find((l) => l.material === p.material);
      if (!line) throw new Error(`${p.package_id} (${p.material_code}) is not on this request.`);
      const want = wholeOnly ? Number(p.current_quantity) : Math.min(Number(line.remaining_quantity), Number(p.current_quantity));
      if (wholeOnly && want > Number(line.remaining_quantity)) {
        throw new Error(`${p.package_id} holds ${p.current_quantity} ${p.unit_symbol}, more than the ${line.remaining_quantity} still requested. Bags are issued whole.`);
      }
      setViolations(null);
      setPicks((x) => (x.some((y) => y.package === p.id) ? x : [...x, {
        package: p.id, package_id: p.package_id, quantity: String(want), batch: p.batch_number, unit: p.unit_symbol, available: p.current_quantity,
      }]));
    } catch (e) {
      setError(e);
    }
  };

  const submit = async () => {
    if (!picks.length) { setError(new Error('Add at least one package.')); return; }
    if (picks.some((p) => !(Number(p.quantity) > 0))) { setError(new Error('Every quantity must be above zero.')); return; }
    if (violations && !overrideReason.trim()) { setError(new Error('Give a reason for issuing out of FIFO / FEFO order.')); return; }
    setBusy(true);
    setError(null);
    try {
      const issue = await post<MaterialIssue>('inventory/issues', body, { idempotencyKey: key });
      setPicks([]);
      setViolations(null);
      setOverrideReason('');
      onIssued(issue);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'fifo_override_required') {
        setViolations({ list: (e.details.violations as Violation[]) ?? [], policy: e.details.policy });
      } else {
        setError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {suggestions.data && (
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Suggested pick list</p>
            <Button size="sm" variant="secondary" onClick={useSuggested}>Use suggested picks</Button>
          </div>
          {suggestions.data.map((l) => (
            <div key={l.line} className="mb-2 text-sm">
              <p className="text-slate-700"><strong>{l.material_code}</strong>: {fmtQty(l.remaining, l.unit)} remaining · {l.policy}
                {Number(l.shortfall) > 0 && <span className="ml-2 text-red-700">short {fmtQty(l.shortfall, l.unit)}</span>}</p>
              <ol className="ml-5 list-decimal text-xs text-slate-600">
                {l.suggestions.map((s) => <li key={s.package}><span className="font-mono">{s.package_id}</span> · {fmtQty(s.quantity, s.unit)} · lot {s.batch_number} · rcvd {fmtDate(s.received_at)}{s.expiry_date && ` · exp ${fmtDate(s.expiry_date)}`}</li>)}
              </ol>
            </div>
          ))}
        </div>
      )}

      <ScanBox onScan={addScanned} label="Scan package to pick" autoFocus={false} />

      {picks.length > 0 && (
        <Table head={['Package', 'Lot', 'Available', 'Issue quantity', '']}>
          {picks.map((p, i) => (
            <tr key={p.package}>
              <Td className="font-mono">{p.package_id}</Td>
              <Td className="font-mono">{p.batch}</Td>
              <Td>{fmtQty(p.available, p.unit)}</Td>
              <Td>
                <div className="flex items-center gap-1">
                  <input aria-label={`Quantity from ${p.package_id}`} type="number" step="any" min="0" className={`${inputCls} w-28`} value={p.quantity} readOnly={wholeOnly} title={wholeOnly ? 'Whole bags only' : undefined}
                    onChange={(e) => { setViolations(null); setPicks((x) => x.map((y, j) => (j === i ? { ...y, quantity: e.target.value } : y))); }} />
                  <span className="text-xs text-slate-500">{p.unit}</span>
                </div>
              </Td>
              <Td><Button size="sm" variant="ghost" onClick={() => { setViolations(null); setPicks((x) => x.filter((_, j) => j !== i)); }}>Remove</Button></Td>
            </tr>
          ))}
        </Table>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField label="Received by (name)" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
        <TextField label="Reference / gate pass" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {violations && (
        <Alert tone="warn" title="Out of FIFO / FEFO order">
          <ul className="list-inside list-disc">
            {violations.list.map((v) => <li key={v.package_id}><span className="font-mono">{v.package_id}</span> skips older stock: <span className="font-mono">{v.older_stock_not_used.join(', ')}</span></li>)}
          </ul>
          <p className="mt-2">Pick the older stock, or (manager / admin) record why this order is justified. Overrides are flagged and notified.</p>
          <div className="mt-2"><TextArea label="Override reason" required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2} /></div>
        </Alert>
      )}
      <ActionError error={error} />
      <Button size="lg" onClick={submit} loading={busy} disabled={!picks.length} variant={violations ? 'danger' : 'primary'}>
        {violations ? 'Issue with override' : `Issue ${picks.length} package(s)`}
      </Button>
    </div>
  );
}
