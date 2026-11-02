'use client';

/**
 * Dropdown of master data with "+ New": if the record is missing, permitted roles add it right
 * here (code, name and the essentials) and it is selected straight away. Who may add what comes
 * from the server's `master.create_roles` policy, which the API also enforces; editing and
 * deleting stay with administrators (Django admin).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, post } from '@/lib/api';
import { useApi, useFactories, useLocations, useMe, usePolicy, useUnits, useWarehouses } from '@/lib/hooks';
import type { Paginated } from '@/lib/api';
import { Modal } from '../Dialog';
import { ActionError, Alert, Button } from '../ui';
import { Checkbox, SelectField, TextField, type Option } from '../forms';
import { SearchableSelect, type SearchOption } from '../SearchableSelect';

export type MasterKind = 'supplier' | 'material' | 'unit' | 'location' | 'factory' | 'department' | 'test_definition';

const PATH: Record<MasterKind, string> = {
  supplier: 'master/suppliers', material: 'master/materials', unit: 'master/units', location: 'master/locations',
  factory: 'master/factories', department: 'master/departments', test_definition: 'master/test-definitions',
};
const NOUN: Record<MasterKind, string> = {
  supplier: 'supplier', material: 'material', unit: 'unit', location: 'storage location',
  factory: 'factory', department: 'department', test_definition: 'lab test',
};

export function useCanCreate(kind: MasterKind) {
  const me = useMe();
  const policy = usePolicy().data;
  const roles = [...(policy?.['master.manage_roles'] ?? ['ADMIN']), ...(policy?.['master.create_roles']?.[kind] ?? [])];
  return !!me.data && roles.includes(me.data.role);
}

type SelectProps = {
  kind: MasterKind;
  label: string;
  options: SearchOption[];
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Pre-filled values for the quick-add form (e.g. the factory a department belongs to). */
  defaults?: Record<string, string | boolean>;
};

export function MasterSelect({ kind, onChange, defaults, hint, ...rest }: SelectProps) {
  const canCreate = useCanCreate(kind);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <SearchableSelect
        {...rest}
        onChange={onChange}
        placeholder={rest.placeholder && rest.placeholder !== 'Select…' ? rest.placeholder : `Search ${NOUN[kind]}s…`}
        hint={hint ?? (!canCreate && rest.options.length === 0 ? `No ${NOUN[kind]}s yet — ask an administrator to add one.` : undefined)}
        labelAction={canCreate && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            + New
          </button>
        )}
      />
      <QuickCreateDialog kind={kind} open={adding} defaults={defaults} onClose={() => setAdding(false)}
        onCreated={(id) => onChange(String(id))} />
    </>
  );
}

type Values = Record<string, string | boolean>;

const BLANK: Record<MasterKind, Values> = {
  supplier: { code: '', name: '', contact_person: '', phone: '', gst_number: '' },
  material: { code: '', name: '', category: '', default_unit: '', qc_required: true },
  unit: { code: '', name: '', symbol: '', unit_type: 'WEIGHT' },
  location: { warehouse: '', parent: '', code: '', name: '', location_type: 'SHELF', is_quarantine: false },
  factory: { code: '', name: '' },
  department: { factory: '', code: '', name: '' },
  test_definition: { code: '', name: '', result_type: 'NUMERIC', unit: '', min_value: '', max_value: '', acceptable_text_values: '', is_required: true },
};

const REQUIRED: Record<MasterKind, string[]> = {
  supplier: ['code', 'name'], material: ['code', 'name', 'default_unit'], unit: ['code', 'name', 'symbol'],
  location: ['warehouse', 'code', 'name'], factory: ['code', 'name'], department: ['factory', 'code', 'name'],
  test_definition: ['code', 'name'],
};

