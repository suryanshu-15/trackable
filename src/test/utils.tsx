import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

type Route = { status?: number; body: unknown; headers?: Record<string, string> };

/** Replace fetch with a table of BFF routes (matched on path prefix, method optional). */
export function mockFetch(routes: Record<string, Route | ((init?: RequestInit) => Route)>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const method = init?.method ?? 'GET';
    const key = Object.keys(routes).sort((a, b) => b.length - a.length)
      .find((k) => { const [m, p] = k.includes(' ') ? k.split(' ') : [null, k]; return (!m || m === method) && url.startsWith(p); });
    if (!key) return new Response(JSON.stringify({ error: 'not_found', message: `No mock for ${method} ${url}` }), { status: 404 });
    const r = typeof routes[key] === 'function' ? (routes[key] as (i?: RequestInit) => Route)(init) : (routes[key] as Route);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...r.headers } });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

export const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, total_pages: 1, current_page: 1, results });
