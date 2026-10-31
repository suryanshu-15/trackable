'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { use, useState } from 'react';
import { download } from '@/lib/api';
import { useApi, useFactories, useLocations, useMaterials, useSuppliers, useTestDefinitions, useWarehouses } from '@/lib/hooks';
import { humanize } from '@/lib/format';
import type { ReportMeta, ReportPage } from '@/lib/types';
import { ActionError, Button, Card, ErrorState, Loading, PageHeader, Pagination, Table, Td } from '@/components/ui';
import { SelectField, TextField, type Option } from '@/components/forms';
import { storableLocations } from '@/components/inventory/LocationPicker';

const ENUMS: Record<string, string[]> = {
  qc_status: ['NOT_REQUIRED', 'PENDING_SAMPLING', 'SAMPLED', 'TESTING', 'PASSED', 'FAILED', 'ON_HOLD', 'RETEST_REQUIRED'],
  result_status: ['PASS', 'FAIL', 'INCONCLUSIVE'],
  decision: ['RELEASED', 'REJECTED', 'ON_HOLD', 'RETEST', 'PARTIAL'],
  verification_status: ['PENDING', 'VERIFIED', 'DISCREPANT', 'EXCEPTION_ACCEPTED'],
  adjustment_type: ['INCREASE', 'DECREASE', 'CORRECTION'],
  disposal_type: ['SCRAP', 'SUPPLIER_RETURN'],
  action: ['CREATE', 'UPDATE', 'DELETE', 'TRANSITION', 'PRINT', 'ISSUE', 'RETURN', 'ADJUST', 'APPROVE', 'REJECT', 'OVERRIDE', 'UPLOAD', 'DOWNLOAD', 'LOGIN', 'LOGOUT', 'SCAN'],
};
const STATUS_BY_REPORT: Record<string, string[]> = {
  'inward-register': ['DRAFT', 'GATE_REGISTERED', 'AWAITING_UNLOADING', 'UNLOADING_IN_PROGRESS', 'VERIFICATION_PENDING', 'EXCEPTION', 'UNLOADED', 'PUTAWAY_IN_PROGRESS', 'STORED', 'CLOSED', 'CANCELLED'],
  'stock-adjustments': ['PENDING', 'APPROVED', 'REJECTED'],
};
const FLAGS = new Set(['available', 'discrepant_only', 'overrides_only']);

export default function ReportRunPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const meta = useApi<ReportMeta[]>('reports');
  const report = meta.data?.find((r) => r.key === key);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const needsPackage = key === 'package-lifecycle' && !applied.package;
  const data = useApi<ReportPage>(report && !needsPackage ? `reports/${key}` : null, { ...applied, page, page_size: 50 }, { placeholderData: keepPreviousData });
  const [exportError, setExportError] = useState<unknown>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const suppliers = useSuppliers();
  const materials = useMaterials();
  const factories = useFactories();
  const locations = useLocations();
  const warehouses = useWarehouses();
  const tests = useTestDefinitions();

  if (meta.error) return <ErrorState error={meta.error} />;
  if (!meta.data) return <Loading />;
  if (!report) return <ErrorState error={new Error('This report does not exist or your role cannot run it.')} />;

  const options = (f: string): Option[] | null => {
    if (f === 'supplier') return suppliers.items.map((s) => ({ value: s.id, label: s.name }));
    if (f === 'material') return materials.items.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }));
    if (f === 'factory') return factories.items.map((x) => ({ value: x.id, label: x.name }));
    if (f === 'warehouse') return warehouses.items.map((w) => ({ value: w.id, label: w.name }));
    if (f === 'location') return storableLocations(locations.items).map((l) => ({ value: l.id, label: l.full_path }));
    if (f === 'test') return tests.items.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }));
    if (f === 'status') return (STATUS_BY_REPORT[key] ?? []).map((s) => ({ value: s, label: humanize(s) }));
    if (ENUMS[f]) return ENUMS[f].map((s) => ({ value: s, label: humanize(s) }));
    if (FLAGS.has(f)) return [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
    return null;
  };

  const run = (e?: React.FormEvent) => { e?.preventDefault(); setPage(1); setApplied(Object.fromEntries(Object.entries(draft).filter(([, v]) => v))); };

  const doExport = async (format: 'csv' | 'xlsx') => {
    setExportError(null);
    setExporting(format);
    try { await download(`reports/${key}`, { ...applied, export: format }); }
    catch (e) { setExportError(e); }
    finally { setExporting(null); }
  };

  return (
    <>
      <PageHeader title={report.title} subtitle={report.description} actions={
        <>
          <Button variant="secondary" onClick={() => doExport('csv')} loading={exporting === 'csv'} disabled={needsPackage}>Export CSV</Button>
          <Button variant="secondary" onClick={() => doExport('xlsx')} loading={exporting === 'xlsx'} disabled={needsPackage}>Export Excel</Button>
        </>
      } />
      <Card className="mb-4">
        <form onSubmit={run} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {report.filters.map((f) => {
            const opts = options(f);
            const label = humanize(f);
            const set = (v: string) => setDraft((d) => ({ ...d, [f]: v }));
            if (f.startsWith('date_')) return <TextField key={f} label={label} type="date" value={draft[f] ?? ''} onChange={(e) => set(e.target.value)} />;
            if (opts) return <SelectField key={f} label={label} placeholder="All" value={draft[f] ?? ''} onChange={(e) => set(e.target.value)} options={opts} />;
            return <TextField key={f} label={f === 'package' ? 'Package ID' : f === 'actor' ? 'Actor (user id)' : label} type={f === 'days' ? 'number' : 'text'} value={draft[f] ?? ''} onChange={(e) => set(e.target.value)} />;
          })}
          <Button type="submit">Run</Button>
        </form>
        <div className="mt-2"><ActionError error={exportError} /></div>
      </Card>
      {needsPackage ? <p className="text-sm text-slate-500">Enter a package ID and run.</p> : data.error ? <ErrorState error={data.error} /> : !data.data ? <Loading /> : (
        <>
          <Table head={data.data.columns} empty={!data.data.results.length}>
            {data.data.results.map((row, i) => (
              <tr key={i}>{row.map((c, j) => <Td key={j}>{c === null || c === '' ? '—' : String(c)}</Td>)}</tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={data.data.total_pages} count={data.data.count} onPage={setPage} />
        </>
      )}
    </>
  );
}
