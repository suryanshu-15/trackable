'use client';

import { useRouter } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { ReceiptForm, initialReceipt } from '@/components/receiving/ReceiptForm';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import type { Receipt } from '@/lib/types';

export default function NewReceiptPage() {
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <PageHeader title="New gate receipt" subtitle="Record the truck, invoice and weighment. Invoice lines are added next — now or later from the draft." />
      <Card>
        <ReceiptForm
          initial={initialReceipt()}
          submitLabel="Save and add invoice lines"
          draftLabel="Save as draft"
          onCancel={() => router.push('/gate')}
          onSubmit={async (data, acknowledge, intent) => {
            const r = await api<Receipt>('receiving/goods-receipts', {
              method: 'POST', body: data, query: acknowledge ? { acknowledge_duplicate: 'true' } : undefined,
            });
            if (intent === 'draft') {
              toast(`Draft ${r.receipt_number} saved. Open it from Gate & receipts to finish.`);
              router.push('/gate');
            } else {
              toast(`Receipt ${r.receipt_number} created — add the invoice lines.`);
              router.push(`/receipts/${r.id}`);
            }
          }}
        />
      </Card>
    </>
  );
}
