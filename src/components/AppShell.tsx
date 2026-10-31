'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useMe } from '@/lib/hooks';
import { navFor } from '@/lib/roles';
import { ErrorState, Loading, cx } from './ui';
import { inputCls } from './forms';

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const unread = useApi<{ unread_count: number }>(me.data ? 'notifications/unread-count' : null, undefined, { refetchInterval: 60_000 });

  useEffect(() => setMenuOpen(false), [pathname]);

  if (me.isLoading) return <div className="p-6"><Loading /></div>;
  if (me.error || !me.data) return <div className="p-6"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;

  const user = me.data;
  const items = navFor(user.role);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const logout = async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    window.location.assign('/login');
  };

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx('rounded-md px-3 py-2 text-sm font-medium', active ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className={cx('no-print fixed inset-y-0 left-0 z-40 w-60 overflow-y-auto bg-slate-900 transition-transform lg:translate-x-0', menuOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-14 items-center px-6 text-lg font-semibold text-white">Trackable</div>
        {nav}
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button type="button" className="rounded p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
        <form onSubmit={search} role="search" className="flex-1">
          <label htmlFor="global-search" className="sr-only">Search</label>
          <input
            id="global-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search receipt, invoice, truck, package, lot, sample, issue, order…"
            className={cx(inputCls, 'max-w-xl')}
          />
        </form>
        <Link href="/notifications" className="relative rounded p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread.data?.unread_count ?? 0} unread)`}>
          🔔
          {!!unread.data?.unread_count && (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{unread.data.unread_count}</span>
          )}
        </Link>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-slate-900">{user.display_name}</div>
          <div className="text-xs text-slate-500">{user.role_display}</div>
        </div>
        <button type="button" onClick={logout} className="rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Sign out</button>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