/** Quick-add form for one master record; calls `onCreated` with the new id. */
export function QuickCreateDialog({ kind, open, onClose, onCreated, defaults }: {
  kind: MasterKind; open: boolean; onClose: () => void; onCreated: (id: number) => void; defaults?: Values;
}) {
  const qc = useQueryClient();
  const units = useUnits();
  const warehouses = useWarehouses();
  const locations = useLocations();
  const factories = useFactories();
  const categories = useApi<Paginated<{ id: number; code: string; name: string }>>(
    open && kind === 'material' ? 'master/material-categories' : null, { page_size: 200 });
  const [v, setV] = useState<Values>(BLANK[kind]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const tonne = units.items.find((u) => u.code === 'T');
    setV({ ...BLANK[kind], ...(kind === 'material' && tonne ? { default_unit: String(tonne.id) } : {}),
      ...(kind === 'location' && warehouses.items.length === 1 ? { warehouse: String(warehouses.items[0].id) } : {}), ...defaults });
    setErrors({});
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const text = (k: string, label: string, extra: Record<string, unknown> = {}) => (
    <TextField key={k} label={label} required={REQUIRED[kind].includes(k)} value={String(v[k] ?? '')} onChange={set(k)} error={errors[k]} {...extra} />
  );
  const select = (k: string, label: string, options: Option[], placeholder = 'Select…') => (
    <SelectField key={k} label={label} required={REQUIRED[kind].includes(k)} value={String(v[k] ?? '')} onChange={set(k)} error={errors[k]} options={options} placeholder={placeholder} />
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // this form may open from inside another form
    const missing = Object.fromEntries(REQUIRED[kind].filter((k) => !String(v[k] ?? '').trim()).map((k) => [k, 'Required.']));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    const body: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === '') continue;
      if (['category', 'default_unit', 'warehouse', 'parent', 'factory', 'unit'].includes(k)) body[k] = Number(val);
      else if (k === 'acceptable_text_values') body[k] = String(val).split(',').map((x) => x.trim()).filter(Boolean);
      else if (k === 'code') body[k] = String(val).trim().toUpperCase();
      else body[k] = typeof val === 'string' ? val.trim() : val;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await post<{ id: number }>(PATH[kind], body);
      await qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('master/') });
      onCreated(created.id);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const unitOptions = units.items.map((u) => ({ value: u.id, label: `${u.name} (${u.symbol})` }));
  return (
    <Modal open={open} onClose={onClose} title={`New ${NOUN[kind]}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {kind === 'supplier' && [text('code', 'Code', { placeholder: 'e.g. SUP-014' }), text('name', 'Name'), text('contact_person', 'Contact person'), text('phone', 'Phone'), text('gst_number', 'GST number')]}
          {kind === 'material' && [
            text('code', 'Code', { placeholder: 'e.g. MAT-120' }), text('name', 'Name'),
            select('category', 'Category', (categories.data?.results ?? []).map((c) => ({ value: c.id, label: c.name })), 'None'),
            select('default_unit', 'Unit', unitOptions),
          ]}
          {kind === 'unit' && [text('code', 'Code', { placeholder: 'e.g. KG' }), text('name', 'Name'), text('symbol', 'Symbol', { placeholder: 'e.g. kg' }),
            select('unit_type', 'Type', ['WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'AREA', 'OTHER'].map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() })))]}
          {kind === 'location' && [
            select('warehouse', 'Warehouse', warehouses.items.map((w) => ({ value: w.id, label: w.name }))),
            select('parent', 'Inside (optional)', locations.items.filter((l) => !v.warehouse || String(l.warehouse) === v.warehouse).map((l) => ({ value: l.id, label: l.full_path })), 'Top level'),
            text('code', 'Code', { placeholder: 'e.g. A-R3-S1' }), text('name', 'Name'),
            select('location_type', 'Type', ['ZONE', 'RACK', 'SHELF', 'BIN', 'QUARANTINE', 'DISPATCH'].map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))),
          ]}
          {kind === 'factory' && [text('code', 'Code'), text('name', 'Name')]}
          {kind === 'department' && [select('factory', 'Factory', factories.items.map((f) => ({ value: f.id, label: f.name }))), text('code', 'Code'), text('name', 'Name')]}
          {kind === 'test_definition' && [
            text('code', 'Code', { placeholder: 'e.g. ASH' }), text('name', 'Name'),
            select('result_type', 'Result type', [{ value: 'NUMERIC', label: 'Number' }, { value: 'TEXT', label: 'Text' }, { value: 'BOOLEAN', label: 'Pass / fail' }]),
            select('unit', 'Unit', unitOptions, 'None'),
            ...(v.result_type === 'NUMERIC' ? [text('min_value', 'Minimum', { type: 'number', step: 'any' }), text('max_value', 'Maximum', { type: 'number', step: 'any' })] : []),
            ...(v.result_type === 'TEXT' ? [text('acceptable_text_values', 'Acceptable values', { hint: 'Comma-separated, e.g. White powder, Off-white powder' })] : []),
          ]}
        </div>
        {kind === 'material' && <Checkbox label="Needs lab testing before use" checked={!!v.qc_required} onChange={(e) => setV((x) => ({ ...x, qc_required: e.target.checked }))} />}
        {kind === 'location' && <Checkbox label="Quarantine / pending-QC location" checked={!!v.is_quarantine} onChange={(e) => setV((x) => ({ ...x, is_quarantine: e.target.checked }))} />}
        {kind === 'test_definition' && <Checkbox label="Required for release" checked={!!v.is_required} onChange={(e) => setV((x) => ({ ...x, is_required: e.target.checked }))} />}
        {kind === 'material' && <Alert tone="info">Bags of this material need expiry and retest dates and are issued whole. Lab tests for it are set up by QA or an administrator.</Alert>}
        <ActionError error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Add {NOUN[kind]}</Button>
        </div>
      </form>
    </Modal>
  );
}
