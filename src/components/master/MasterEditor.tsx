'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, post, type Paginated } from '@/lib/api';
import { useApi, useFactories, useLocations, useTestDefinitions, useUnits, useWarehouses } from '@/lib/hooks';
import { Modal } from '../Dialog';
import { ActionError, Button, cx } from '../ui';
import { Checkbox, SelectField, TextArea, TextField, type Option } from '../forms';
import type { FieldDef, KindDef, OptionSource } from './config';

type Row = Record<string, unknown> & { id: number };
type Values = Record<string, string | boolean | number[]>;

function toValues(kind: KindDef, row: Row | null): Values {
  const out: Values = {};
  for (const f of kind.fields) {
    const raw = row ? row[f.name] : kind.defaults?.[f.name];
    if (f.type === 'checkbox') out[f.name] = Boolean(raw);
    else if (f.type === 'tests') out[f.name] = row ? ((row.test_requirements as { test_definition: number }[]) ?? []).map((t) => t.test_definition) : [];
    else if (f.type === 'list') out[f.name] = Array.isArray(raw) ? raw.join(', ') : '';
    else out[f.name] = raw === null || raw === undefined ? '' : String(raw);
  }
  return out;
}

function toBody(kind: KindDef, v: Values) {
  const body: Record<string, unknown> = {};
  for (const f of kind.fields) {
    if (f.when && v[f.when.field] !== f.when.equals) continue;
    const val = v[f.name];
    if (f.type === 'checkbox' || f.type === 'tests') body[f.name] = val;
    else if (f.type === 'list') body[f.name] = String(val).split(',').map((x) => x.trim()).filter(Boolean);
    else if (f.type === 'select' && f.source) body[f.name] = val === '' ? null : Number(val);
    else if (f.type === 'number') body[f.name] = val === '' ? null : String(val);
    else if (f.name === 'code') body[f.name] = String(val).trim().toUpperCase();
    else body[f.name] = String(val).trim();
  }
  return body;
}

/** Add / edit form for one master record, built from the kind's field definitions. */
export function MasterEditor({ kind, record, onClose, onSaved }: {
  kind: KindDef; record: Row | 'new' | null; onClose: () => void; onSaved: (created: boolean) => void;
}) {
  const open = record !== null;
  const editing = record && record !== 'new' ? record : null;
  const sources = useSources(open ? kind.fields.map((f) => f.source).filter(Boolean) as OptionSource[] : []);
  const [v, setV] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV(toValues(kind, editing));
    setErrors({});
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, kind.slug]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const missing = Object.fromEntries(kind.fields
      .filter((f) => f.required && (!f.when || v[f.when.field] === f.when.equals) && !String(v[f.name] ?? '').trim())
      .map((f) => [f.name, `${f.label} is required.`]));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    setError(null);
    try {
      const body = toBody(kind, v);
      if (editing) await api(`${kind.path}/${editing.id}`, { method: 'PATCH', body });
      else await post(kind.path, body);
      onSaved(!editing);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const options = (f: FieldDef): Option[] => {
    if (f.options) return f.options;
    const all = sources[f.source!] ?? [];
    // A location cannot sit inside itself; locations list only the chosen warehouse's.
    if (f.source === 'locations') {
      return all.filter((o) => o.value !== editing?.id && (!v.warehouse || String(o.extra) === String(v.warehouse)));
    }
    return all;
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${kind.noun}` : `Add ${kind.noun}`} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {kind.fields.filter((f) => !f.when || v[f.when.field] === f.when.equals).map((f) => {
            const common = { label: f.label, required: f.required, error: errors[f.name], hint: f.hint, className: f.wide ? 'sm:col-span-2' : undefined };
            const set = (val: string | boolean | number[]) => setV((x) => ({ ...x, [f.name]: val }));
            if (f.type === 'checkbox') {
              return <div key={f.name} className={cx('flex items-end pb-2', f.wide && 'sm:col-span-2')}><Checkbox label={f.label} checked={!!v[f.name]} onChange={(e) => set(e.target.checked)} /></div>;
            }
            if (f.type === 'textarea') return <TextArea key={f.name} {...common} rows={2} value={String(v[f.name] ?? '')} onChange={(e) => set(e.target.value)} />;
            if (f.type === 'select') {
              return <SelectField key={f.name} {...common} value={String(v[f.name] ?? '')} onChange={(e) => set(e.target.value)} options={options(f)} placeholder={f.required ? 'Select…' : 'None'} />;
            }
            if (f.type === 'tests') {
              const chosen = (v[f.name] as number[]) ?? [];
              return (
                <fieldset key={f.name} className="sm:col-span-2">
                  <legend className="text-sm font-medium text-slate-700">{f.label}</legend>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                    {(sources.tests ?? []).length === 0 ? <p className="text-sm text-slate-500">No lab tests yet — add them under Lab tests.</p>
                      : (sources.tests ?? []).map((t) => (
                        <Checkbox key={t.value} label={t.label} checked={chosen.includes(Number(t.value))}
                          onChange={(e) => set(e.target.checked ? [...chosen, Number(t.value)] : chosen.filter((x) => x !== Number(t.value)))} />
                      ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Samples of this material get these tests by default.</p>
                </fieldset>
              );
            }
            return <TextField key={f.name} {...common} type={f.type === 'number' ? 'number' : 'text'} step={f.type === 'number' ? 'any' : undefined}
              placeholder={f.placeholder} value={String(v[f.name] ?? '')} onChange={(e) => set(e.target.value)} />;
          })}
        </div>
        <ActionError error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{editing ? 'Save changes' : `Add ${kind.noun}`}</Button>
        </div>
      </form>
    </Modal>
  );
}

type SourceOption = Option & { extra?: unknown };

/** Option lists for select fields (only the ones the open form needs are loaded). */
function useSources(needed: OptionSource[]): Partial<Record<OptionSource, SourceOption[]>> {
  const units = useUnits();
  const warehouses = useWarehouses();
  const locations = useLocations();
  const factories = useFactories();
  const tests = useTestDefinitions();
  const categories = useApi<Paginated<{ id: number; code: string; name: string }>>(
    needed.includes('categories') ? 'master/material-categories' : null, { page_size: 200 });
  return {
    units: units.items.map((u) => ({ value: u.id, label: `${u.name} (${u.symbol})` })),
    warehouses: warehouses.items.map((w) => ({ value: w.id, label: w.name })),
    locations: locations.items.map((l) => ({ value: l.id, label: l.full_path, extra: l.warehouse })),
    factories: factories.items.map((f) => ({ value: f.id, label: f.name })),
    tests: tests.items.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
    categories: (categories.data?.results ?? []).map((c) => ({ value: c.id, label: c.name })),
  };
}
