'use client';

import Link from 'next/link';
import { useApi } from '@/lib/hooks';
import type { ReportMeta } from '@/lib/types';
import { Empty, ErrorState, Loading, PageHeader } from '@/components/ui';

export default function ReportsPage() {
  const reports = useApi<ReportMeta[]>('reports');
  return (
    <>
      <PageHeader title="Reports" subtitle="Run on screen or export to CSV / Excel — exports use the same filters and permissions, and are audited." />
      {reports.error ? <ErrorState error={reports.error} /> : !reports.data ? <Loading /> : reports.data.length === 0 ? <Empty>No reports are available for your role.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reports.data.map((r) => (
            <Link key={r.key} href={`/reports/${r.key}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow">
              <h2 className="font-semibold text-slate-900">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{r.description}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
