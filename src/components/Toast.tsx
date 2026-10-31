'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './ui';

type Toast = { id: number; tone: 'good' | 'bad' | 'info'; text: string };
const Ctx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'good') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto rounded-md px-4 py-3 text-sm text-white shadow-lg',
              t.tone === 'good' && 'bg-emerald-700',
              t.tone === 'bad' && 'bg-red-700',
              t.tone === 'info' && 'bg-slate-800',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
