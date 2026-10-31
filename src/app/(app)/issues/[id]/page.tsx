'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { post } from '@/lib/api';
import { useApi, useMe, useRefresh } from '@/lib/hooks';
import { can } from '@/lib/roles';
import { fmtDateTime, fmtQty } from '@/lib/format';
import type { MaterialIssue } from '@/lib/types';
import { Alert, Button, Card, DL, ErrorState, Loading, PageHeader, Table, Td } from '@/components/ui';
import { Badge, StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Dialog';
import { Checkbox, TextField } from '@/components/forms';
import { useToast } from '@/components/Toast';

type Line = MaterialIssue['issue_lines'][number];

export default function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const toast = useToast();
  const refresh = useRefresh();
  const issue = useApi<MaterialIssue>(`inventory/issues/${id}`);
  const [ack, setAck] = useState(false);
  const [returning, setReturning] = useState<Line | null>(null);

  if (issue.error) return <ErrorState error={issue.error} onRetry={() => issue.refetch()} />;
  if (!issue.data || !me.data) return <Loading />;
  const i = issue.data;
  const role = me.data.role;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{i.issue_number}</span>}
        subtitle={<span className="flex items-center gap-2"><StatusBadge status={i.status} /> {i.factory_name}{i.department_name && ` / ${i.department_name}`}{i.fifo_override && <Badge tone="amber">FIFO override</Badge>}</span>}
        actions={i.status === 'ISSUED' && can.acknowledgeIssue(role) && <Button variant="success" onClick={() => setAck(true)}>Acknowledge receipt</Button>}
      />
      <div className="space-y-4">
        {i.fifo_override && (
          <Alert tone="warn" title="Issued out of FIFO / FEFO order">
            {i.fifo_override_reason}{i.override_approved_by_name && ` — authorised by ${i.override_approved_by_name}`}
          </Alert>
        )}
        <Card title="Issue">
          <DL items={[
            ['Issued', fmtDateTime(i.issue_datetime)], ['Issued by', i.issued_by_name], ['Received by', i.received_by_display || '—'],
            ['Request', i.material_request ? <Link key="r" className="font-mono text-brand-700 hover:underline" href={`/requests/${i.material_request}`}>{i.request_number}</Link> : '—'],
            ['Production order', i.production_order || '—'], ['Reference', i.reference || '—'],
            ['Acknowledged', i.acknowledged_at ? `${fmtDateTime(i.acknowledged_at)} by ${i.acknowledged_by_name}` : 'Not yet'],
            ['Notes', i.notes || '—'],
          ]} />
        </Card>
        <Card title="Packages issued">
          <Table head={['Package', 'Material', 'Lot', 'Quantity', 'QC at issue', 'FIFO', 'Returned', '']}>
            {i.issue_lines.map((l) => (
              <tr key={l.id}>
                <Td>{role === 'FACTORY' ? <span className="font-mono">{l.package_code}</span> : <Link className="font-mono text-brand-700 hover:underline" href={`/packages/${l.package}`}>{l.package_code}</Link>}</Td>
                <Td>{l.material_code}</Td>
                <Td className="font-mono">{l.batch_number}</Td>
                <Td>{fmtQty(l.issued_quantity, l.unit_symbol)}</Td>
                <Td><StatusBadge status={l.qc_status_at_issue} /></Td>
                <Td>{l.fifo_compliant ? '✓' : <Badge tone="amber">out of order</Badge>}</Td>
                <Td>{Number(l.returned_quantity) > 0 ? fmtQty(l.returned_quantity, l.unit_symbol) : '—'}</Td>
                <Td>{can.receiveReturn(role) && Number(l.returned_quantity) < Number(l.issued_quantity) && <Button size="sm" variant="secondary" onClick={() => setReturning(l)}>Receive return</Button>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <ConfirmDialog open={ack} onClose={() => setAck(false)} title="Acknowledge receipt" variant="success" confirmLabel="I received this material"
        description="Confirm the factory physically received every package listed."
        onConfirm={async () => { await post(`inventory/issues/${i.id}/acknowledge`); toast('Receipt acknowledged.'); refresh(); }} />
      {returning && <ReturnDialog line={returning} onClose={() => setReturning(null)} onDone={() => { toast('Return recorded. The returned material is a new package — print its label.'); refresh(); }} />}
    </>
  );
}

function ReturnDialog({ line, onClose, onDone }: { line: Line; onClose: () => void; onDone: () => void }) {
  const max = Number(line.issued_quantity) - Number(line.returned_quantity);
  const [qty, setQty] = useState(String(max));
  const [by, setBy] = useState('');
  const [qc, setQc] = useState(true);
  return (
    <ConfirmDialog open onClose={onClose} title={`Return from ${line.package_code}`} confirmLabel="Record return" reason="required"
      description="Returned material becomes a new package and is blocked until the lab (or an inspection) clears it."
      onConfirm={async (reason) => {
        if (!(Number(qty) > 0) || Number(qty) > max) throw new Error(`Return between 0 and ${max} ${line.unit_symbol}.`);
        await post('inventory/returns', { issue_line: line.id, returned_quantity: qty, reason, returned_by_name: by, requires_qc: qc });
        onDone();
      }}>
      <div className="grid grid-cols-2 gap-3">
        <TextField label={`Quantity (max ${fmtQty(max, line.unit_symbol)})`} type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
        <TextField label="Returned by" value={by} onChange={(e) => setBy(e.target.value)} />
      </div>
      <Checkbox label="Send to lab for retest (otherwise held for inspection)" checked={qc} onChange={(e) => setQc(e.target.checked)} />
    </ConfirmDialog>
  );
}
