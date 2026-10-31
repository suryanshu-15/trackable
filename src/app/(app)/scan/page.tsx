'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { Package } from '@/lib/types';
import { ActionError, Card, PageHeader } from '@/components/ui';
import { ScanBox } from '@/components/Scanner';

/** Scan-to-open: resolve a QR URL, token or printed package ID to the live server record. */
export default function ScanPage() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const open = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const pkg = await api<Package>('inventory/packages/resolve', { query: { code } });
      router.push(`/packages/${pkg.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Scan package" subtitle="Use a USB scanner, the camera, or type the package ID." />
      <Card>
        <ScanBox onScan={open} busy={busy} />
        <div className="mt-3"><ActionError error={error} /></div>
      </Card>
    </>
  );
}
