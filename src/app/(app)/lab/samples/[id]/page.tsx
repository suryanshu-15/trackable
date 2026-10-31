'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { post } from '@/lib/api';
import { useApi, useRefresh } from '@/lib/hooks';
import { fmtDate, fmtDateTime, fmtQty, humanize } from '@/lib/format';
import type { Sample, TimelineEvent } from '@/lib/types';
import { Alert, Button, Card, DL, ErrorState, Loading, PageHeader, Table, Td } from '@/components/ui';
import { Badge, StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';
import { Timeline } from '@/components/Timeline';
import { Attachments } from '@/components/Attachments';
import { useToast } from '@/components/Toast';
import { CollectDialog, DispositionDialog, ResultsForm } from '@/components/lab/SampleForms';

type Simple = 'receive' | 'start_testing' | 'submit_results' | 'cancel';
type SimpleAction = { path: (sampleId: string, runId?: string) => string; label: string; reason?: 'required' | 'optional'; variant?: 'danger'; help: string };
const SIMPLE: Record<Simple, SimpleAction> = {
  receive: { path: (id) => `laboratory/samples/${id}/receive`, label: 'Receive in lab', help: 'Confirms the physical sample has arrived in the laboratory.' },
  start_testing: { path: (id) => `laboratory/samples/${id}/start-testing`, label: 'Start testing', reason: 'optional', help: 'Opens a new test run for result entry.' },
  submit_results: { path: (_id, run) => `laboratory/test-runs/${run}/submit`, label: 'Submit for review', help: 'Locks this run. A reviewer who did not enter the results makes the decision.' },
  cancel: { path: (id) => `laboratory/samples/${id}/cancel`, label: 'Cancel sample', reason: 'required', variant: 'danger', help: 'Packages return to pending sampling.' },
};

export default function SamplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const refresh = useRefresh();
  const sample = useApi<Sample>(`laboratory/samples/${id}`);
  const timeline = useApi<TimelineEvent[]>(`laboratory/samples/${id}/timeline`);
  const [simple, setSimple] = useState<Simple | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [deciding, setDeciding] = useState(false);

  if (sample.error) return <ErrorState error={sample.error} onRetry={() => sample.refetch()} />;
  if (!sample.data) return <Loading />;
  const s = sample.data;
  const actions = s.allowed_actions;
  const current = s.test_runs.find((r) => r.is_current);
  const a = simple ? SIMPLE[simple] : null;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{s.sample_id}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={s.status} label={s.status_display} /> {s.material_code} · {s.material_name} · lot {s.batch_number || '—'} {s.is_overdue && <Badge tone="red">Overdue</Badge>}</span>}
        actions={
          <>
            {actions.includes('collect') && <Button onClick={() => setCollecting(true)}>Collect sample</Button>}
            {(['receive', 'start_testing', 'submit_results'] as Simple[]).filter((k) => actions.includes(k)).map((k) => (
              <Button key={k} onClick={() => setSimple(k)} disabled={k === 'submit_results' && !current?.results.length}>{SIMPLE[k].label}</Button>
            ))}
            {actions.includes('decide') && <Button variant="success" onClick={() => setDeciding(true)}>Record decision</Button>}
            {actions.includes('cancel') && <Button variant="danger" onClick={() => setSimple('cancel')}>Cancel</Button>}
          </>
        }
      />
      <div className="space-y-4">
        {s.status === 'RESULTS_SUBMITTED' && !actions.includes('decide') && <Alert tone="info">Results are awaiting review by a lab reviewer / quality manager.</Alert>}
        <Card title="Sample">
          <DL items={[
            ['Requested', fmtDateTime(s.created_at)], ['Sampled', `${fmtDateTime(s.sampled_at)}${s.sampled_by_name ? ` by ${s.sampled_by_name}` : ''}`],
            ['Received in lab', fmtDateTime(s.received_by_lab_at)], ['Required by', fmtDateTime(s.required_by)],
            ['Quantity', s.sampled_quantity ? fmtQty(s.sampled_quantity, s.sampled_unit_symbol) : '—'], ['Condition', s.sample_condition || '—'],
            ['Laboratory', s.laboratory_name || '—'], ['Analyst', s.analyst_name || '—'], ['Completed', fmtDateTime(s.completed_at)],
          ]} />
          {s.specification && <p className="mt-3 text-sm"><span className="font-medium">Specification:</span> {s.specification}</p>}
          {s.cancel_reason && <p className="mt-2 text-sm text-red-700">Cancelled: {s.cancel_reason}</p>}
        </Card>

        <Card title={`Packages (${s.sample_packages.length})`}>
          <Table head={['Package', 'Lot', 'Quantity', 'Drawn', 'QC', 'Receipt']}>
            {s.sample_packages.map((sp) => (
              <tr key={sp.id}>
                <Td><Link className="font-mono text-brand-700 hover:underline" href={`/packages/${sp.package}`}>{sp.package_code}</Link></Td>
                <Td className="font-mono">{sp.batch_number}</Td>
                <Td>{fmtQty(sp.current_quantity, sp.unit_symbol)}</Td>
                <Td>{sp.drawn_quantity ? fmtQty(sp.drawn_quantity, sp.unit_symbol) : '—'}</Td>
                <Td><StatusBadge status={sp.qc_status} /></Td>
                <Td className="font-mono text-xs">{sp.receipt_number}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        {actions.includes('enter_results') && current && (
          <Card title={`Enter results — run ${current.run_number}`}>
            <ResultsForm sample={s} run={current} onSaved={() => { toast('Results saved.'); refresh(); }} />
          </Card>
        )}

        <Card title="Test runs">
          {s.test_runs.length === 0 ? <p className="text-sm text-slate-500">Testing has not started.</p> : s.test_runs.map((run) => (
            <div key={run.id} className="mb-5 last:mb-0">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">Run {run.run_number}</span><StatusBadge status={run.status} />
                {run.is_current && <Badge tone="blue">current</Badge>}
                <span className="text-slate-500">outcome {humanize(run.outcome)} · analyst {run.analyst_name || '—'}
                  {run.submitted_at && ` · submitted ${fmtDateTime(run.submitted_at)} by ${run.submitted_by_name}`}
                  {run.reviewed_at && ` · reviewed by ${run.reviewed_by_name}`}</span>
              </p>
              {run.missing_required_tests.length > 0 && <p className="mb-2 text-xs text-amber-700">Missing required: {run.missing_required_tests.join(', ')}</p>}
              <Table head={['Test', 'Result', 'Limits', 'Status', 'Interpretation', 'Rev', 'Entered']} empty={!run.results.length} emptyText="No results entered yet.">
                {run.results.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.test_name}<div className="text-xs text-slate-500">{r.test_code}</div></Td>
                    <Td className="font-medium">{r.numeric_result != null ? fmtQty(r.numeric_result, r.result_unit_symbol) : r.boolean_result != null ? (r.boolean_result ? 'Pass' : 'Fail') : r.text_result}</Td>
                    <Td className="text-xs">{r.min_limit != null || r.max_limit != null ? `${r.min_limit ?? '−∞'} – ${r.max_limit ?? '∞'}` : (r.acceptable_values as string[] | null)?.join(' / ') || '—'}</Td>
                    <Td><StatusBadge status={r.result_status} /></Td>
                    <Td className="whitespace-normal">{r.interpretation || '—'}</Td>
                    <Td>{r.revision}</Td>
                    <Td className="text-xs">{r.entered_by_name}<div>{fmtDateTime(r.entered_at)}</div></Td>
                  </tr>
                ))}
              </Table>
            </div>
          ))}
        </Card>

        {s.dispositions.length > 0 && (
          <Card title="Quality decisions">
            <ul className="space-y-3 text-sm">
              {s.dispositions.map((d) => (
                <li key={d.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={d.decision} label={d.decision_display} /> run {d.run_number} · {d.decided_by_name} · {fmtDateTime(d.decided_at)}</div>
                  <p className="mt-1">{d.reason}</p>
                  {(d.released_package_ids as string[]).length > 0 && <p className="mt-1 text-xs text-slate-600">Released: <span className="font-mono">{(d.released_package_ids as string[]).join(', ')}</span></p>}
                  {d.remainder_decision && <p className="text-xs text-slate-600">Remainder: {humanize(d.remainder_decision)}</p>}
                  {d.new_retest_date && <p className="text-xs text-slate-600">New retest date: {fmtDate(d.new_retest_date)}</p>}
                  {d.new_expiry_date && <p className="text-xs text-slate-600">Expiry extended to {fmtDate(d.new_expiry_date)}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Reports & certificates">
          <Attachments docs={s.attachments} uploadPath={`laboratory/samples/${s.id}/attachments`} types={['REPORT', 'COA', 'OTHER']}
            canUpload={actions.includes('attach_report')} onUploaded={refresh} />
        </Card>

        <Card title="History">{timeline.data ? <Timeline events={timeline.data} /> : <Loading />}</Card>
      </div>

      <ConfirmDialog open={!!a} onClose={() => setSimple(null)} title={a?.label} description={a?.help} confirmLabel={a?.label}
        reason={a?.reason} reasonLabel={simple === 'start_testing' ? 'Notes' : 'Reason'} variant={a?.variant}
        onConfirm={async (text) => {
          await post(a!.path(s.id, current?.id), simple === 'cancel' ? { reason: text } : { notes: text });
          toast(`${a!.label}: done.`);
          refresh();
        }} />
      <CollectDialog sample={s} open={collecting} onClose={() => setCollecting(false)} onDone={() => { toast('Sample collected.'); refresh(); }} />
      <DispositionDialog sample={s} open={deciding} onClose={() => setDeciding(false)} onDone={() => { toast('Decision recorded; package QC statuses updated.'); refresh(); }} />
    </>
  );
}
