'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import { useUnits } from '@/lib/hooks';
import { fmtQty } from '@/lib/format';
import type { Sample, TestRun } from '@/lib/types';
import { ConfirmDialog, Modal } from '../Dialog';
import { ActionError, Alert, Button } from '../ui';
import { SelectField, TextArea, TextField, compact, inputCls } from '../forms';
import { StatusBadge } from '../StatusBadge';

export function CollectDialog({ sample, open, onClose, onDone }: { sample: Sample; open: boolean; onClose: () => void; onDone: () => void }) {
  const units = useUnits();
  const [draws, setDraws] = useState<Record<string, string>>({});
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [condition, setCondition] = useState('');
  useEffect(() => { if (open) { setDraws({}); setQty(''); setUnit(''); setCondition(''); } }, [open]);

  return (
    <ConfirmDialog open={open} onClose={onClose} title={`Collect sample ${sample.sample_id}`} confirmLabel="Record collection"
      description="Quantities drawn from packages are deducted from stock through the movement ledger."
      onConfirm={async () => {
        const list = Object.entries(draws).filter(([, q]) => q !== '');
        if (list.some(([, q]) => !(Number(q) > 0))) throw new Error('Drawn quantities must be above zero.');
        if (qty && !unit) throw new Error('Choose the unit of the sampled quantity.');
        await post(`laboratory/samples/${sample.id}/collect`, {
          draws: list.map(([pkg, q]) => ({ package: pkg, quantity: q })),
          ...compact({ sampled_quantity: qty, sampled_unit: unit ? Number(unit) : '', sample_condition: condition }),
        });
        onDone();
      }}>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Drawn from each package (optional)</p>
        {sample.sample_packages.map((sp) => (
          <div key={sp.id} className="flex items-center gap-3 text-sm">
            <span className="w-40 font-mono">{sp.package_code}</span>
            <span className="w-28 text-slate-500">{fmtQty(sp.current_quantity, sp.unit_symbol)}</span>
            <input aria-label={`Quantity drawn from ${sp.package_code}`} type="number" step="any" min="0" className={`${inputCls} max-w-[8rem]`}
              value={draws[sp.package] ?? ''} onChange={(e) => setDraws((d) => ({ ...d, [sp.package]: e.target.value }))} />
            <span className="text-slate-500">{sp.unit_symbol}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Total sample quantity" type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
        <SelectField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} options={units.items.map((u) => ({ value: u.id, label: u.symbol }))} />
      </div>
      <TextField label="Sample condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
    </ConfirmDialog>
  );
}

type Entry = { numeric_result: string; text_result: string; boolean_result: '' | 'true' | 'false'; result_status: string; interpretation: string; remarks: string };

/** Result entry for the open test run. Pass / fail is evaluated by the server against the test limits. */
export function ResultsForm({ sample, run, onSaved }: { sample: Sample; run: TestRun; onSaved: () => void }) {
  const tests = sample.requested_tests_detail as { id: number; code: string; name: string; result_type: string; unit: string | null; min_value: number | null; max_value: number | null; acceptable_text_values: string[]; is_required: boolean }[];
  const initial = () => Object.fromEntries(tests.map((t) => {
    const r = run.results.find((x) => x.test_definition === t.id);
    return [t.id, {
      numeric_result: r?.numeric_result ?? '', text_result: r?.text_result ?? '',
      boolean_result: r?.boolean_result == null ? '' : String(r.boolean_result) as 'true' | 'false',
      result_status: '', interpretation: r?.interpretation ?? '', remarks: r?.remarks ?? '',
    } satisfies Entry];
  })) as Record<number, Entry>;
  const [values, setValues] = useState<Record<number, Entry>>(initial);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setValues(initial()), [run.id, run.results.length]);

  const set = (id: number, k: keyof Entry, v: string) => setValues((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const results = tests.flatMap((t) => {
      const v = values[t.id];
      if (t.result_type === 'NUMERIC' && v.numeric_result === '') return [];
      if (t.result_type === 'BOOLEAN' && v.boolean_result === '') return [];
      if (t.result_type === 'TEXT' && !v.text_result.trim()) return [];
      return [{
        test_definition: t.id,
        ...(t.result_type === 'NUMERIC' ? { numeric_result: v.numeric_result } : {}),
        ...(t.result_type === 'BOOLEAN' ? { boolean_result: v.boolean_result === 'true' } : {}),
        ...(t.result_type === 'TEXT' ? { text_result: v.text_result } : {}),
        ...compact({ result_status: v.result_status, interpretation: v.interpretation, remarks: v.remarks }),
      }];
    });
    if (!results.length) { setError(new Error('Enter at least one result.')); return; }
    setBusy(true);
    setError(null);
    try {
      await post(`laboratory/test-runs/${run.id}/results`, { results });
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 pr-3">Test</th><th className="pr-3">Specification</th><th className="pr-3">Result</th><th className="pr-3">Interpretation</th><th>Current</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {tests.map((t) => {
              const v = values[t.id];
              const current = run.results.find((r) => r.test_definition === t.id);
              const freeText = t.result_type === 'TEXT' && !t.acceptable_text_values?.length;
              return (
                <tr key={t.id} className="align-top">
                  <td className="py-2 pr-3"><div className="font-medium">{t.name}</div><div className="text-xs text-slate-500">{t.code}{t.is_required && ' · required'}</div></td>
                  <td className="py-2 pr-3 text-xs text-slate-600">
                    {t.result_type === 'NUMERIC' && <>{t.min_value ?? '−∞'} – {t.max_value ?? '∞'} {t.unit}</>}
                    {t.result_type === 'TEXT' && (t.acceptable_text_values?.length ? t.acceptable_text_values.join(' / ') : 'Analyst judgement')}
                    {t.result_type === 'BOOLEAN' && 'Pass / fail'}
                  </td>
                  <td className="py-2 pr-3">
                    {t.result_type === 'NUMERIC' && (
                      <div className="flex items-center gap-1">
                        <input aria-label={`${t.name} result`} type="number" step="any" className={`${inputCls} w-28`} value={v.numeric_result} onChange={(e) => set(t.id, 'numeric_result', e.target.value)} />
                        <span className="text-xs text-slate-500">{t.unit}</span>
                      </div>
                    )}
                    {t.result_type === 'BOOLEAN' && (
                      <select aria-label={`${t.name} result`} className={`${inputCls} w-28`} value={v.boolean_result} onChange={(e) => set(t.id, 'boolean_result', e.target.value)}>
                        <option value="">—</option><option value="true">Pass</option><option value="false">Fail</option>
                      </select>
                    )}
                    {t.result_type === 'TEXT' && (
                      <div className="space-y-1">
                        <input aria-label={`${t.name} result`} className={`${inputCls} w-44`} value={v.text_result} onChange={(e) => set(t.id, 'text_result', e.target.value)} list={`tv-${t.id}`} />
                        {!!t.acceptable_text_values?.length && <datalist id={`tv-${t.id}`}>{t.acceptable_text_values.map((x) => <option key={x} value={x} />)}</datalist>}
                        {freeText && (
                          <select aria-label={`${t.name} outcome`} className={`${inputCls} w-44`} value={v.result_status} onChange={(e) => set(t.id, 'result_status', e.target.value)}>
                            <option value="">Outcome…</option><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="INCONCLUSIVE">Inconclusive</option>
                          </select>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${t.name} interpretation`} className={`${inputCls} w-48`} placeholder={freeText ? 'Required' : 'Optional'} value={v.interpretation} onChange={(e) => set(t.id, 'interpretation', e.target.value)} />
                  </td>
                  <td className="py-2">{current ? <><StatusBadge status={current.result_status} /> <span className="text-xs text-slate-500">rev {current.revision}</span></> : <span className="text-xs text-slate-400">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ActionError error={error} />
      <Button type="submit" loading={busy}>Save results</Button>
      <p className="text-xs text-slate-500">Saving again records a new revision; earlier values stay in the audit trail.</p>
    </form>
  );
}

const DECISIONS = [
  { value: 'RELEASED', label: 'Release / approve' },
  { value: 'REJECTED', label: 'Reject' },
  { value: 'ON_HOLD', label: 'Hold (decide later)' },
  { value: 'RETEST', label: 'Retest required' },
  { value: 'PARTIAL', label: 'Partially accept' },
];

export function DispositionDialog({ sample, open, onClose, onDone }: { sample: Sample; open: boolean; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [released, setReleased] = useState<string[]>([]);
  const [remainder, setRemainder] = useState('REJECTED');
  const [retest, setRetest] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDecision(''); setReason(''); setNotes(''); setReleased([]); setRetest(''); setExpiry(''); setError(null); } }, [open]);
  // Partial acceptance only makes sense when a sample covers several packages.
  const decisions = sample.sample_packages.length > 1 ? DECISIONS : DECISIONS.filter((d) => d.value !== 'PARTIAL');

  const run = sample.test_runs.find((r) => r.is_current);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!decision) { setError(new Error('Choose a decision.')); return; }
    if (!reason.trim()) { setError(new Error('A reason is required.')); return; }
    if (decision === 'PARTIAL' && (!released.length || released.length === sample.sample_packages.length)) {
      setError(new Error('Choose some, but not all, packages to release.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post(`laboratory/samples/${sample.id}/disposition`, {
        decision, reason, ...compact({ notes, new_retest_date: retest, new_expiry_date: expiry }),
        ...(decision === 'PARTIAL' ? { released_packages: released, remainder_decision: remainder } : {}),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const failing = run?.results.filter((r) => r.result_status !== 'PASS') ?? [];
  return (
    <Modal open={open} onClose={onClose} title={`Quality decision — ${sample.sample_id}`} wide>
      <form onSubmit={submit} className="space-y-4">
        {run && <p className="text-sm">Run {run.run_number}: outcome <StatusBadge status={run.outcome === 'PASS' ? 'PASS' : run.outcome === 'FAIL' ? 'FAIL' : 'INCONCLUSIVE'} label={run.outcome} /></p>}
        {failing.length > 0 && <Alert tone="warn">Not passing: {failing.map((r) => `${r.test_code} (${r.result_status})`).join(', ')}. Release is blocked by the server.</Alert>}
        {(run?.missing_required_tests?.length ?? 0) > 0 && <Alert tone="warn">Missing required tests: {run!.missing_required_tests.join(', ')}</Alert>}
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Decision</legend>
          {decisions.map((d) => (
            <label key={d.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="decision" value={d.value} checked={decision === d.value} onChange={() => setDecision(d.value)} /> {d.label}
            </label>
          ))}
        </fieldset>
        {decision === 'PARTIAL' && (
          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-medium">Packages to release</p>
            {sample.sample_packages.map((sp) => (
              <label key={sp.id} className="flex items-center gap-2 text-sm font-mono">
                <input type="checkbox" checked={released.includes(sp.package)} onChange={(e) => setReleased((r) => (e.target.checked ? [...r, sp.package] : r.filter((x) => x !== sp.package)))} />
                {sp.package_code}
              </label>
            ))}
            <SelectField label="Remaining packages" value={remainder} onChange={(e) => setRemainder(e.target.value)} placeholder="Reject" options={[{ value: 'REJECTED', label: 'Reject' }, { value: 'ON_HOLD', label: 'Hold' }]} />
          </div>
        )}
        {(decision === 'RELEASED' || decision === 'PARTIAL') && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Next retest date" type="date" value={retest} onChange={(e) => setRetest(e.target.value)} hint="Required if the retest date has passed." />
            <TextField label="New expiry date" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} hint="Extends expiry after a successful retest; required if the bag has expired." />
          </div>
        )}
        <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
        <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <p className="text-xs text-slate-500">You cannot decide on results you entered or submitted yourself (separation of duties).</p>
        <ActionError error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={decision === 'REJECTED' ? 'danger' : decision === 'RELEASED' ? 'success' : 'primary'} loading={busy}>Record decision</Button>
        </div>
      </form>
    </Modal>
  );
}
