'use client';

/**
 * Type-to-search dropdown (ARIA combobox) for long lists such as master data. Typing filters the
 * options by every word typed, matching the label and any extra keywords (code, GST, …).
 * Keyboard: ↓ / ↑ move, Enter picks, Escape closes; mouse and touch work as usual.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';
import { inputCls, type Option } from './forms';

export type SearchOption = Option & { keywords?: string };

export function SearchableSelect({ label, value, onChange, options, required, error, hint, labelAction, placeholder = 'Search or select…', className, disabled }: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  labelAction?: ReactNode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const text = `${o.label} ${o.keywords ?? ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [options, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (o: SearchOption) => {
    onChange(String(o.value));
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      if (open) { e.preventDefault(); if (filtered[active]) choose(filtered[active]); } // never submits the form while picking
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation(); // close the list, not the dialog around it
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Tab') { setOpen(false); setQuery(''); }
  };

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}
        </label>
        {labelAction}
      </div>
      <div className="relative mt-1">
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : selected?.label ?? ''}
          placeholder={open && selected ? selected.label : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => { setOpen(false); setQuery(''); }}
          onKeyDown={onKeyDown}
          className={cx(inputCls, 'pr-16', error && 'ring-red-400')}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">▾</span>
        {!required && value && !disabled && (
          <button type="button" aria-label={`Clear ${typeof label === 'string' ? label : 'selection'}`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => onChange('')}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700">✕</button>
        )}
        {open && (
          <ul id={listId} ref={list} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No matches{query && <> for “{query}”</>}.</li>
            ) : filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={String(o.value) === String(value)}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input until the click lands
                onClick={() => choose(o)}
                onMouseEnter={() => setActive(i)}
                className={cx('cursor-pointer px-3 py-2 text-sm', i === active ? 'bg-brand-50 text-brand-800' : 'text-slate-800',
                  String(o.value) === String(value) && 'font-semibold')}
              >
                {o.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
