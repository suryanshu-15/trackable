'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError, post } from '@/lib/api';
import { useDepartments, useFactories, useMaterials, useUnits } from '@/lib/hooks';
import type { MaterialRequest } from '@/lib/types';
import { ActionError, Button, Card, PageHeader } from '@/components/ui';
import { TextArea, TextField, compact, validate } from '@/components/forms';
import { useToast } from '@/components/Toast';
import { MasterSelect } from '@/components/master/MasterSelect';

type Line = { material: string; quantity: string; unit: string; notes: string };
const blank: Line = { material: '', quantity: '', unit: '', notes: '' };

export default function NewRequestPage() {
  const router = useRouter();
  const toast = useToast();
  const factories = useFactories();
  const departments = useDepartments();
  const materials = useMaterials();
  const units = useUnits();
  const [head, setHead] = useState({ factory: '', department: '', production_order: '', cost_centre: '', required_by: '', notes: '' });
  const [lines, setLines] = useState<Line[]>([{ ...blank }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const setLine = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const next = { ...l, [k]: v };
    if (k === 'material' && !l.unit) next.unit = String(materials.items.find((m) => String(m.id) === v)?.default_unit ?? '');
    return next;
  }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!head.factory) local.factory = 'Choose the factory.';
    lines.forEach((l, i) => {
      if (!l.material) local[`line${i}`] = 'Choose a material.';
      else if (validate.positive(l.quantity)) local[`line${i}`] = 'Enter a quantity above zero.';
      else if (!l.unit) local[`line${i}`] = 'Choose a unit.';
    });
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<MaterialRequest>('inventory/requests', {
        ...compact(head), factory: Number(head.factory), department: head.department ? Number(head.department) : undefined,
        lines: lines.map((l) => ({ material: Number(l.material), quantity: l.quantity, unit: Number(l.unit), notes: l.notes })),
      });
      toast(`Request ${r.request_number} submitted.`);
      router.push(`/requests/${r.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New material request" subtitle="The warehouse picks released stock in FIFO / FEFO order." />
      <Card>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MasterSelect kind="factory" label="Factory" required value={head.factory} error={errors.factory} onChange={(val) => setHead({ ...head, factory: val, department: '' })} options={factories.items.map((f) => ({ value: f.id, label: f.name }))} />
            <MasterSelect kind="department" defaults={{ factory: head.factory }} label="Department" value={head.department} onChange={(val) => setHead({ ...head, department: val })}
              options={departments.items.filter((d) => !head.factory || String(d.factory) === head.factory).map((d) => ({ value: d.id, label: d.name }))} />
            <TextField label="Required by" type="datetime-local" value={head.required_by} onChange={(e) => setHead({ ...head, required_by: e.target.value })} />
            <TextField label="Production order" value={head.production_order} onChange={(e) => setHead({ ...head, production_order: e.target.value })} />
            <TextField label="Cost centre" value={head.cost_centre} onChange={(e) => setHead({ ...head, cost_centre: e.target.value })} />
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Materials</legend>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-1 items-end gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-12">
                <MasterSelect kind="material" className="sm:col-span-5" label="Material" value={l.material} onChange={(val) => setLine(i, 'material', val)} options={materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }))} />
                <TextField className="sm:col-span-2" label="Quantity" type="number" inputMode="decimal" step="any" min="0" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                <MasterSelect kind="unit" className="sm:col-span-2" label="Unit" value={l.unit} onChange={(val) => setLine(i, 'unit', val)} options={units.items.map((u) => ({ value: u.id, label: u.symbol }))} />
                <TextField className="sm:col-span-2" label="Notes" value={l.notes} onChange={(e) => setLine(i, 'notes', e.target.value)} />
                <Button variant="ghost" className="sm:col-span-1" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>✕</Button>
                {errors[`line${i}`] && <p className="text-xs text-red-600 sm:col-span-12">{errors[`line${i}`]}</p>}
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { ...blank }])}>Add material</Button>
          </fieldset>
          <TextArea label="Notes" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} />
          <ActionError error={error} />
          <Button type="submit" size="lg" loading={busy}>Submit request</Button>
        </form>
      </Card>
    </>
  );
}
