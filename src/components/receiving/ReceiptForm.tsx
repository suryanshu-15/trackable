'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useSuppliers, useUnits } from '@/lib/hooks';
import { nowLocalInput, todayInput } from '@/lib/format';
import type { Receipt } from '@/lib/types';
import { ActionError, Alert, Button } from '../ui';
import { SelectField, TextArea, TextField, compact } from '../forms';
import { MasterSelect } from '@/components/master/MasterSelect';

export type ReceiptInput = {
  supplier: string; invoice_number: string; invoice_date: string; vehicle_number: string; driver_name: string;
  arrival_datetime: string; gross_weight: string; tare_weight: string; weight_unit: string; weighing_method: string;
  weighbridge_reference: string; purchase_order_number: string; delivery_challan_number: string; gate_notes: string;
};

const METHODS = [
  { value: 'WEIGHBRIDGE', label: 'Weighbridge' },
  { value: 'PLATFORM_SCALE', label: 'Platform scale' },
  { value: 'VENDOR_DECLARED', label: 'Vendor declared' },
  { value: 'OTHER', label: 'Other' },
];

export function initialReceipt(r?: Receipt): ReceiptInput {
  return {
    supplier: r ? String(r.supplier) : '',
    invoice_number: r?.invoice_number ?? '',
    invoice_date: r?.invoice_date ?? todayInput(),
    vehicle_number: r?.vehicle_number ?? '',
    driver_name: r?.driver_name ?? '',
    arrival_datetime: r ? r.arrival_datetime.slice(0, 16) : nowLocalInput(),
    gross_weight: r?.gross_weight ?? '',
    tare_weight: r?.tare_weight ?? '',
    weight_unit: r?.weight_unit ? String(r.weight_unit) : '',
    weighing_method: r?.weighing_method ?? 'WEIGHBRIDGE',
    weighbridge_reference: r?.weighbridge_reference ?? '',
    purchase_order_number: r?.purchase_order_number ?? '',
    delivery_challan_number: r?.delivery_challan_number ?? '',
    gate_notes: r?.gate_notes ?? '',
  };
}

/** Client-side usability checks; the API re-validates everything. */
export function validateReceipt(v: ReceiptInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.supplier) e.supplier = 'Choose the supplier.';
  if (!v.invoice_number.trim()) e.invoice_number = 'Invoice number is required.';
  if (!v.invoice_date) e.invoice_date = 'Invoice date is required.';
  if (!v.vehicle_number.trim()) e.vehicle_number = 'Truck / vehicle number is required.';
  if (!v.arrival_datetime) e.arrival_datetime = 'Arrival time is required.';
  const gross = v.gross_weight === '' ? null : Number(v.gross_weight);
  const tare = v.tare_weight === '' ? null : Number(v.tare_weight);
  if (gross !== null && !(gross >= 0)) e.gross_weight = 'Gross weight must be zero or more.';
  if (tare !== null && !(tare >= 0)) e.tare_weight = 'Tare weight must be zero or more.';
  if (gross !== null && tare !== null && tare > gross) e.tare_weight = 'Tare cannot exceed gross weight.';
  if ((gross !== null || tare !== null) && !v.weight_unit) e.weight_unit = 'Choose the weight unit.';
  return e;
}

export type SaveIntent = 'continue' | 'draft';

