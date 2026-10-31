'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/ui';
import { useMe } from '@/lib/hooks';
import { LANDING } from '@/lib/roles';

/** Send each role to its own dashboard. */
export default function Home() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.data) router.replace(LANDING[me.data.role] || '/packages');
  }, [me.data, router]);
  return <Loading />;
}
