import { Suspense } from 'react';
import { Logo } from '@/components/brand/Logo';
import { FlowIllustration } from './FlowIllustration';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

const POINTS = [
  'Every bag labelled, scanned and traced from gate to factory',
  'Lab release before issue — blocked stock can never leave',
  'FIFO / FEFO issuing with a full audit trail',
];

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-sky-500 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
        <Logo size={44} tone="light" subtitle="Warehouse material traceability" />
        <div className="relative my-auto">
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">From truck to factory, every bag accounted for.</h1>
          <FlowIllustration className="mt-10 w-full max-w-xl" />
          <ul className="mt-10 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-indigo-50">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/20 text-xs">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-indigo-100/70">Gate · Receiving · Laboratory · Warehouse · Factory</p>
      </section>

      <section className="flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo size={40} subtitle="Warehouse material traceability" /></div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
          <p className="mb-8 mt-1 text-sm text-slate-500">Sign in with your work account to continue.</p>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <Suspense><LoginForm /></Suspense>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">Access is role-based and every action is recorded.</p>
        </div>
      </section>
    </main>
  );
}
