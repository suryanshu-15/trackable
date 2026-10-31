'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ActionError, Button } from './ui';
import { TextArea } from './forms';

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Parents pass inline callbacks that change on every render (e.g. each keystroke in a form
  // held in parent state). The setup below must run only when the dialog opens, or it would
  // keep moving focus away from the field being typed in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && panel.current) {
        // Keep keyboard focus inside the dialog.
        const items = panel.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      // Start in the first field, not on the header's close button.
      const p = panel.current;
      const target = p?.querySelector<HTMLElement>('[autofocus]') ?? p?.querySelector<HTMLElement>('input, select, textarea')
        ?? p?.querySelector<HTMLElement>('button');
      target?.focus();
    }, 0);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); previous?.focus(); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Confirmation for a consequential action. With `reason`, a non-empty reason is required and
 * passed to `onConfirm` (the API records it in the audit trail).
 */
export function ConfirmDialog({ open, onClose, title, description, confirmLabel = 'Confirm', variant = 'primary', reason, reasonLabel = 'Reason', onConfirm, children }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: 'primary' | 'danger' | 'success';
  reason?: 'required' | 'optional';
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<unknown>;
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setText(''); setError(null); } }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason === 'required' && !text.trim()) { setError(new Error(`${reasonLabel} is required.`)); return; }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {description && <div className="text-sm text-slate-600">{description}</div>}
        {children}
        {reason && (
          <TextArea label={reasonLabel} required={reason === 'required'} value={text} onChange={(e) => setText(e.target.value)} />
        )}
        <ActionError error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={variant} loading={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
