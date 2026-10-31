'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Package } from '@/lib/types';
import { ErrorState, Loading } from '@/components/ui';

/** Target of the QR code printed on labels (<FRONTEND_BASE_URL>/scan/<token>). */
export default function ScanTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<Package>('inventory/packages/resolve', { query: { code: token } })
      .then((pkg) => router.replace(`/packages/${pkg.id}`))
      .catch(setError);
  }, [token, router]);

  return error ? <ErrorState error={error} /> : <Loading label="Opening package…" />;
}
