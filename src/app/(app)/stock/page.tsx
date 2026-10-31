'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useApi, useMaterials } from '@/lib/hooks';
import { fmtDate, fmtQty, humanize } from '@/lib/format';
import type { LineSuggestions, PackageListItem } from '@/lib/types';
import { ActionError, Alert, Button, Card, ErrorState, Loading, PageHeader, Stat, StatGrid, Table, Td } from '@/components/ui';
import { SelectField, TextField } from '@/components/forms';
import { StatusBadge } from '@/components/StatusBadge';

type StockDashboard = {
  packages_in_warehouse: number; by_status: Record<string, number>; by_qc_status: Record<string, number>;
  available_packages: number; awaiting_label: number; awaiting_putaway: number; in_quarantine_location: number;
  pending_qc: number; on_hold: number; rejected: number; recalled: number; near_expiry_or_retest: number;
  near_expiry_days: number; low_stock: LowStock[]; receipts_awaiting_putaway: number;
};
type LowStock = { material_id: number; material_code: string; material_name: string; available: string; minimum: string; unit: string };
type Balance = Record<string, string | number | null> & { packages: number; quantity: string; released_quantity: string; reserved_quantity: string; available_quantity: string; unit__symbol: string };
type Ageing = { buckets: string[]; rows: { material_id: number; material_code: string; material_name: string; unit: string; quantities: Record<string, string> }[] };

const GROUPS = [
  { value: 'material', label: 'Material' }, { value: 'material,lot', label: 'Material + lot' },
  { value: 'material,location', label: 'Material + location' }, { value: 'location', label: 'Location' },
  { value: 'material,qc_status', label: 'Material + QC status' }, { value: 'supplier', label: 'Supplier' },
];

