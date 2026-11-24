'use client';

/**
 * Gate register entry — the same columns as the gate's Excel sheet: truck, invoice and one row per
 * material. Weights are not entered here: the weighbridge is at receiving.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useLocations, useMaterials, useSuppliers, useUnits } from '@/lib/hooks';
import { nowLocalInput, todayInput } from '@/lib/format';
import type { Receipt } from '@/lib/types';
import { ActionError, Alert, Button, cx } from '../ui';
import { TextField, inputCls } from '../forms';
import { MasterSelect } from '@/components/master/MasterSelect';
import { storableLocations, locationLabel } from '@/components/inventory/LocationPicker';

export type GateLine = { key: string; id?: string; material: string; description: string; quantity: string; unit: string; location: string };
export type GateEntry = {
  arrival_datetime: string; supplier: string; invoice_number: string; invoice_date: string;
  vehicle_number: string; transporter_name: string; lr_number: string; eway_bill_number: string;
  driver_name: string; driver_mobile: string; lines: GateLine[];
};

let seq = 0;
const blankLine = (unit = ''): GateLine => ({ key: `n${++seq}`, material: '', description: '', quantity: '', unit, location: '' });

export function initialGateEntry(r?: Receipt): GateEntry {
  return {
    arrival_datetime: r ? r.arrival_datetime.slice(0, 16) : nowLocalInput(),
    supplier: r ? String(r.supplier) : '',
    invoice_number: r?.invoice_number ?? '',
    invoice_date: r?.invoice_date ?? todayInput(),
    vehicle_number: r?.vehicle_number ?? '',
    transporter_name: r?.transporter_name ?? '',
    lr_number: r?.lr_number ?? '',
    eway_bill_number: r?.eway_bill_number ?? '',
    driver_name: r?.driver_name ?? '',
    driver_mobile: r?.driver_mobile ?? '',
    lines: r?.invoice_lines.length
      ? r.invoice_lines.map((l) => ({
        key: l.id, id: l.id, material: l.material ? String(l.material) : '', description: l.material_name_declared ?? '',
        quantity: l.declared_quantity, unit: String(l.declared_unit), location: l.storage_location ? String(l.storage_location) : '',
      }))
      : [blankLine()],
  };
}

/** Usability checks; the API re-validates everything. Line errors are keyed `lines.<index>.<field>`. */
export function validateGateEntry(v: GateEntry): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.arrival_datetime) e.arrival_datetime = 'Gate in time is required.';
  if (!v.supplier) e.supplier = 'Choose the supplier.';
  if (!v.invoice_number.trim()) e.invoice_number = 'Invoice number is required.';
  if (!v.invoice_date) e.invoice_date = 'Invoice date is required.';
  if (!v.vehicle_number.trim()) e.vehicle_number = 'Vehicle number is required.';
  if (v.driver_mobile && !/^[0-9+\- ]{6,20}$/.test(v.driver_mobile)) e.driver_mobile = 'Digits only, e.g. 9876543210.';
  if (!v.lines.length) e.lines = 'Add at least one material.';
  v.lines.forEach((l, i) => {
    if (!l.material) e[`lines.${i}.material`] = 'Choose the material.';
    if (!(Number(l.quantity) > 0)) e[`lines.${i}.quantity`] = 'Enter the quantity.';
    if (!l.unit) e[`lines.${i}.unit`] = 'Choose the unit.';
  });
  return e;
}

export function gateEntryBody(v: GateEntry, send: boolean) {
  return {
    arrival_datetime: v.arrival_datetime, supplier: Number(v.supplier), invoice_number: v.invoice_number.trim(),
    invoice_date: v.invoice_date, vehicle_number: v.vehicle_number.trim(), transporter_name: v.transporter_name.trim(),
    lr_number: v.lr_number.trim(), eway_bill_number: v.eway_bill_number.trim(), driver_name: v.driver_name.trim(),
    driver_mobile: v.driver_mobile.trim(), send,
    lines: v.lines.map((l) => ({
      ...(l.id ? { id: l.id } : {}), material: Number(l.material), material_name_declared: l.description.trim(),
      declared_quantity: l.quantity, declared_unit: Number(l.unit), storage_location: l.location ? Number(l.location) : null,
    })),
  };
}

