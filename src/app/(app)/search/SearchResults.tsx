'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import type { SearchResponse } from '@/lib/types';
import { Card, Empty, ErrorState, Loading, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';

const GROUPS: Record<string, { title: string; href: (id: string) => string }> = {
  receipts: { title: 'Receipts', href: (id) => `/receipts/${id}` },
  packages: { title: 'Packages', href: (id) => `/packages/${id}` },
  samples: { title: 'Lab samples', href: (id) => `/lab/samples/${id}` },
  issues: { title: 'Issues', href: (id) => `/issues/${id}` },
  requests: { title: 'Material requests', href: (id) => `/requests/${id}` },
  materials: { title: 'Materials', href: (id) => `/packages?material=${id}` },
  suppliers: { title: 'Suppliers', href: () => '/gate' },
};

/** Global search: receipt, invoice, truck, supplier, material, package / QR, sample, lot, issue, factory order. */
export function SearchResults() {
  const q = useSearchParams().get('q') ?? '';
  const res = useApi<SearchResponse>(q.length >= 2 ? 'search' : null, { q });
  const groups = Object.entries(res.data?.results ?? {}).filter(([, hits]) => hits && hits.length);

  return (
    <>
      <PageHeader title={`Search: “${q}”`} />
      {q.length < 2 ? <Empty>Type at least two characters.</Empty> : res.error ? <ErrorState error={res.error} /> : !res.data ? <Loading /> : groups.length === 0 ? <Empty>Nothing matches “{q}”.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(([group, hits]) => {
            const g = GROUPS[group] ?? { title: group, href: () => '#' };
            return (
              <Card key={group} title={`${g.title} (${hits!.length})`}>
                <ul className="divide-y divide-slate-100">
                  {hits!.map((h) => (
                    <li key={h.id} className="py-2">
                      <Link href={g.href(h.id)} className="flex items-center justify-between gap-2 hover:text-brand-700">
                        <span>
                          <span className="font-mono font-medium">{h.label}</span>
                          <span className="block text-xs text-slate-500">{h.detail}</span>
                        </span>
                        <span className="flex gap-1">{h.status && <StatusBadge status={h.status} />}{h.qc_status && <StatusBadge status={h.qc_status} />}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
