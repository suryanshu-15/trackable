'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api, newIdempotencyKey, post } from '@/lib/api';
import { useMaterials, usePolicy, useUnits } from '@/lib/hooks';
import { fmtQty } from '@/lib/format';
import type { InvoiceLine, PackageListItem, Verification } from '@/lib/types';
import { Modal } from '../Dialog';
import { ActionError, Alert, Button, Tabs } from '../ui';
import { TextArea, TextField, compact, validate } from '../forms';
import { MasterSelect } from '@/components/master/MasterSelect';

type Errors = Record<string, string>;

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(e.fieldErrors());
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fieldErrors, setFieldErrors, run, setError };
}

// ---------------------------------------------------------------------------
// Invoice line (add / edit)
// ---------------------------------------------------------------------------

const EMPTY_LINE = {
  material: '', material_name_declared: '', material_code_declared: '', description: '', grade_or_specification: '',
  declared_quantity: '', declared_unit: '', declared_weight: '', declared_weight_unit: '', batch_number: '',
  manufacturing_date: '', expiry_date: '', retest_date: '', quality_specification: '', remarks: '',
};

export function LineDialog({ open, onClose, receiptId, line, onSaved }: {
  open: boolean; onClose: () => void; receiptId: string; line?: InvoiceLine; onSaved: () => void;
}) {
  const materials = useMaterials();
  const units = useUnits();
  const [v, setV] = useState(EMPTY_LINE);
  const s = useSubmit();

  useEffect(() => {
    if (!open) return;
    s.setError(null);
    s.setFieldErrors({});
    setV(line ? Object.fromEntries(Object.keys(EMPTY_LINE).map((k) => [k, (line as Record<string, unknown>)[k] == null ? '' : String((line as Record<string, unknown>)[k])])) as typeof EMPTY_LINE : EMPTY_LINE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line]);

  const set = (k: keyof typeof EMPTY_LINE) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  const chooseMaterial = (id: string) => {
    const m = materials.items.find((x) => String(x.id) === id);
    setV((x) => ({
      ...x, material: id,
      material_name_declared: x.material_name_declared || m?.name || '',
      declared_unit: x.declared_unit || (m?.default_unit ? String(m.default_unit) : ''),
    }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!v.material && !v.material_name_declared.trim()) local.material_name_declared = 'Choose a material or enter the invoice description.';
    const q = validate.positive(v.declared_quantity);
    if (q) local.declared_quantity = q;
    if (!v.declared_unit) local.declared_unit = 'Choose the unit.';
    if (v.declared_weight && !v.declared_weight_unit) local.declared_weight_unit = 'Choose the weight unit.';
    if (v.expiry_date && v.manufacturing_date && v.expiry_date < v.manufacturing_date) local.expiry_date = 'Expiry is before manufacture.';
    s.setFieldErrors(local);
    if (Object.keys(local).length) return;
    const body = {
      ...compact(v), receipt: receiptId,
      material: v.material ? Number(v.material) : null,
      declared_unit: Number(v.declared_unit),
      declared_weight_unit: v.declared_weight_unit ? Number(v.declared_weight_unit) : null,
    };
    s.run(async () => {
      if (line) await api(`receiving/invoice-lines/${line.id}`, { method: 'PATCH', body });
      else await post('receiving/invoice-lines', body);
      onSaved();
      onClose();
    });
  };

  const fe = s.fieldErrors;
  return (
    <Modal open={open} onClose={onClose} title={line ? `Edit line ${line.line_number}` : 'Add invoice line'} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MasterSelect kind="material" label="Material (master)" value={v.material} onChange={(val) => chooseMaterial(val)} error={fe.material}
            placeholder="Not in master / unidentified" options={materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))} />
          <TextField label="Description on invoice" value={v.material_name_declared} onChange={set('material_name_declared')} error={fe.material_name_declared} />
          <TextField label="Supplier material code" value={v.material_code_declared} onChange={set('material_code_declared')} />
          <TextField label="Grade / specification" value={v.grade_or_specification} onChange={set('grade_or_specification')} />
          <TextField label="Declared quantity" required type="number" inputMode="decimal" step="any" min="0" value={v.declared_quantity} onChange={set('declared_quantity')} error={fe.declared_quantity} />
          <MasterSelect kind="unit" label="Unit" required value={v.declared_unit} onChange={(val) => set('declared_unit')({ target: { value: val } })} error={fe.declared_unit} options={units.items.map((u) => ({ value: u.id, label: `${u.name} (${u.symbol})` }))} />
          <TextField label="Declared weight" type="number" inputMode="decimal" step="any" min="0" value={v.declared_weight} onChange={set('declared_weight')} error={fe.declared_weight} />
          <MasterSelect kind="unit" label="Weight unit" value={v.declared_weight_unit} onChange={(val) => set('declared_weight_unit')({ target: { value: val } })} error={fe.declared_weight_unit} options={units.items.filter((u) => u.unit_type === 'WEIGHT').map((u) => ({ value: u.id, label: u.symbol }))} />
          <TextField label="Batch / lot" value={v.batch_number} onChange={set('batch_number')} error={fe.batch_number} />
          <TextField label="Manufactured" type="date" value={v.manufacturing_date} onChange={set('manufacturing_date')} error={fe.manufacturing_date} />
          <TextField label="Expiry" type="date" value={v.expiry_date} onChange={set('expiry_date')} error={fe.expiry_date} />
          <TextField label="Retest date" type="date" value={v.retest_date} onChange={set('retest_date')} error={fe.retest_date} />
        </div>
        <TextArea label="Quality specification" value={v.quality_specification} onChange={set('quality_specification')} />
        <TextArea label="Remarks" value={v.remarks} onChange={set('remarks')} />
        <ActionError error={s.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={s.busy}>{line ? 'Save line' : 'Add line'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Physical verification (unloading)
// ---------------------------------------------------------------------------

export function VerifyDialog({ open, onClose, line, onSaved }: {
  open: boolean; onClose: () => void; line: InvoiceLine | null; onSaved: (v: Verification) => void;
}) {
  const units = useUnits();
  const materials = useMaterials();
  const blank = { received_quantity: '', received_unit: '', accepted_quantity: '', damaged_quantity: '', mismatched_quantity: '',
    identified_material: '', observed_description: '', observed_grade: '', verification_notes: '', discrepancy_notes: '' };
  const [v, setV] = useState(blank);
  const [decision, setDecision] = useState<'accept' | 'reject'>('accept');
  const s = useSubmit();
  const policy = usePolicy().data;
  // Business rule (default): a line is accepted in full or rejected, never partly.
  const whole = policy?.['receiving.line_acceptance'] !== 'PARTIAL';
  const pkgUnits = policy?.['package.unit_codes'] ?? [];

  useEffect(() => {
    if (!open || !line) return;
    s.setError(null);
    s.setFieldErrors({});
    setDecision('accept');
    const packageUnit = units.items.find((u) => pkgUnits.includes(u.code));
    setV({ ...blank, received_unit: String(packageUnit?.id ?? line.declared_unit) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line, units.items.length, pkgUnits.join()]);

  if (!line) return null;
  const rejecting = whole && decision === 'reject';
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  const received = Number(v.received_quantity);
  const declared = Number(line.declared_quantity);
  const sameUnit = v.received_unit === String(line.declared_unit);
  const diff = v.received_quantity !== '' && sameUnit ? received - declared : null;
  const damaged = whole && !rejecting ? 0 : Number(v.damaged_quantity || 0) + Number(v.mismatched_quantity || 0);
  const accepted = whole ? (rejecting ? 0 : received) : v.accepted_quantity !== '' ? Number(v.accepted_quantity) : Math.max(0, received - damaged);
  const unitCode = units.items.find((u) => String(u.id) === v.received_unit)?.code;
  const discrepant = rejecting || (diff !== null && diff !== 0) || damaged > 0 || (!sameUnit && diff === null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    const r = validate.nonNegative(v.received_quantity) || (v.received_quantity === '' ? 'Enter the counted / weighed quantity.' : undefined);
    if (r) local.received_quantity = r;
    if (!v.received_unit) local.received_unit = 'Choose the unit.';
    for (const k of ['accepted_quantity', 'damaged_quantity', 'mismatched_quantity'] as const) {
      const m = validate.nonNegative(v[k]);
      if (m) local[k] = m;
    }
    if (v.received_quantity !== '' && accepted + damaged > received + 1e-9) local.accepted_quantity = 'Accepted + damaged + mismatched cannot exceed received.';
    if (discrepant && !v.discrepancy_notes.trim()) local.discrepancy_notes = rejecting ? 'Give the reason for rejecting the line.' : 'Describe the discrepancy.';
    if (!rejecting && pkgUnits.length && unitCode && !pkgUnits.includes(unitCode)) local.received_unit = `Bags are counted in ${pkgUnits.join(', ').toLowerCase()}.`;
    s.setFieldErrors(local);
    if (Object.keys(local).length) return;
    const figures = whole
      ? { accepted_quantity: String(accepted), ...(rejecting ? compact({ damaged_quantity: v.damaged_quantity, mismatched_quantity: v.mismatched_quantity }) : {}) }
      : compact({ accepted_quantity: v.accepted_quantity, damaged_quantity: v.damaged_quantity, mismatched_quantity: v.mismatched_quantity });
    const observed = compact({
      received_quantity: v.received_quantity, observed_description: v.observed_description, observed_grade: v.observed_grade,
      verification_notes: v.verification_notes, discrepancy_notes: v.discrepancy_notes,
    });
    s.run(async () => {
      const result = await post<Verification>(`receiving/invoice-lines/${line.id}/verify`, {
        ...observed,
        ...figures,
        received_unit: Number(v.received_unit),
        identified_material: v.identified_material ? Number(v.identified_material) : undefined,
      });
      onSaved(result);
      onClose();
    });
  };

  const fe = s.fieldErrors;
  return (
    <Modal open={open} onClose={onClose} title={`Verify line ${line.line_number} — ${line.material_name || line.material_name_declared}`} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert tone="info">
          Invoice says <strong>{fmtQty(line.declared_quantity, line.declared_unit_symbol)}</strong>
          {line.batch_number && <> · lot <span className="font-mono">{line.batch_number}</span></>}. Record what is physically received.
        </Alert>
        {whole && (
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Decision</legend>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="radio" name="line-decision" checked={decision === 'accept'} onChange={() => setDecision('accept')} /> Accept whole line</label>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="radio" name="line-decision" checked={decision === 'reject'} onChange={() => setDecision('reject')} /> Reject line</label>
          </fieldset>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Received quantity" required autoFocus type="number" inputMode="decimal" step="any" min="0" value={v.received_quantity} onChange={set('received_quantity')} error={fe.received_quantity}
            hint={diff !== null && v.received_quantity !== '' ? (diff === 0 ? 'Matches invoice.' : diff < 0 ? `Short by ${fmtQty(-diff, line.declared_unit_symbol)}` : `Excess of ${fmtQty(diff, line.declared_unit_symbol)}`) : undefined} />
          <MasterSelect kind="unit" label="Unit" required value={v.received_unit} onChange={(val) => set('received_unit')({ target: { value: val } })} error={fe.received_unit} options={units.items.map((u) => ({ value: u.id, label: u.symbol }))} />
          {(!whole || rejecting) && <>
            <TextField label="Damaged quantity" type="number" inputMode="decimal" step="any" min="0" value={v.damaged_quantity} onChange={set('damaged_quantity')} error={fe.damaged_quantity} />
            <TextField label="Wrong / mismatched quantity" type="number" inputMode="decimal" step="any" min="0" value={v.mismatched_quantity} onChange={set('mismatched_quantity')} error={fe.mismatched_quantity} />
          </>}
          {!whole && (
            <TextField label="Accepted quantity" type="number" inputMode="decimal" step="any" min="0" value={v.accepted_quantity} onChange={set('accepted_quantity')} error={fe.accepted_quantity}
              placeholder={v.received_quantity !== '' ? String(accepted) : ''} hint="Defaults to received minus damaged and mismatched." />
          )}
          <MasterSelect kind="material" label="Material actually identified" value={v.identified_material} onChange={(val) => set('identified_material')({ target: { value: val } })} placeholder="Same as invoice"
            options={materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))} />
          <TextField label="Observed description" value={v.observed_description} onChange={set('observed_description')} />
          <TextField label="Observed grade" value={v.observed_grade} onChange={set('observed_grade')} />
        </div>
        {discrepant && (
          <Alert tone="warn" title={rejecting ? 'Line rejection' : 'Discrepancy'}>
            {rejecting ? 'Nothing from this line enters stock. A manager must accept the rejection before the truck is completed.' : 'The line will be flagged and needs authorised acceptance before packaging.'}
          </Alert>
        )}
        <TextArea label={rejecting ? 'Reason for rejection' : 'Discrepancy notes'} required={discrepant} value={v.discrepancy_notes} onChange={set('discrepancy_notes')} error={fe.discrepancy_notes} />
        <TextArea label="Verification notes" value={v.verification_notes} onChange={set('verification_notes')} />
        <ActionError error={s.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={s.busy}>Record verification</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Package generation
// ---------------------------------------------------------------------------

export function PackagesDialog({ open, onClose, line, verification, onCreated }: {
  open: boolean; onClose: () => void; line: InvoiceLine | null; verification?: Verification; onCreated: (pkgs: PackageListItem[]) => void;
}) {
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [count, setCount] = useState('');
  const [each, setEach] = useState('');
  const [custom, setCustom] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [retest, setRetest] = useState('');
  const s = useSubmit();
  const kind = (usePolicy().data?.['package.type'] || 'package').toLowerCase();
  // One key per dialog opening: a retried submit (timeout, double tap) cannot create packages twice.
  const key = useMemo(() => (open ? newIdempotencyKey() : ''), [open]);

  useEffect(() => {
    if (!open || !line) return;
    s.setError(null);
    s.setFieldErrors({});
    setCount(''); setEach(''); setCustom('');
    setBatch(line.batch_number || '');
    setExpiry(line.expiry_date || '');
    setRetest(line.retest_date || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line]);

  if (!line) return null;
  const accepted = Number(verification?.accepted_quantity ?? line.accepted_quantity ?? 0);
  const packaged = Number(verification?.packaged_quantity ?? 0);
  const remaining = Math.max(0, accepted - packaged);
  const quantities = mode === 'equal'
    ? (Number(count) > 0 && Number(each) > 0 ? Array(Math.floor(Number(count))).fill(Number(each)) : [])
    : custom.split(/[\s,;]+/).filter(Boolean).map(Number);
  const total = quantities.reduce((a, b) => a + b, 0);
  const unit = verification?.received_unit_symbol || line.declared_unit_symbol;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!quantities.length || quantities.some((q) => !(q > 0))) local.quantities = 'Enter at least one package with a quantity above zero.';
    else if (total > remaining + 1e-9) local.quantities = `Total ${fmtQty(total, unit)} exceeds the ${fmtQty(remaining, unit)} not yet packaged.`;
    s.setFieldErrors(local);
    if (Object.keys(local).length) return;
    const shared = compact({ batch_number: batch, expiry_date: expiry, retest_date: retest });
    const body = mode === 'equal'
      ? { count: quantities.length, quantity_each: String(each), ...shared }
      : { packages: quantities.map((q) => ({ quantity: String(q), ...shared })) };
    s.run(async () => {
      onCreated(await post<PackageListItem[]>(`receiving/invoice-lines/${line.id}/packages`, body, { idempotencyKey: key }));
      onClose();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Create ${kind}s — line ${line.line_number}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-600">
          Accepted {fmtQty(accepted, unit)} · already packaged {fmtQty(packaged, unit)} · <strong>remaining {fmtQty(remaining, unit)}</strong>
        </p>
        <Tabs tabs={[{ value: 'equal', label: `Equal ${kind}s` }, { value: 'custom', label: 'Individual quantities' }]} value={mode} onChange={setMode} />
        {mode === 'equal' ? (
          <div className="grid grid-cols-2 gap-4">
            <TextField label={`Number of ${kind}s`} type="number" inputMode="numeric" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} autoFocus />
            <TextField label={`Quantity each (${unit})`} type="number" inputMode="decimal" step="any" min="0" value={each} onChange={(e) => setEach(e.target.value)} />
          </div>
        ) : (
          <TextArea label={`Quantities (${unit})`} hint={`One per ${kind}, separated by commas or new lines, e.g. 1, 1, 0.5`} value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
        <div className="grid grid-cols-3 gap-4">
          <TextField label="Batch / lot" value={batch} onChange={(e) => setBatch(e.target.value)} />
          <TextField label="Expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <TextField label="Retest date" type="date" value={retest} onChange={(e) => setRetest(e.target.value)} />
        </div>
        <p className="text-sm">{quantities.length} {kind}(s), total <strong>{fmtQty(total, unit)}</strong></p>
        {s.fieldErrors.quantities && <p role="alert" className="text-sm text-red-700">{s.fieldErrors.quantities}</p>}
        <ActionError error={s.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={s.busy}>Create packages</Button>
        </div>
      </form>
    </Modal>
  );
}