export function GateEntryForm({ initial, gateEntryNumber, onSave, onCancel }: {
  initial: GateEntry;
  /** Shown read-only once the entry exists; new entries get the next number when saved. */
  gateEntryNumber?: string | null;
  onSave: (body: ReturnType<typeof gateEntryBody>, acknowledgeDuplicate: boolean, send: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const suppliers = useSuppliers();
  const materials = useMaterials();
  const units = useUnits();
  const locations = useLocations();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [duplicates, setDuplicates] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<'send' | 'draft' | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  // Bags are counted in tonnes, so new rows start in tonnes.
  const tonne = units.items.find((u) => u.code === 'T');
  useEffect(() => {
    if (tonne) setV((x) => ({ ...x, lines: x.lines.map((l) => (l.unit ? l : { ...l, unit: String(tonne.id) })) }));
  }, [tonne]);

  const set = (k: keyof Omit<GateEntry, 'lines'>) => (e: { target: { value: string } }) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    setDuplicates(null);
  };
  const setLine = (i: number, patch: Partial<GateLine>) =>
    setV((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const chooseMaterial = (i: number, id: string) => {
    const m = materials.items.find((x) => String(x.id) === id);
    const line = v.lines[i];
    const old = materials.items.find((x) => String(x.id) === line.material);
    // The description follows the material unless the gate typed its own.
    const keep = line.description && line.description !== old?.name;
    setLine(i, { material: id, description: keep ? line.description : m?.name ?? '' });
  };

  const save = async (send: boolean, acknowledge = false) => {
    const local = validateGateEntry(v);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(send ? 'send' : 'draft');
    setError(null);
    try {
      await onSave(gateEntryBody(v, send), acknowledge, send);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_invoice') {
        setDuplicates((err.details.duplicate_receipts as string[]) ?? []);
      } else {
        if (err instanceof ApiError) setErrors(err.fieldErrors());
        setError(err);
      }
    } finally {
      setBusy(null);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void save(true); };

  const materialOptions = materials.items.map((m) => ({ value: m.id, label: `${m.name} (${m.code})`, keywords: m.hsn_code ?? '' }));
  const unitOptions = units.items.map((u) => ({ value: u.id, label: u.symbol }));
  const locationOptions = storableLocations(locations.items).map((l) => ({ value: l.id, label: locationLabel(l) }));

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="block text-sm font-medium text-slate-700">Gate entry no.</span>
          <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700">{gateEntryNumber || 'Given when saved'}</p>
        </div>
        <TextField label="Gate in time" type="datetime-local" required value={v.arrival_datetime} onChange={set('arrival_datetime')} error={errors.arrival_datetime} />
        <MasterSelect kind="supplier" label="Supplier name" required value={v.supplier} onChange={(val) => set('supplier')({ target: { value: val } })} error={errors.supplier}
          className="sm:col-span-2"
          options={suppliers.items.map((s) => ({ value: s.id, label: s.name, keywords: [s.code, s.gst_number, s.contact_person, s.phone].join(' ') }))} />
        <TextField label="Invoice number" required value={v.invoice_number} onChange={set('invoice_number')} error={errors.invoice_number} />
        <TextField label="Invoice date" type="date" required value={v.invoice_date} onChange={set('invoice_date')} error={errors.invoice_date} />
        <TextField label="Vehicle no." required placeholder="OD02AB1234" value={v.vehicle_number}
          onChange={(e) => set('vehicle_number')({ target: { value: e.target.value.toUpperCase() } })} error={errors.vehicle_number} />
        <TextField label="Transporter name" value={v.transporter_name} onChange={set('transporter_name')} error={errors.transporter_name} />
        <TextField label="LR no." value={v.lr_number} onChange={set('lr_number')} error={errors.lr_number} />
        <TextField label="E-way bill no." inputMode="numeric" value={v.eway_bill_number} onChange={set('eway_bill_number')} error={errors.eway_bill_number} />
        <TextField label="Driver mobile no." type="tel" inputMode="tel" placeholder="9876543210" value={v.driver_mobile} onChange={set('driver_mobile')} error={errors.driver_mobile} />
        <TextField label="Driver name" value={v.driver_name} onChange={set('driver_name')} error={errors.driver_name} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Materials on this truck</h2>
        {errors.lines && <p className="mb-2 text-sm text-red-600">{errors.lines}</p>}
        <div className="space-y-3">
          {v.lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-6 lg:grid-cols-12">
              <MasterSelect kind="material" label={`Material ${v.lines.length > 1 ? i + 1 : ''}`} required value={l.material}
                onChange={(val) => chooseMaterial(i, val)} error={errors[`lines.${i}.material`]} options={materialOptions}
                className="sm:col-span-3 lg:col-span-3" />
              <label className="block sm:col-span-3 lg:col-span-3">
                <span className="block text-sm font-medium text-slate-700">Material description</span>
                <input className={cx(inputCls, 'mt-1')} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              </label>
              <TextField label="Quantity" required type="number" inputMode="decimal" min="0" step="any" value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })} error={errors[`lines.${i}.quantity`]} className="sm:col-span-2 lg:col-span-2" />
              <label className="block sm:col-span-1 lg:col-span-1">
                <span className="block text-sm font-medium text-slate-700">Unit<span className="text-red-600" aria-hidden="true"> *</span></span>
                <select className={cx(inputCls, 'mt-1')} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-invalid={!!errors[`lines.${i}.unit`] || undefined}>
                  <option value="">—</option>
                  {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <MasterSelect kind="location" label="Storage location" value={l.location} onChange={(val) => setLine(i, { location: val })}
                options={locationOptions} className="sm:col-span-2 lg:col-span-2" placeholder="Choose" />
              <div className="flex items-end sm:col-span-1 lg:col-span-1">
                {v.lines.length > 1 && (
                  <Button variant="ghost" size="sm" aria-label={`Remove material ${i + 1}`} onClick={() => setV((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>Remove</Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setV((x) => ({ ...x, lines: [...x.lines, blankLine(tonne ? String(tonne.id) : '')] }))}>
          + Add another material
        </Button>
      </section>

      {duplicates && (
        <Alert tone="warn" title="This invoice is already entered">
          <p>An entry already exists for this supplier and invoice: <span className="font-mono">{duplicates.join(', ') || '—'}</span>.</p>
          <p className="mt-1">Check the paperwork. If this really is a separate delivery, save anyway — this is recorded.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" loading={!!busy} onClick={() => save(true, true)}>Save anyway</Button>
            <Button variant="secondary" size="sm" onClick={() => setDuplicates(null)}>Go back</Button>
          </div>
        </Alert>
      )}
      <ActionError error={error} />
      {!duplicates && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <Button type="submit" size="lg" loading={busy === 'send'} disabled={!!busy}>Save and send to receiving</Button>
          <Button variant="secondary" size="lg" loading={busy === 'draft'} disabled={!!busy} onClick={() => save(false)}>Save as draft</Button>
          <Button variant="ghost" size="lg" disabled={!!busy} className="sm:ml-auto" onClick={() => (dirty ? setConfirmLeave(true) : onCancel())}>Cancel</Button>
        </div>
      )}
      {confirmLeave && (
        <Alert tone="warn" title="Leave without saving?">
          <p>What you typed will be lost. To finish later, use <strong>Save as draft</strong>.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" onClick={onCancel}>Leave without saving</Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmLeave(false)}>Keep editing</Button>
          </div>
        </Alert>
      )}
    </form>
  );
}
