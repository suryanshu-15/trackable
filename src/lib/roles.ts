/**
 * Role-specific navigation. This only shapes the UI — every permission is enforced by the API,
 * and action buttons follow the server's `allowed_actions` / `allowed_transitions`.
 */
import type { Role } from './types';

export type NavItem = { href: string; label: string; roles: Role[] | 'all' };

const OPS: Role[] = ['ADMIN', 'GATE', 'RECEIVING', 'WAREHOUSE', 'LAB_TECH', 'LAB_REVIEWER', 'AUDITOR', 'MANAGER'];
const OVERSIGHT: Role[] = ['ADMIN', 'AUDITOR', 'MANAGER'];
const LAB: Role[] = ['ADMIN', 'LAB_TECH', 'LAB_REVIEWER'];

export const NAV: NavItem[] = [
  { href: '/management', label: 'Management', roles: OVERSIGHT },
  { href: '/gate', label: 'Gate & receipts', roles: ['ADMIN', 'GATE', 'RECEIVING', 'WAREHOUSE', 'LAB_TECH', 'LAB_REVIEWER', 'AUDITOR', 'MANAGER'] },
  { href: '/unloading', label: 'Unloading & put-away', roles: ['ADMIN', 'RECEIVING', 'WAREHOUSE'] },
  { href: '/scan', label: 'Scan', roles: OPS },
  { href: '/stock', label: 'Stock', roles: ['ADMIN', 'WAREHOUSE', 'LAB_REVIEWER', 'AUDITOR', 'MANAGER'] },
  { href: '/packages', label: 'Material availability', roles: OPS },
  { href: '/lab', label: 'Laboratory', roles: [...LAB, 'AUDITOR', 'MANAGER'] },
  { href: '/holds', label: 'Holds & recalls', roles: [...LAB, 'WAREHOUSE', 'AUDITOR', 'MANAGER'] },
  { href: '/requests', label: 'Material requests', roles: ['ADMIN', 'WAREHOUSE', 'FACTORY', 'AUDITOR', 'MANAGER'] },
  { href: '/issues', label: 'Issues', roles: ['ADMIN', 'WAREHOUSE', 'FACTORY', 'AUDITOR', 'MANAGER'] },
  { href: '/stock-control', label: 'Returns, disposals & adjustments', roles: ['ADMIN', 'WAREHOUSE', 'AUDITOR', 'MANAGER'] },
  { href: '/reports', label: 'Reports', roles: OPS },
  { href: '/audit', label: 'Audit trail', roles: OVERSIGHT },
  { href: '/usage', label: 'Usage analysis', roles: OVERSIGHT },
  { href: '/admin/users', label: 'Users', roles: ['ADMIN'] },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles === 'all' || n.roles.includes(role));
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
