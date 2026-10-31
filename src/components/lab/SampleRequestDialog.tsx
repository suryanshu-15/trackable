'use client';

import { useQueries } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, post } from '@/lib/api';
import { useMaterials, usePolicy, useTestDefinitions } from '@/lib/hooks';
import { fmtQty } from '@/lib/format';
import type { Package, Sample } from '@/lib/types';
import { Modal } from '../Dialog';
import { ActionError, Alert, Button } from '../ui';
import { Checkbox, TextArea, TextField, compact } from '../forms';

export function SampleRequestDialog({ open, onClose, packageIds, onCreated }: {
  open: boolean; onClose: () => void; packageIds: string[]; onCreated: (sampleIds: string[]) => void;
}) {
  const materials = useMaterials();
  const tests = useTestDefinitions();
  // Business rule (default): one sample per bag; its result applies to that bag only.
  const scope = usePolicy().data?.['lab.sample_scope'];
  const perPackage = scope !== 'LOT' && scope !== 'PACKAGE';
  const pkgs = useQueries({ queries: (open ? packageIds : []).map((id) => ({ queryKey: [`inventory/packages/${id}`, {}], queryFn: () => api<Package>(`inventory/packages/${id}`) })) });
  const [chosenTests, setChosenTests] = useState<number[]>([]);
  const [requiredBy, setRequiredBy] = useState('');
  const [lab, setLab] = useState('');
  const [spec, setSpec] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const loaded = pkgs.every((q) => q.data) ? pkgs.map((q) => q.data!) : [];
  const materialIds = [...new Set(loaded.map((p) => p.material))];
  const material = materials.items.find((m) => m.id === materialIds[0]);
  const lots = [...new Set(loaded.map((p) => p.batch_number))];

  // Default to the material's configured test requirements.
  useEffect(() => {
    if (open && material) setChosenTests(material.test_requirements.map((t) => t.test_definition));
  }, [open, material]);
  useEffect(() => { if (open) setError(null); }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (materialIds.length > 1) { setError(new Error('Packages of different materials cannot share a sample.')); return; }
    setBusy(true);
    setError(null);
    const common = { requested_tests: chosenTests, ...compact({ required_by: requiredBy, laboratory_name: lab, specification: spec, notes }) };
    const created: string[] = [];
    try {
      for (const group of perPackage ? packageIds.map((id) => [id]) : [packageIds]) {
        created.push((await post<Sample>('laboratory/samples', { packages: group, ...common })).id);
      }
      onCreated(created);
      onClose();
    } catch (err) {
      // Samples already created stay (each is its own record); report how far we got.
      if (created.length) onCreated(created);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request lab sample" wide>
      <form onSubmit={submit} className="space-y-4">
        {loaded.length < packageIds.length ? <p className="text-sm text-slate-500">Loading packages…</p> : (
          <div className="text-sm">
            <p className="font-medium">{material?.code} — {material?.name}</p>
            <ul className="mt-1 font-mono text-xs text-slate-600">{loaded.map((p) => <li key={p.id}>{p.package_id} · lot {p.batch_number || '—'} · {fmtQty(p.current_quantity, p.unit_symbol)}</li>)}</ul>
            {materialIds.length > 1 && <Alert tone="bad">The selection mixes materials. Sample each material separately.</Alert>}
            {perPackage
              ? packageIds.length > 1 && <Alert tone="info">One sample per bag: {packageIds.length} separate samples will be requested.</Alert>
              : lots.length > 1 && <Alert tone="warn">The selection spans {lots.length} lots. Check that this matches the sampling plan.</Alert>}
          </div>
        )}
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Tests</legend>
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {tests.items.map((t) => (
              <Checkbox key={t.id} label={`${t.code} — ${t.name}`} checked={chosenTests.includes(t.id)}
                onChange={(e) => setChosenTests((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))} />
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Results required by" type="datetime-local" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
          <TextField label="Laboratory" value={lab} onChange={(e) => setLab(e.target.value)} />
        </div>
        <TextArea label="Specification" value={spec} onChange={(e) => setSpec(e.target.value)} rows={2} />
        <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <ActionError error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!packageIds.length}>{perPackage && packageIds.length > 1 ? `Request ${packageIds.length} samples` : 'Request sample'}</Button>
        </div>
      </form>
    </Modal>
  );
}
