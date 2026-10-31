import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Trackable</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Warehouse material traceability</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
