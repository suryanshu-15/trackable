'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { TextField } from '@/components/forms';
import { LANDING } from '@/lib/roles';
import type { User } from '@/lib/types';

/** Only same-app relative paths are allowed as a post-login destination (no open redirects). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (next.startsWith('/login')) return null;
  return next;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(
          resp.status === 429
            ? 'Too many sign-in attempts. Wait a minute and try again.'
            : resp.status === 401 || resp.status === 400
              ? 'Incorrect username or password, or the account is inactive.'
              : data.message || 'Sign-in failed. Try again.',
        );
        return;
      }
      const user = data.user as User;
      qc.clear();
      qc.setQueryData(['auth/me', {}], user);
      router.replace(safeNext(params.get('next')) || LANDING[user.role] || '/');
    } catch {
      setError('The server could not be reached. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="e.g. demo_gate" />
      <div>
        <TextField label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="button" onClick={() => setShow((v) => !v)} className="mt-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">{show ? 'Hide password' : 'Show password'}</button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
    </form>
  );
}
