'use client';

import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
        size === 'sm' && 'px-2.5 py-1.5 text-xs',
        size === 'md' && 'px-3.5 py-2 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        BUTTON[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function LinkButton({ href, children, variant = 'secondary', size = 'md' }: {
  href: string; children: ReactNode; variant?: keyof typeof BUTTON; size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-3.5 py-2 text-sm',
        BUTTON[variant],
      )}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin text-current', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as ApiError | Error;
  const forbidden = e instanceof ApiError && e.status === 403;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-medium">{forbidden ? 'You do not have access to this.' : 'Something went wrong.'}</p>
      <p className="mt-1">{e?.message}</p>
      {e instanceof ApiError && e.requestId && (
        <p className="mt-1 text-xs text-red-600">Reference: {e.requestId}</p>
      )}
      {onRetry && !forbidden && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

/** Inline error for a failed action (form submit, transition). */
export function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError | Error;
  const fields = e instanceof ApiError ? Object.entries(e.fieldErrors()).filter(([k]) => k !== 'non_field_errors') : [];
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p>{e.message}</p>
      {fields.length > 1 && (
        <ul className="mt-1 list-inside list-disc text-xs">
          {fields.map(([k, v]) => <li key={k}><span className="font-medium">{k.replace(/_/g, ' ')}</span>: {v}</li>)}
        </ul>
      )}
      {e instanceof ApiError && e.requestId && <p className="mt-1 text-xs text-red-600">Reference: {e.requestId}</p>}
    </div>
  );
}

export function Empty({ children = 'Nothing here yet.' }: { children?: ReactNode }) {
  return <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Card({ title, actions, children, className }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cx('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONE = {
  neutral: 'border-slate-200',
  warn: 'border-amber-300 bg-amber-50',
  bad: 'border-red-300 bg-red-50',
  good: 'border-emerald-300 bg-emerald-50',
};

export function Stat({ label, value, href, tone = 'neutral', hint }: {
  label: string; value: ReactNode; href?: string; tone?: keyof typeof TONE; hint?: ReactNode;
}) {
  const body = (
    <div className={cx('h-full rounded-lg border bg-white p-4 shadow-sm', TONE[tone], href && 'transition hover:shadow-md')}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}

export function Alert({ tone = 'info', title, children }: {
  tone?: 'info' | 'warn' | 'bad' | 'good'; title?: ReactNode; children?: ReactNode;
}) {
  const cls = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    bad: 'border-red-300 bg-red-50 text-red-900',
    good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  }[tone];
  return (
    <div role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'} className={cx('rounded-md border px-4 py-3 text-sm', cls)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

export function DL({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-slate-900">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
            t.value === value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, count, onPage }: {
  page: number; totalPages: number; count: number; onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return <p className="mt-3 text-xs text-slate-500">{count} record{count === 1 ? '' : 's'}</p>;
  return (
    <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-xs text-slate-500">{count} records · page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

export function Table({ head, children, empty, emptyText = 'No records match.' }: { head: ReactNode[]; children: ReactNode; empty?: boolean; emptyText?: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {empty ? (
            <tr><td colSpan={head.length} className="px-3 py-8 text-center text-slate-500">{emptyText}</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('whitespace-nowrap px-3 py-2 align-top text-slate-800', className)}>{children}</td>;
}
