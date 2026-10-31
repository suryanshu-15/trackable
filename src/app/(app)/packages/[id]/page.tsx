'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import type { Paginated } from '@/lib/api';
import { useApi, useMe, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDate, fmtDateTime, fmtQty, humanize } from '@/lib/format';
import type { MaterialIssue, Movement, Package, TimelineEvent } from '@/lib/types';
import { Alert, Button, Card, DL, ErrorState, LinkButton, Loading, PageHeader, Table, Td, Tabs } from '@/components/ui';
import { AvailabilityBadge, StatusBadge } from '@/components/StatusBadge';
import { Timeline } from '@/components/Timeline';
import { MoveDialog, SplitDialog, type MoveKind } from '@/components/inventory/PackageActions';
import { useToast } from '@/components/Toast';

export default function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const toast = useToast();
  const refresh = useRefresh();
  const pkg = useApi<Package>(`inventory/packages/${id}`);
  const [tab, setTab] = useState<'timeline' | 'movements' | 'issues' | 'labels'>('timeline');
  const timeline = useApi<TimelineEvent[]>(tab === 'timeline' ? `inventory/packages/${id}/timeline` : null);
  const movements = useApi<Movement[]>(tab === 'movements' ? `inventory/packages/${id}/movements` : null);
  const issues = useApi<Paginated<MaterialIssue>>(tab === 'issues' && me.data?.role !== 'FACTORY' ? 'inventory/issues' : null, { package: id, page_size: 100 });
  const [move, setMove] = useState<MoveKind | null>(null);
  const [split, setSplit] = useState(false);

  if (pkg.error) return <ErrorState error={pkg.error} onRetry={() => pkg.refetch()} />;
  if (!pkg.data || !me.data) return <Loading />;
  const p = pkg.data;
  const actions = p.allowed_actions;
  const role = me.data.role;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{p.package_id}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} label={p.status_display} />
            <StatusBadge status={p.qc_status} label={`QC: ${p.qc_status_display}`} />
            <AvailabilityBadge available={p.is_available} onHold={p.is_on_hold} recalled={p.is_recalled} />
            <span>{p.material_code} · {p.material_name}</span>
          </span>
        }
        actions={
          <>
            {actions.includes('putaway') && <Button onClick={() => setMove('putaway')}>Put away</Button>}
            {actions.includes('transfer') && <Button variant="secondary" onClick={() => setMove('transfer')}>Transfer</Button>}
            {actions.includes('split') && <Button variant="secondary" onClick={() => setSplit(true)}>Split / repack</Button>}
            {actions.includes('print_label') && <LinkButton variant="primary" href={`/labels?ids=${p.id}`}>Print label</LinkButton>}
            {actions.includes('reprint_label') && <LinkButton href={`/labels?ids=${p.id}`}>Reprint label</LinkButton>}
            {actions.includes('print_release_tag') && <LinkButton href={`/labels?ids=${p.id}&kind=release`}>Release tag</LinkButton>}
            {can.requestSample(role) && p.qc_status === 'PENDING_SAMPLING' && <LinkButton href={`/lab?sample=${p.id}`}>Request sample</LinkButton>}
          </>
        }
      />

      <div className="space-y-4">
        {p.blocking_reasons.length > 0 && (
          <Alert tone={p.is_on_hold || p.is_recalled || p.qc_status === 'FAILED' ? 'bad' : 'warn'} title="Not available for issue">
            <ul className="list-inside list-disc">{p.blocking_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </Alert>
        )}
        {p.status === 'CREATED' && <Alert tone="info">Print and attach the label to release this package for put-away.</Alert>}

        <Card title="Package">
          <DL items={[
            ['Quantity', <span key="q"><strong>{fmtQty(p.current_quantity, p.unit_symbol)}</strong> of {fmtQty(p.original_quantity, p.unit_symbol)} received</span>],
            ['Reserved', fmtQty(p.reserved_quantity, p.unit_symbol)],
            ['Location', <span key="l">{p.location_display ?? '—'}{p.location_is_quarantine && <span className="ml-1 text-amber-700">(quarantine)</span>}</span>],
            ['Lot / batch', <span key="b" className="font-mono">{p.batch_number || '—'}</span>],
            ['Grade', p.grade || '—'],
            ['Manufactured', fmtDate(p.manufacturing_date)],
            ['Expiry', fmtDate(p.expiry_date)],
            ['Retest', fmtDate(p.retest_date)],
            ['Received', fmtDateTime(p.received_at)],
            ['Supplier', p.supplier_name],
            ['Receipt', role === 'FACTORY' ? p.receipt_number : <Link key="r" className="font-mono text-brand-700 hover:underline" href={`/receipts/${p.receipt}`}>{p.receipt_number} / line {p.invoice_line_number}</Link>],
            ['Label', p.label_print_count ? `Printed ×${p.label_print_count}, first ${fmtDateTime(p.label_printed_at)}` : 'Not printed'],
          ]} />
          {p.parent_package && (
            <p className="mt-3 text-sm">Split from <Link className="font-mono text-brand-700 hover:underline" href={`/packages/${p.parent_package}`}>{p.parent_package_code}</Link>{p.split_reason && ` — ${p.split_reason}`}</p>
          )}
          {p.child_packages.length > 0 && (
            <p className="mt-2 text-sm">Split into: {p.child_packages.map((c, i) => (
              <span key={c.id}>{i > 0 && ', '}<Link className="font-mono text-brand-700 hover:underline" href={`/packages/${c.id}`}>{c.package_id}</Link></span>
            ))}</p>
          )}
        </Card>

        <Card title="Quality">
          {p.samples.length === 0 ? <p className="text-sm text-slate-500">No lab samples include this package{p.qc_status === 'NOT_REQUIRED' ? ' (QC not required for this material)' : ''}.</p> : (
            <ul className="space-y-1 text-sm">
              {p.samples.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <Link className="font-mono text-brand-700 hover:underline" href={`/lab/samples/${s.id}`}>{s.sample_id}</Link>
                  <StatusBadge status={s.status} />
                  {s.drawn_quantity && <span className="text-slate-500">drew {fmtQty(s.drawn_quantity, p.unit_symbol)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'timeline', label: 'Lifecycle' }, { value: 'movements', label: 'Movements' },
            { value: 'issues', label: 'Issues' }, { value: 'labels', label: `Label history (${p.label_events.length})` },
          ]} />
          {tab === 'timeline' && (timeline.data ? <Timeline events={timeline.data} /> : timeline.error ? <ErrorState error={timeline.error} /> : <Loading />)}
          {tab === 'movements' && (movements.data ? (
            <Table head={['When', 'Reason', 'From', 'To', 'Change', 'Balance', 'By', 'Reference']} empty={!movements.data.length}>
              {movements.data.map((m) => (
                <tr key={m.id}>
                  <Td>{fmtDateTime(m.created_at)}</Td>
                  <Td>{m.reason_display}</Td>
                  <Td>{m.from_location_display ?? '—'}</Td>
                  <Td>{m.to_location_display ?? '—'}</Td>
                  <Td className={Number(m.quantity_delta) < 0 ? 'text-red-700' : Number(m.quantity_delta) > 0 ? 'text-emerald-700' : ''}>{Number(m.quantity_delta) > 0 ? '+' : ''}{fmtQty(m.quantity_delta, m.unit_symbol)}</Td>
                  <Td>{fmtQty(m.balance_after, m.unit_symbol)}</Td>
                  <Td>{m.performed_by_name}</Td>
                  <Td className="font-mono text-xs">{m.reference_id || '—'}</Td>
                </tr>
              ))}
            </Table>
          ) : <Loading />)}
          {tab === 'issues' && (role === 'FACTORY' ? <p className="text-sm text-slate-500">See your issues under Issues.</p> : issues.data ? (
            <Table head={['Issue', 'Date', 'Factory', 'Order', 'Quantity', 'Status']} empty={!issues.data.results.length}>
              {issues.data.results.map((iss) => (
                <tr key={iss.id}>
                  <Td><Link className="font-mono text-brand-700 hover:underline" href={`/issues/${iss.id}`}>{iss.issue_number}</Link></Td>
                  <Td>{fmtDateTime(iss.issue_datetime)}</Td>
                  <Td>{iss.factory_name}{iss.department_name && ` / ${iss.department_name}`}</Td>
                  <Td>{iss.production_order || '—'}</Td>
                  <Td>{fmtQty(iss.issue_lines.filter((l) => l.package === p.id).reduce((a, l) => a + Number(l.issued_quantity), 0), p.unit_symbol)}</Td>
                  <Td><StatusBadge status={iss.status} /></Td>
                </tr>
              ))}
            </Table>
          ) : <Loading />)}
          {tab === 'labels' && (
            <Table head={['When', 'Event', 'By', 'Printer', 'Reason']} empty={!p.label_events.length}>
              {p.label_events.map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDateTime(e.created_at)}</Td>
                  <Td>{humanize(e.event_type)}</Td>
                  <Td>{e.printed_by_name}</Td>
                  <Td>{e.printer_reference || '—'}</Td>
                  <Td>{e.reprint_reason || '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {move && <MoveDialog kind={move} pkg={p} open onClose={() => setMove(null)} onDone={(np) => { toast(`${np.package_id} is now at ${np.location_display}.`); refresh(); }} />}
      <SplitDialog pkg={p} open={split} onClose={() => setSplit(false)} onDone={() => { toast('Package split. Print labels for the new packages.'); refresh(); }} />
    </>
  );
}
