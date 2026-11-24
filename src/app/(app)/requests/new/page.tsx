'use client';

/**
 * Factory request for a client order: what the client wants made (product / grade and quantity) and
 * the materials it needs — either plain quantities, or a mixture given as each material's share (%).
 * Only lab-passed bags can be issued, so the available passed stock is shown for every material.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError, post } from '@/lib/api';
import { useApi, useDepartments, useFactories, useMaterials, useUnits } from '@/lib/hooks';
import { fmtQty } from '@/lib/format';
import type { MaterialRequest } from '@/lib/types';
import { ActionError, Button, Card, PageHeader, cx } from '@/components/ui';
import { Checkbox, TextArea, TextField, compact, validate } from '@/components/forms';
import { useToast } from '@/components/Toast';
import { MasterSelect } from '@/components/master/MasterSelect';

type Line = { material: string; percentage: string; quantity: string; unit: string; notes: string };
const blank: Line = { material: '', percentage: '', quantity: '', unit: '', notes: '' };
type Availability = { material: number; unit: string; available_quantity: string; in_stock: string };

export default function NewRequestPage() {
  const router = useRouter();
  const toast = useToast();
  const factories = useFactories();
  const departments = useDepartments();
  const materials = useMaterials();
  const units = useUnits();
  const [head, setHead] = useState({
    factory: '', department: '', client_name: '', product_name: '', product_quantity: '', product_unit: '',
    production_order: '', cost_centre: '', required_by: '', notes: '',
  });
  const [mixture, setMixture] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ ...blank }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const chosen = lines.map((l) => l.material).filter(Boolean);
  const avail = useApi<Availability[]>(chosen.length ? 'inventory/requests/availability' : null, { materials: chosen.join(',') });
  const available = (id: string) => (avail.data ?? []).filter((a) => String(a.material) === id);

  const tonne = units.items.find((u) => u.code === 'T');
  const productUnit = head.product_unit || (tonne ? String(tonne.id) : '');
  const productUnitSymbol = units.items.find((u) => String(u.id) === productUnit)?.symbol ?? '';
  const totalPct = lines.reduce((sum, l) => sum + (Number(l.percentage) || 0), 0);
  const share = (l: Line) => (Number(head.product_quantity) > 0 && Number(l.percentage) > 0
    ? Math.round(Number(head.product_quantity) * Number(l.percentage) / 100 * 10000) / 10000 : null);

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
    if (mixture) {
      if (validate.positive(head.product_quantity)) local.product_quantity = 'Enter how much of the product to make.';
      if (Math.abs(totalPct - 100) > 0.01) local.total = `The shares add up to ${Math.round(totalPct * 1000) / 1000} %; they must add up to 100 %.`;
    }
    lines.forEach((l, i) => {
      if (!l.material) local[`line${i}`] = 'Choose a material.';
      else if (mixture && validate.positive(l.percentage)) local[`line${i}`] = 'Enter the share in %.';
      else if (!mixture && validate.positive(l.quantity)) local[`line${i}`] = 'Enter a quantity above zero.';
      else if (!mixture && !l.unit) local[`line${i}`] = 'Choose a unit.';
    });
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<MaterialRequest>('inventory/requests', {
        ...compact({ ...head, product_quantity: '', product_unit: '' }),
        factory: Number(head.factory), department: head.department ? Number(head.department) : undefined,
        ...(head.product_quantity ? { product_quantity: head.product_quantity, product_unit: Number(productUnit) } : {}),
        lines: lines.map((l) => (mixture
          ? { material: Number(l.material), percentage: l.percentage, notes: l.notes }
          : { material: Number(l.material), quantity: l.quantity, unit: Number(l.unit), notes: l.notes })),
      });
      toast(`Request ${r.request_number} sent to the warehouse.`);
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
      <PageHeader title="New material request" subtitle="What the client wants made, and the materials it needs. The warehouse issues lab-passed bags only." />
      <Card>
        <form onSubmit={submit} className="space-y-6" noValidate>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <h2 className="text-sm font-semibold text-slate-800 sm:col-span-3">Client order</h2>
            <TextField label="Client" placeholder="e.g. Acme Constructions" value={head.client_name} onChange={(e) => setHead({ ...head, client_name: e.target.value })} />
            <TextField label="Product / grade to make" placeholder="e.g. Cement OPC 53 special, Alloy Fe-Al-Cu 60/30/10" value={head.product_name}
              onChange={(e) => setHead({ ...head, product_name: e.target.value })} className="sm:col-span-2" />
            <TextField label="Quantity to make" type="number" inputMode="decimal" step="any" min="0" value={head.product_quantity} error={errors.product_quantity}
              onChange={(e) => setHead({ ...head, product_quantity: e.target.value })} required={mixture} />
            <MasterSelect kind="unit" label="Unit" value={productUnit} onChange={(val) => setHead({ ...head, product_unit: val })}
              options={units.items.filter((u) => u.unit_type === 'WEIGHT').map((u) => ({ value: u.id, label: u.symbol }))} />
            <TextField label="Required by" type="datetime-local" value={head.required_by} onChange={(e) => setHead({ ...head, required_by: e.target.value })} />
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <h2 className="text-sm font-semibold text-slate-800 sm:col-span-4">Factory</h2>
            <MasterSelect kind="factory" label="Factory" required value={head.factory} error={errors.factory} onChange={(val) => setHead({ ...head, factory: val, department: '' })} options={factories.items.map((f) => ({ value: f.id, label: f.name }))} />
            <MasterSelect kind="department" defaults={{ factory: head.factory }} label="Department" value={head.department} onChange={(val) => setHead({ ...head, department: val })}
              options={departments.items.filter((d) => !head.factory || String(d.factory) === head.factory).map((d) => ({ value: d.id, label: d.name }))} />
            <TextField label="Production order" value={head.production_order} onChange={(e) => setHead({ ...head, production_order: e.target.value })} />
            <TextField label="Cost centre" value={head.cost_centre} onChange={(e) => setHead({ ...head, cost_centre: e.target.value })} />
          </section>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Materials needed</legend>
            <Checkbox label="This is a mixture — enter each material's share in %" checked={mixture} onChange={(e) => setMixture(e.target.checked)} />
            {lines.map((l, i) => {
              const a = l.material ? available(l.material) : [];
              const need = mixture ? share(l) : Number(l.quantity) || null;
              const short = need != null && a.length > 0 && a.every((x) => Number(x.available_quantity) < need);
              return (
                <div key={i} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-12">
                  <MasterSelect kind="material" className="sm:col-span-4" label={`Material ${i + 1}`} value={l.material} onChange={(val) => setLine(i, 'material', val)}
                    options={materials.items.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))} />
                  {mixture ? (
                    <>
                      <TextField className="sm:col-span-2" label="Share (%)" type="number" inputMode="decimal" step="any" min="0" max="100" value={l.percentage} onChange={(e) => setLine(i, 'percentage', e.target.value)} />
                      <div className="sm:col-span-2">
                        <span className="block text-sm font-medium text-slate-700">Quantity</span>
                        <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 text-sm">{need != null ? fmtQty(need, productUnitSymbol) : '—'}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <TextField className="sm:col-span-2" label="Quantity" type="number" inputMode="decimal" step="any" min="0" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                      <MasterSelect kind="unit" className="sm:col-span-2" label="Unit" value={l.unit} onChange={(val) => setLine(i, 'unit', val)} options={units.items.map((u) => ({ value: u.id, label: u.symbol }))} />
                    </>
                  )}
                  <TextField className="sm:col-span-3" label="Notes" placeholder="e.g. grade, size" value={l.notes} onChange={(e) => setLine(i, 'notes', e.target.value)} />
                  <Button variant="ghost" className="sm:col-span-1" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove material ${i + 1}`}>✕</Button>
                  {l.material && (
                    <p className={cx('text-xs sm:col-span-12', short ? 'text-amber-700' : 'text-slate-600')}>
                      Lab-passed, available now: {a.length ? a.map((x) => fmtQty(x.available_quantity, x.unit)).join(' + ') : 'none'}
                      {short && ' — not enough; the warehouse may issue part now and the rest later.'}
                    </p>
                  )}
                  {errors[`line${i}`] && <p className="text-xs text-red-600 sm:col-span-12">{errors[`line${i}`]}</p>}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { ...blank }])}>+ Add material</Button>
              {mixture && (
                <span className={cx('text-sm font-medium', Math.abs(totalPct - 100) <= 0.01 ? 'text-emerald-700' : 'text-amber-700')}>
                  Total: {Math.round(totalPct * 1000) / 1000} % {Math.abs(totalPct - 100) <= 0.01 ? '✓' : '(must be 100 %)'}
                </span>
              )}
            </div>
            {errors.total && <p className="text-sm text-red-600">{errors.total}</p>}
          </fieldset>
          <TextArea label="Notes for the warehouse" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} />
          <ActionError error={error} />
          <Button type="submit" size="lg" loading={busy}>Send request</Button>
        </form>
      </Card>
    </>
  );
}
