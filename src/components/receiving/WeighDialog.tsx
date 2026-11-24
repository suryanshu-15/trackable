'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import { usePolicy, useUnits } from '@/lib/hooks';
import { fmtQty } from '@/lib/format';
import type { Receipt } from '@/lib/types';
import { Modal } from '../Dialog';
import { ActionError, Button } from '../ui';
import { SelectField, TextField } from '../forms';

type WeighReceipt = Pick<Receipt, 'id' | 'gross_weight' | 'weight_unit' | 'weight_unit_symbol' | 'invoice_weight_kg'>;
const KG_PER: Record<string, number> = { KG: 1, T: 1000 };
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Weighbridge reading. The loaded weighing also starts unloading, since that is always the next thing.
 * The loaded truck must weigh more than the invoice; for the empty truck, a net weight that does not
 * match the invoice asks for a second, explicit confirmation before it is saved.
 */
export function WeighDialog({ stage, receipt, onClose, onDone }: { stage: 'LOADED' | 'EMPTY' | null; receipt: WeighReceipt; onClose: () => void; onDone: (msg: string) => void }) {
  const units = useUnits();
  const policy = usePolicy().data;
  const weightUnits = units.items.filter((u) => u.unit_type === 'WEIGHT');
  const kg = weightUnits.find((u) => u.code === 'KG');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState('');
  const [slip, setSlip] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);
  useEffect(() => { if (stage) { setWeight(''); setUnit(''); setSlip(''); setError(null); setWarn(false); } }, [stage]);

  const loaded = stage === 'LOADED';
  const unitId = unit || String(stage === 'EMPTY' && receipt.weight_unit ? receipt.weight_unit : kg?.id ?? '');
  const chosen = weightUnits.find((u) => String(u.id) === unitId);
  const symbol = chosen?.symbol ?? '';
  const perKg = chosen ? KG_PER[chosen.code] ?? null : null;
  const entered = Number(weight) > 0 ? Number(weight) : null;
  const invoiceKg = receipt.invoice_weight_kg != null ? Number(receipt.invoice_weight_kg) : null;
  const invoice = invoiceKg != null && perKg ? invoiceKg / perKg : null; // in the chosen unit

  // Loaded truck: always heavier than the material on it.
  const tooLight = loaded && invoice != null && entered != null && entered <= invoice;

  // Empty truck: net = loaded − empty, compared with the invoice (all in the chosen unit).
  const grossUnit = weightUnits.find((u) => u.id === receipt.weight_unit);
  const grossPerKg = grossUnit ? KG_PER[grossUnit.code] ?? null : null;
  const gross = receipt.gross_weight != null && grossPerKg && perKg ? Number(receipt.gross_weight) * grossPerKg / perKg : null;
  const heavierThanLoaded = !loaded && gross != null && entered != null && entered > gross;
  const net = !loaded && gross != null && entered != null ? round(gross - entered) : null;
  const tolerance = Number(policy?.['receipt.weight_tolerance_percent'] ?? '0.5');
  const diff = net != null && invoice != null ? round(net - invoice) : null;
  const pct = diff != null && invoice ? Math.abs(diff) / invoice * 100 : null;
  const mismatch = pct != null && pct > tolerance;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await post(`receiving/goods-receipts/${receipt.id}/weigh`, { stage, weight, unit: Number(unitId), weighbridge_reference: slip });
      if (loaded) await post(`receiving/goods-receipts/${receipt.id}/start-unloading`, {});
      setWarn(false);
      onClose();
      onDone(loaded ? 'Loaded weight saved — unloading started.' : mismatch ? 'Empty weight saved — the manager is told about the weight difference.' : 'Empty weight saved — weight matches the invoice.');
    } catch (err) {
      setWarn(false);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    if (entered == null) { setError(new Error('Enter the weight shown on the weighbridge.')); return; }
    if (tooLight) { setError(new Error(`The loaded truck must weigh more than the material on the invoice (${fmtQty(invoice, symbol)}). Check the reading and the unit.`)); return; }
    if (heavierThanLoaded) { setError(new Error(`The empty truck cannot weigh more than the loaded truck (${fmtQty(gross, symbol)}).`)); return; }
    if (mismatch) { setWarn(true); return; } // ask before saving a weight that does not match
    void save();
  };

  return (
    <>
      <Modal open={!!stage} onClose={onClose} title={loaded ? 'Loaded truck weight' : 'Empty truck weight'}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-slate-600">
            {loaded ? 'Weight of the truck with the material on it.' : `Weight after unloading. Loaded weight was ${fmtQty(receipt.gross_weight, receipt.weight_unit_symbol)}.`}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <TextField label="Weight" required type="number" inputMode="decimal" min="0" step="any" autoFocus value={weight} onChange={(e) => setWeight(e.target.value)} className="col-span-2"
              error={tooLight ? `Must be more than the invoice weight (${fmtQty(invoice, symbol)}).` : heavierThanLoaded ? 'More than the loaded truck.' : undefined}
              hint={loaded && invoice != null ? `Material on the invoice: ${fmtQty(invoice, symbol)} — the loaded truck weighs more.` : undefined} />
            <SelectField label="Unit" value={unitId} onChange={(e) => setUnit(e.target.value)} options={weightUnits.map((u) => ({ value: u.id, label: u.symbol }))} />
            <TextField label="Weighbridge slip no." value={slip} onChange={(e) => setSlip(e.target.value)} className="col-span-3" />
          </div>
          {net != null && invoice != null && !heavierThanLoaded && (
            <p className={mismatch ? 'rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800' : 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900'}>
              Material by weighbridge {fmtQty(net, symbol)} · invoice {fmtQty(invoice, symbol)} ·{' '}
              {mismatch ? `does not match (${pct!.toFixed(2)}%, allowed ${tolerance}%)` : 'matches'}
            </p>
          )}
          <ActionError error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy && !warn}>{loaded ? 'Save and start unloading' : 'Save empty weight'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={warn} onClose={() => setWarn(false)} title="⚠ Weight does not match the invoice">
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-900">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt>Loaded truck</dt><dd className="text-right font-semibold">{fmtQty(gross, symbol)}</dd>
              <dt>Empty truck (entered)</dt><dd className="text-right font-semibold">{fmtQty(entered, symbol)}</dd>
              <dt>Material by weighbridge</dt><dd className="text-right font-semibold">{fmtQty(net, symbol)}</dd>
              <dt>Material on invoice</dt><dd className="text-right font-semibold">{fmtQty(invoice, symbol)}</dd>
            </dl>
            <p className="mt-3 text-base font-bold">
              {diff != null && diff < 0 ? 'Short' : 'Extra'} by {fmtQty(Math.abs(diff ?? 0), symbol)} ({pct?.toFixed(2)}%) — allowed {tolerance}%.
            </p>
          </div>
          <p className="text-sm text-slate-700">
            Check the empty truck reading and the unit (kg or t) on the weighbridge slip. If the reading is right, save it —
            the manager will be told about the difference.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setWarn(false)} disabled={busy}>Check the reading again</Button>
            <Button variant="danger" loading={busy} onClick={() => void save()}>Yes, the reading is correct — save</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
