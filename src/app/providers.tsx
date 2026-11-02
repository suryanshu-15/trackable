'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { ToastProvider } from '@/components/Toast';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Inventory is shared state: keep views fresh, never trust stale local copies.
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
          },
        },
      }),
  );
  // Scrolling the page with the cursor still in a number field silently changes its value
  // (250 → 248, 0.25 → 0). Leave the field instead, so the wheel only scrolls.
  useEffect(() => {
    const onWheel = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number') el.blur();
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
