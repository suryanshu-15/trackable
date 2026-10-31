/** Decorative illustration of the material flow: truck → bag & label → lab → factory. */
export function FlowIllustration({ className }: { className?: string }) {
  const step = (x: number, label: string, icon: React.ReactNode) => (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="20" width="96" height="96" rx="22" fill="white" fillOpacity="0.14" stroke="white" strokeOpacity="0.35" />
      <g transform="translate(24 44)" stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round">{icon}</g>
      <text x="48" y="140" textAnchor="middle" fill="white" fillOpacity="0.9" fontSize="13" fontWeight="600">{label}</text>
    </g>
  );
  const arrow = (x: number) => (
    <path d={`M${x} 68h22m-7-7 7 7-7 7`} stroke="white" strokeOpacity="0.7" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  );
  return (
    <svg viewBox="0 0 474 150" className={className} aria-hidden="true">
      {step(0, 'Gate', <><path d="M2 8h28v26H2zM30 18h10l8 8v8H30" /><circle cx="11" cy="40" r="4" /><circle cx="38" cy="40" r="4" /></>)}
      {arrow(102)}
      {step(126, 'Bag & label', <><path d="M6 10h36l2 34H4z" /><path d="M16 10V6a8 8 0 0 1 16 0v4M14 20v14M19 20v14M25 20v14M30 20v14M34 20v14" /></>)}
      {arrow(228)}
      {step(252, 'Lab release', <><path d="M16 2h16M19 2v14L7 38a3 3 0 0 0 2.6 4.5h28.8A3 3 0 0 0 41 38L29 16V2" /><path d="m17 30 5 5 9-9" /></>)}
      {arrow(354)}
      {step(378, 'Factory', <><path d="M2 46V22l13 7v-7l13 7V14l16-8v40z" /><path d="M10 38h4M21 38h4M32 38h4" /></>)}
    </svg>
  );
}
