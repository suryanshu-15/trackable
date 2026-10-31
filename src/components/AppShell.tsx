'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useMe } from '@/lib/hooks';
import { navSections } from '@/lib/roles';
import { ErrorState, Loading, cx } from './ui';
import { inputCls } from './forms';
import { Icons } from './icons';
import { Logo } from './brand/Logo';

function initials(name: string) {
  return name.replace(/\[.*?\]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

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
  const sections = navSections(user.role);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const logout = async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    window.location.assign('/login');
  };

  return (
    <div className="min-h-screen lg:pl-72">
      <aside className={cx('no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-slate-950 transition-transform lg:translate-x-0', menuOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 flex-none items-center px-5">
          <Link href="/" aria-label="Trackable home"><Logo size={36} tone="light" subtitle="Material traceability" /></Link>
        </div>
        <nav aria-label="Main" className="sidebar-scroll flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map(({ section, items }) => (
            <div key={section}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section}</p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = Icons[item.icon];
                  return (
                    <li key={`${section}-${item.href}`}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition',
                          active ? 'bg-gradient-to-r from-brand-600 to-sky-500 text-white shadow-lg shadow-brand-900/40'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <Icon size={20} className={active ? 'text-white' : 'text-slate-400 group-hover:text-white'} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex-none border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-500 text-sm font-bold text-white">{initials(user.display_name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.display_name}</p>
              <p className="truncate text-xs text-slate-400">{user.role_display}</p>
            </div>
            <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
              <Icons.logout size={20} />
            </button>
          </div>
        </div>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur sm:px-6">
        <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Icons.menu size={22} />
        </button>
        <form onSubmit={search} role="search" className="relative flex-1">
          <label htmlFor="global-search" className="sr-only">Search</label>
          <Icons.search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="global-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search receipt, invoice, truck, bag, lot, sample, issue, order…"
            className={cx(inputCls, 'max-w-xl bg-slate-50 pl-10')}
          />
        </form>
        <Link href="/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread.data?.unread_count ?? 0} unread)`}>
          <Icons.bell size={22} />
          {!!unread.data?.unread_count && (
            <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread.data.unread_count}</span>
          )}
        </Link>
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 sm:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-500 text-xs font-bold text-white">{initials(user.display_name)}</span>
          <span className="text-sm font-medium text-slate-700">{user.role_display}</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
