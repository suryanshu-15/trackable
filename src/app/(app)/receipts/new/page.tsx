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
      <PageHeader title="New gate receipt" subtitle="Record the truck, invoice and weighment. Invoice lines are added next." />
      <Card>
        <ReceiptForm
          initial={initialReceipt()}
          submitLabel="Create receipt"
          onSubmit={async (data, acknowledge) => {
            const r = await api<Receipt>('receiving/goods-receipts', {
              method: 'POST', body: data, query: acknowledge ? { acknowledge_duplicate: 'true' } : undefined,
            });
            toast(`Receipt ${r.receipt_number} created.`);
            router.push(`/receipts/${r.id}`);
          }}
        />
      </Card>
    </>
  );
}
