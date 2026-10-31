/**
 * Role-specific navigation. This only shapes the UI — every permission is enforced by the API,
 * and action buttons follow the server's `allowed_actions` / `allowed_transitions`.
 */
import type { Role } from './types';
import type { IconName } from '@/components/icons';

export type NavItem = { href: string; label: string; roles: Role[] | 'all'; icon: IconName; section: string };

const OPS: Role[] = ['ADMIN', 'GATE', 'RECEIVING', 'WAREHOUSE', 'LAB_TECH', 'LAB_REVIEWER', 'AUDITOR', 'MANAGER'];
const OVERSIGHT: Role[] = ['ADMIN', 'AUDITOR', 'MANAGER'];
const LAB: Role[] = ['ADMIN', 'LAB_TECH', 'LAB_REVIEWER'];

export const NAV_SECTIONS = ['Overview', 'Inbound', 'Inventory', 'Quality', 'Outbound', 'Insights', 'Administration'] as const;

export const NAV: NavItem[] = [
  { href: '/management', label: 'Dashboard', roles: OVERSIGHT, icon: 'dashboard', section: 'Overview' },
  // Administrators get reports right under the dashboard; other roles find them under Insights.
  { href: '/reports', label: 'Reports', roles: ['ADMIN'], icon: 'report', section: 'Overview' },
  { href: '/usage', label: 'Usage analysis', roles: OVERSIGHT, icon: 'chart', section: 'Overview' },
  { href: '/gate', label: 'Gate & receipts', roles: OPS, icon: 'truck', section: 'Inbound' },
  { href: '/unloading', label: 'Unloading & put-away', roles: ['ADMIN', 'RECEIVING', 'WAREHOUSE'], icon: 'unload', section: 'Inbound' },
  { href: '/scan', label: 'Scan', roles: OPS, icon: 'scan', section: 'Inbound' },
  { href: '/stock', label: 'Stock', roles: ['ADMIN', 'WAREHOUSE', 'LAB_REVIEWER', 'AUDITOR', 'MANAGER'], icon: 'stock', section: 'Inventory' },
  { href: '/packages', label: 'Material availability', roles: OPS, icon: 'bag', section: 'Inventory' },
  { href: '/stock-control', label: 'Returns & adjustments', roles: ['ADMIN', 'WAREHOUSE', 'AUDITOR', 'MANAGER'], icon: 'sliders', section: 'Inventory' },
  { href: '/lab', label: 'Laboratory', roles: [...LAB, 'AUDITOR', 'MANAGER'], icon: 'lab', section: 'Quality' },
  { href: '/holds', label: 'Holds & recalls', roles: [...LAB, 'WAREHOUSE', 'AUDITOR', 'MANAGER'], icon: 'shield', section: 'Quality' },
  { href: '/requests', label: 'Material requests', roles: ['ADMIN', 'WAREHOUSE', 'FACTORY', 'AUDITOR', 'MANAGER'], icon: 'clipboard', section: 'Outbound' },
  { href: '/issues', label: 'Issues', roles: ['ADMIN', 'WAREHOUSE', 'FACTORY', 'AUDITOR', 'MANAGER'], icon: 'send', section: 'Outbound' },
  { href: '/reports', label: 'Reports', roles: OPS.filter((r) => r !== 'ADMIN'), icon: 'report', section: 'Insights' },
  { href: '/audit', label: 'Audit trail', roles: OVERSIGHT, icon: 'audit', section: 'Insights' },
  { href: '/admin/users', label: 'Users', roles: ['ADMIN'], icon: 'users', section: 'Administration' },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles === 'all' || n.roles.includes(role));
}

/** Menu for a role, grouped into sections (empty sections dropped). */
export function navSections(role: Role): { section: string; items: NavItem[] }[] {
  const items = navFor(role);
  return NAV_SECTIONS.map((section) => ({ section, items: items.filter((i) => i.section === section) })).filter((g) => g.items.length);
}

export const LANDING: Record<Role, string> = {
  ADMIN: '/management',
  GATE: '/gate',
  RECEIVING: '/unloading',
  WAREHOUSE: '/stock',
  LAB_TECH: '/lab',
  LAB_REVIEWER: '/lab',
  FACTORY: '/requests',
  AUDITOR: '/management',
  MANAGER: '/management',
};

export const can = {
  createReceipt: (r: Role) => ['ADMIN', 'GATE'].includes(r),
  editLines: (r: Role) => ['ADMIN', 'GATE', 'RECEIVING'].includes(r),
  uploadReceiptDocs: (r: Role) => ['ADMIN', 'GATE', 'RECEIVING'].includes(r),
  correctWeights: (r: Role) => ['ADMIN', 'GATE'].includes(r),
  unload: (r: Role) => ['ADMIN', 'RECEIVING', 'WAREHOUSE'].includes(r),
  acceptDiscrepancy: (r: Role) => ['ADMIN', 'MANAGER'].includes(r),
  requestSample: (r: Role) => LAB.includes(r),
  hold: (r: Role) => ['ADMIN', 'LAB_REVIEWER'].includes(r),
  raiseRequest: (r: Role) => ['ADMIN', 'FACTORY', 'WAREHOUSE'].includes(r),
  allocate: (r: Role) => ['ADMIN', 'WAREHOUSE'].includes(r),
  issue: (r: Role) => ['ADMIN', 'WAREHOUSE', 'MANAGER'].includes(r),
  acknowledgeIssue: (r: Role) => ['ADMIN', 'FACTORY'].includes(r),
  receiveReturn: (r: Role) => ['ADMIN', 'WAREHOUSE'].includes(r),
  dispose: (r: Role) => ['ADMIN', 'WAREHOUSE', 'MANAGER'].includes(r),
  requestAdjustment: (r: Role) => ['ADMIN', 'WAREHOUSE'].includes(r),
  approveAdjustment: (r: Role) => ['ADMIN', 'MANAGER'].includes(r),
  readReceipts: (r: Role) => r !== 'FACTORY',
};
