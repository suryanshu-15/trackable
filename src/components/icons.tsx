/** Small stroke icon set (24 × 24 grid, currentColor) used by navigation, tiles and buttons. */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const Icons = {
  dashboard: (p: IconProps) => <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>,
  report: (p: IconProps) => <Icon {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 17v-3M12 17v-6M16 17v-2" /></Icon>,
  truck: (p: IconProps) => <Icon {...p}><path d="M3 6h11v10H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></Icon>,
  unload: (p: IconProps) => <Icon {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></Icon>,
  scan: (p: IconProps) => <Icon {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9v6M11 9v6M14 9v6M17 9v6" /></Icon>,
  stock: (p: IconProps) => <Icon {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Icon>,
  bag: (p: IconProps) => <Icon {...p}><path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></Icon>,
  lab: (p: IconProps) => <Icon {...p}><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></Icon>,
  shield: (p: IconProps) => <Icon {...p}><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z" /><path d="M12 8v5M12 16h.01" /></Icon>,
  clipboard: (p: IconProps) => <Icon {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></Icon>,
  send: (p: IconProps) => <Icon {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></Icon>,
  sliders: (p: IconProps) => <Icon {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Icon>,
  audit: (p: IconProps) => <Icon {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" /></Icon>,
  chart: (p: IconProps) => <Icon {...p}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></Icon>,
  users: (p: IconProps) => <Icon {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5" /></Icon>,
  bell: (p: IconProps) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></Icon>,
  search: (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>,
  logout: (p: IconProps) => <Icon {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></Icon>,
  menu: (p: IconProps) => <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>,
  check: (p: IconProps) => <Icon {...p}><path d="m5 12 5 5 9-10" /></Icon>,
  clock: (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  alert: (p: IconProps) => <Icon {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Icon>,
  factory: (p: IconProps) => <Icon {...p}><path d="M3 21V10l6 3V10l6 3V6l6-3v18z" /><path d="M7 17h2M12 17h2M17 17h2" /></Icon>,
  arrowRight: (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>,
};

export type IconName = keyof typeof Icons;
