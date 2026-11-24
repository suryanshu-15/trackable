'use client';

import { useRouter } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { GateEntryForm, initialGateEntry } from '@/components/receiving/GateEntryForm';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import type { Receipt } from '@/lib/types';

export default function NewGateEntryPage() {
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <PageHeader title="New gate entry" subtitle="Fill in the truck, invoice and materials — the same as the gate register. Weighing is done at receiving." />
      <Card>
        <GateEntryForm
          initial={initialGateEntry()}
          onCancel={() => router.push('/gate')}
          onSave={async (body, acknowledge, send) => {
            const r = await api<Receipt>('receiving/goods-receipts/gate-entry', {
              method: 'POST', body, query: acknowledge ? { acknowledge_duplicate: 'true' } : undefined,
            });
            toast(send ? `Gate entry ${r.gate_entry_number} saved and sent to receiving.` : `Draft ${r.gate_entry_number} saved.`);
            router.push('/gate');
          }}
        />
      </Card>
    </>
  );
}