export function ReceiptForm({ initial, submitLabel, draftLabel, onSubmit, onCancel }: {
  initial: ReceiptInput;
  submitLabel: string;
  /** Optional second save button, e.g. "Save as draft" (finish the receipt later). */
  draftLabel?: string;
  onSubmit: (data: Record<string, unknown>, acknowledgeDuplicate: boolean, intent: SaveIntent) => Promise<void>;
  /** Leave without saving. */
  onCancel?: () => void;
}) {
  const suppliers = useSuppliers();
  const units = useUnits();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [duplicates, setDuplicates] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<SaveIntent>('continue');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  // Truck weights are entered in kg.
  const kg = units.items.find((u) => u.code === 'KG');
  useEffect(() => {
    if (kg && !v.weight_unit) setV((x) => ({ ...x, weight_unit: String(kg.id) }));
  }, [kg, v.weight_unit]);

  const set = (k: keyof ReceiptInput) => (e: { target: { value: string } }) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    setDuplicates(null);
  };

  const net = v.gross_weight !== '' && v.tare_weight !== '' ? Number(v.gross_weight) - Number(v.tare_weight) : null;

  const submit = async (e: FormEvent, acknowledge = false, chosen: SaveIntent = intent) => {
    setIntent(chosen);
    e.preventDefault();
    const local = validateReceipt(v);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...compact(v), supplier: Number(v.supplier), weight_unit: v.weight_unit ? Number(v.weight_unit) : undefined }, acknowledge, chosen);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_invoice') {
        setDuplicates((err.details.duplicate_receipts as string[]) ?? []);
      } else {
        if (err instanceof ApiError) setErrors(err.fieldErrors());
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const weightUnits = units.items.filter((u) => u.unit_type === 'WEIGHT');

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-800">Supplier & invoice</legend>
        <MasterSelect kind="supplier" label="Supplier" required value={v.supplier} onChange={(val) => set('supplier')({ target: { value: val } })} error={errors.supplier}
          options={suppliers.items.map((s) => ({ value: s.id, label: `${s.name} (${s.code})`, keywords: [s.gst_number, s.contact_person, s.phone].join(' ') }))} />
        <TextField label="Invoice number" required value={v.invoice_number} onChange={set('invoice_number')} error={errors.invoice_number} />
        <TextField label="Invoice date" type="date" required value={v.invoice_date} onChange={set('invoice_date')} error={errors.invoice_date} />
        <TextField label="Purchase order" value={v.purchase_order_number} onChange={set('purchase_order_number')} error={errors.purchase_order_number} />
        <TextField label="Delivery challan" value={v.delivery_challan_number} onChange={set('delivery_challan_number')} error={errors.delivery_challan_number} />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-800">Truck</legend>
        <TextField label="Truck / vehicle number" required value={v.vehicle_number} onChange={(e) => set('vehicle_number')({ target: { value: e.target.value.toUpperCase() } })} error={errors.vehicle_number} />
        <TextField label="Driver name" value={v.driver_name} onChange={set('driver_name')} error={errors.driver_name} />
        <TextField label="Arrival" type="datetime-local" required value={v.arrival_datetime} onChange={set('arrival_datetime')} error={errors.arrival_datetime} />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-800">Weighment</legend>
        <TextField label="Gross weight" type="number" inputMode="decimal" min="0" step="any" value={v.gross_weight} onChange={set('gross_weight')} error={errors.gross_weight} />
        <TextField label="Tare weight" type="number" inputMode="decimal" min="0" step="any" value={v.tare_weight} onChange={set('tare_weight')} error={errors.tare_weight}
          hint={net !== null && net >= 0 ? `Net: ${net}` : undefined} />
        <MasterSelect kind="unit" label="Weight unit" value={v.weight_unit} onChange={(val) => set('weight_unit')({ target: { value: val } })} error={errors.weight_unit}
          options={weightUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.symbol})` }))} />
        <SelectField label="Weighing method" value={v.weighing_method} onChange={set('weighing_method')} options={METHODS} />
        <TextField label="Weighbridge slip / reference" value={v.weighbridge_reference} onChange={set('weighbridge_reference')} />
      </fieldset>

      <TextArea label="Gate notes" value={v.gate_notes} onChange={set('gate_notes')} />

      {duplicates && (
        <Alert tone="warn" title="Possible duplicate invoice">
          <p>A receipt already exists for this supplier and invoice: <span className="font-mono">{duplicates.join(', ') || '—'}</span>.</p>
          <p className="mt-1">Check the paperwork. If this is genuinely a separate delivery, confirm to continue — the override is recorded.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" loading={busy} onClick={(e) => submit(e as unknown as FormEvent, true)}>Create anyway</Button>
            <Button variant="secondary" size="sm" onClick={() => setDuplicates(null)}>Go back</Button>
          </div>
        </Alert>
      )}
      <ActionError error={error} />
      {!duplicates && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <Button type="submit" size="lg" loading={busy && intent === 'continue'} disabled={busy} onClick={() => setIntent('continue')}>{submitLabel}</Button>
          {draftLabel && (
            <Button variant="secondary" size="lg" loading={busy && intent === 'draft'} disabled={busy}
              onClick={(e) => submit(e as unknown as FormEvent, false, 'draft')}>{draftLabel}</Button>
          )}
          {onCancel && (
            <Button variant="ghost" size="lg" disabled={busy} className="sm:ml-auto"
              onClick={() => (dirty ? setConfirmLeave(true) : onCancel())}>Cancel</Button>
          )}
        </div>
      )}
      {confirmLeave && onCancel && (
        <Alert tone="warn" title="Discard this receipt?">
          <p>Nothing has been saved yet. Leaving now discards what you typed. To keep it for later, use {draftLabel ? <strong>{draftLabel}</strong> : 'save'} instead.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" onClick={onCancel}>Discard and leave</Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmLeave(false)}>Keep editing</Button>
          </div>
        </Alert>
      )}
    </form>
  );
}
