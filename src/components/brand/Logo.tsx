import { useId } from 'react';

/** Trackable mark: a tagged bag with a scan line — "every bag, traced". */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="Trackable logo">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#g${id})`} />
      {/* bag */}
      <path d="M15 17h18l1.6 18.2a1.8 1.8 0 0 1-1.8 1.8H15.2a1.8 1.8 0 0 1-1.8-1.8z" fill="#fff" />
      <path d="M19.5 17v-2.5a4.5 4.5 0 0 1 9 0V17" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      {/* barcode on the bag */}
      <path d="M18.5 23v8M21 23v8M24.5 23v8M27 23v8M29.5 23v8" stroke="#4338ca" strokeWidth="1.6" />
      {/* scan line */}
      <path d="M10 27h28" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" opacity="0.95" />
    </svg>
  );
}

export function Logo({ size = 36, tone = 'dark', subtitle }: { size?: number; tone?: 'dark' | 'light'; subtitle?: string }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span className={`block text-lg font-bold tracking-tight ${tone === 'light' ? 'text-white' : 'text-slate-900'}`}>Trackable</span>
        {subtitle && <span className={`block text-xs ${tone === 'light' ? 'text-indigo-100/80' : 'text-slate-500'}`}>{subtitle}</span>}
      </span>
    </span>
  );
}