/** Warehouse stock dashboard (spec §4C). */
export default function StockPage() {
  const [group, setGroup] = useState('material');
  const [material, setMaterial] = useState('');
  const dash = useApi<StockDashboard>('inventory/stock/dashboard');
  const balances = useApi<{ group_by: string[]; results: Balance[] }>('inventory/stock/balances', { group_by: group, material });
  const ageing = useApi<Ageing>('inventory/stock/ageing', { material });
  const expiry = useApi<PackageListItem[]>('inventory/stock/expiry', { material });
  const materials = useMaterials();
  const d = dash.data;

  return (
    <>
      <PageHeader title="Warehouse stock" subtitle="Balances, QC split, ageing and expiry — computed from the ledger." />
      {dash.error ? <ErrorState error={dash.error} /> : !d ? <Loading /> : (
        <div className="space-y-4">
          <StatGrid>
            <Stat label="Packages in stock" value={d.packages_in_warehouse} href="/packages" />
            <Stat label="Available for issue" value={d.available_packages} tone="good" />
            <Stat label="Pending QC" value={d.pending_qc} hint={`${d.in_quarantine_location} in quarantine locations`} tone={d.pending_qc ? 'warn' : 'neutral'} />
            <Stat label="Rejected / on hold" value={`${d.rejected} / ${d.on_hold}`} tone={d.rejected || d.on_hold ? 'bad' : 'neutral'} />
            <Stat label="Awaiting put-away" value={d.awaiting_putaway} hint={`${d.awaiting_label} awaiting label`} href="/unloading" />
            <Stat label={`Expiry / retest ≤ ${d.near_expiry_days} d`} value={d.near_expiry_or_retest} tone={d.near_expiry_or_retest ? 'warn' : 'neutral'} />
          </StatGrid>
          {d.recalled > 0 && <Alert tone="bad" title={`${d.recalled} recalled package(s) in stock`}>Recalled material is blocked from issue. See <Link className="underline" href="/holds">Holds & recalls</Link>.</Alert>}
          {d.low_stock.length > 0 && (
            <Alert tone="warn" title="Low stock">
              {d.low_stock.map((l) => <div key={l.material_id}>{l.material_code} {l.material_name}: {fmtQty(l.available, l.unit)} available, minimum {fmtQty(l.minimum, l.unit)}</div>)}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(d.by_qc_status).map(([k, v]) => <span key={k} className="flex items-center gap-1"><StatusBadge status={k} /> {v}</span>)}
          </div>
        </div>
      )}

      <Card title="Stock balances" className="mt-6" actions={
        <div className="flex flex-wrap gap-2">
          <SelectField label="Group by" value={group} onChange={(e) => setGroup(e.target.value || 'material')} options={GROUPS} placeholder="Material" />
          <SelectField label="Material" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="All materials" options={materials.items.map((m) => ({ value: m.id, label: m.code }))} />
        </div>
      }>
        {balances.error ? <ErrorState error={balances.error} /> : !balances.data ? <Loading /> : (
          <Table head={[...balances.data.group_by.map(humanize), 'Packages', 'On hand', 'Released', 'Reserved', 'Available']} empty={!balances.data.results.length}>
            {balances.data.results.map((r, i) => (
              <tr key={i}>
                {balances.data!.group_by.map((g) => <Td key={g}>{groupCell(g, r)}</Td>)}
                <Td>{r.packages}</Td>
                <Td>{fmtQty(r.quantity, r.unit__symbol)}</Td>
                <Td>{fmtQty(r.released_quantity, r.unit__symbol)}</Td>
                <Td>{fmtQty(r.reserved_quantity, r.unit__symbol)}</Td>
                <Td className="font-semibold">{fmtQty(r.available_quantity, r.unit__symbol)}</Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-xs text-slate-500">Quantities in different units are never added together. Issued quantities: see the <Link className="underline" href="/reports/issue-register">issue register</Link>.</p>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Stock ageing (on hand by days since receipt)">
          {!ageing.data ? <Loading /> : (
            <Table head={['Material', ...ageing.data.buckets.map((b) => `${b} d`)]} empty={!ageing.data.rows.length}>
              {ageing.data.rows.map((r) => (
                <tr key={`${r.material_id}-${r.unit}`}>
                  <Td>{r.material_code}</Td>
                  {ageing.data!.buckets.map((b) => <Td key={b} className={Number(r.quantities[b]) > 0 && b === ageing.data!.buckets.at(-1) ? 'font-semibold text-amber-700' : ''}>{Number(r.quantities[b]) ? fmtQty(r.quantities[b], r.unit) : '—'}</Td>)}
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Near expiry / retest">
          {!expiry.data ? <Loading /> : expiry.data.length === 0 ? <p className="text-sm text-slate-500">Nothing due soon.</p> : (
            <Table head={['Package', 'Material', 'Lot', 'Qty', 'Expiry', 'Retest', 'QC']}>
              {expiry.data.map((p) => (
                <tr key={p.id}>
                  <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.id}`}>{p.package_id}</Link></Td>
                  <Td>{p.material_code}</Td>
                  <Td className="font-mono">{p.batch_number}</Td>
                  <Td>{fmtQty(p.current_quantity, p.unit_symbol)}</Td>
                  <Td>{fmtDate(p.expiry_date)}</Td>
                  <Td>{fmtDate(p.retest_date)}</Td>
                  <Td><StatusBadge status={p.qc_status} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <FifoSuggestion />
    </>
  );
}

function groupCell(g: string, r: Balance) {
  if (g === 'material') return <span>{r.material__code}<span className="ml-1 text-xs text-slate-500">{r.material__name}</span></span>;
  if (g === 'lot') return <span className="font-mono">{r.batch_number || '—'}</span>;
  if (g === 'location') return r.current_location__code ? `${r.current_location__warehouse__code}/${r.current_location__code}` : '—';
  if (g === 'qc_status') return <StatusBadge status={String(r.qc_status)} />;
  if (g === 'status') return <StatusBadge status={String(r.status)} />;
  if (g === 'supplier') return r.supplier__name;
  return String(r[g] ?? '—');
}

function FifoSuggestion() {
  const materials = useMaterials();
  const [material, setMaterial] = useState('');
  const [qty, setQty] = useState('');
  const [result, setResult] = useState<LineSuggestions | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!material || !(Number(qty) > 0)) { setError(new Error('Choose a material and a quantity above zero.')); return; }
    setBusy(true);
    try {
      setResult(await api<LineSuggestions>('inventory/stock/fifo-suggestion', { query: { material_id: material, quantity: qty } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const unit = materials.items.find((m) => String(m.id) === material)?.default_unit_symbol;
  return (
    <Card title="FIFO / FEFO pick suggestion" className="mt-6">
      <form onSubmit={run} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
        <SelectField label="Material" value={material} onChange={(e) => setMaterial(e.target.value)} options={materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))} />
        <TextField label={`Quantity${unit ? ` (${unit})` : ''}`} type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Button type="submit" loading={busy}>Suggest packages</Button>
      </form>
      <div className="mt-3"><ActionError error={error} /></div>
      {result && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate-600">Policy: <strong>{result.policy}</strong>{result.policy === 'FEFO' ? ' (earliest expiry / retest first)' : ' (oldest receipt first)'}. Reserved stock is excluded.</p>
          {Number(result.shortfall) > 0 && <Alert tone="warn">Short by {fmtQty(result.shortfall, result.unit)} — not enough available stock.</Alert>}
          <Table head={['#', 'Package', 'Lot', 'Take', 'Received', 'Expiry', 'Retest']} empty={!result.suggestions.length}>
            {result.suggestions.map((s, i) => (
              <tr key={s.package}>
                <Td>{i + 1}</Td>
                <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${s.package}`}>{s.package_id}</Link></Td>
                <Td className="font-mono">{s.batch_number}</Td>
                <Td>{fmtQty(s.quantity, s.unit)}</Td>
                <Td>{fmtDate(s.received_at)}</Td>
                <Td>{fmtDate(s.expiry_date)}</Td>
                <Td>{fmtDate(s.retest_date)}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Card>
  );
}
