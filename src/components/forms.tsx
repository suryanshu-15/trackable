'use client';

import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './ui';

export const inputCls =
  'block w-full rounded-lg border-0 px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500';

type FieldProps = { label: ReactNode; error?: string; hint?: ReactNode; required?: boolean; className?: string; labelAction?: ReactNode };

function FieldShell({ id, label, error, hint, required, className, labelAction, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}
        </label>
        {labelAction}
      </div>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TextField({ label, error, hint, required, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <input
        id={id}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(inputCls, error && 'ring-red-400')}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({ label, error, hint, required, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea
        id={id}
        rows={3}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(inputCls, error && 'ring-red-400')}
        {...rest}
      />
    </FieldShell>
  );
}

export type Option = { value: string | number; label: string };

export function SelectField({ label, error, hint, required, className, labelAction, options, placeholder = 'Select…', ...rest }:
  FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className} labelAction={labelAction}>
      <select
        id={id}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(inputCls, error && 'ring-red-400')}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...rest} />
      <label htmlFor={id} className="text-sm text-slate-700">{label}</label>
    </div>
  );
}

/** Client-side usability checks; the API remains the authority. */
export const validate = {
  positive: (v: string) => (v === '' || !(Number(v) > 0) ? 'Enter a quantity greater than zero.' : undefined),
  nonNegative: (v: string) => (v !== '' && !(Number(v) >= 0) ? 'Cannot be negative.' : undefined),
  required: (v: string, what = 'This field') => (!v || !v.trim() ? `${what} is required.` : undefined),
};

/** Drop empty strings so optional fields are omitted instead of sent as "". */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null)) as Partial<T>;
}

/** Password input with an eye button to show / hide what was typed. */
export function PasswordField({ label, error, hint, required, className, ...rest }: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cx(inputCls, 'pr-11', error && 'ring-red-400')}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </div>
    </FieldShell>
  );
}
