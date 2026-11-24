import { cx } from './ui';
import { humanize } from '@/lib/format';

type Tone = 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'slate';

const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-300',
  slate: 'bg-slate-700 text-white ring-slate-700',
  blue: 'bg-sky-50 text-sky-800 ring-sky-300',
  amber: 'bg-amber-50 text-amber-800 ring-amber-300',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  red: 'bg-red-50 text-red-800 ring-red-300',
  purple: 'bg-violet-50 text-violet-800 ring-violet-300',
};

// One map for all status vocabularies; codes are unique enough across receipt, package, QC,
// sample, request and issue statuses that a shared colour scheme stays unambiguous.
const STATUS_TONE: Record<string, Tone> = {
  // receipts
  DRAFT: 'gray', GATE_REGISTERED: 'blue', AWAITING_UNLOADING: 'amber', UNLOADING_IN_PROGRESS: 'blue',
  VERIFICATION_PENDING: 'amber', EXCEPTION: 'red', UNLOADED: 'blue', PUTAWAY_IN_PROGRESS: 'blue',
  STORED: 'green', CLOSED: 'slate', CANCELLED: 'gray',
  // packages
  CREATED: 'gray', AWAITING_PUTAWAY: 'amber', ISSUED: 'purple', REPACKED: 'gray', DISPOSED: 'gray', SUPPLIER_RETURNED: 'gray',
  // QC
  NOT_REQUIRED: 'green', PENDING_SAMPLING: 'amber', SAMPLED: 'blue', TESTING: 'blue', PASSED: 'green',
  FAILED: 'red', ON_HOLD: 'red', RETEST_REQUIRED: 'amber',
  // samples / runs
  REQUESTED: 'amber', COLLECTED: 'blue', RECEIVED_BY_LAB: 'blue', RESULTS_SUBMITTED: 'purple', COMPLETED: 'green',
  OPEN: 'blue', SUBMITTED: 'purple', REVIEWED: 'green', PASS: 'green', FAIL: 'red', INCONCLUSIVE: 'amber',
  // decisions
  RELEASED: 'green', REJECTED: 'red', RETEST: 'amber', PARTIAL: 'amber',
  // requests / issues / adjustments
  ALLOCATED: 'blue', PARTIALLY_ISSUED: 'amber', FULFILLED: 'green', ACKNOWLEDGED: 'green', PENDING: 'amber', APPROVED: 'green',
  // verification
  VERIFIED: 'green', DISCREPANT: 'red', EXCEPTION_ACCEPTED: 'amber',
  // holds / notifications
  HOLD: 'red', RECALL: 'red', INFO: 'blue', WARNING: 'amber', ERROR: 'red', CRITICAL: 'red',
};

// Plain words shown to staff instead of system terms (the server's codes stay unchanged).
export const STATUS_LABEL: Record<string, string> = {
  // receipts
  DRAFT: 'Draft (not sent)', GATE_REGISTERED: 'At gate', AWAITING_UNLOADING: 'Waiting to unload',
  UNLOADING_IN_PROGRESS: 'Unloading', VERIFICATION_PENDING: 'Checked', EXCEPTION: 'Needs manager',
  UNLOADED: 'Unloaded', PUTAWAY_IN_PROGRESS: 'Putting away', STORED: 'Stored', CLOSED: 'Closed', CANCELLED: 'Cancelled',
  // bags
  CREATED: 'New bag', AWAITING_PUTAWAY: 'Waiting for put-away', ISSUED: 'Issued to factory', REPACKED: 'Repacked',
  DISPOSED: 'Scrapped', SUPPLIER_RETURNED: 'Returned to supplier',
  // lab status of a bag
  NOT_REQUIRED: 'No test needed', PENDING_SAMPLING: 'Waiting for lab', SAMPLED: 'Sample taken', TESTING: 'In lab test',
  PASSED: 'Lab passed', FAILED: 'Lab failed', ON_HOLD: 'On hold', RETEST_REQUIRED: 'Needs retest',
  // samples
  REQUESTED: 'Sample requested', COLLECTED: 'Sample taken', RECEIVED_BY_LAB: 'In lab', RESULTS_SUBMITTED: 'Waiting for approval',
  COMPLETED: 'Done',
  // checking a material at unloading
  VERIFIED: 'Matches', DISCREPANT: 'Mismatch – needs manager', EXCEPTION_ACCEPTED: 'Accepted by manager',
  // requests / issues
  ALLOCATED: 'Stock reserved', PARTIALLY_ISSUED: 'Partly issued', FULFILLED: 'Completed', ACKNOWLEDGED: 'Received by factory',
};

export const statusLabel = (code?: string | null) => (code ? STATUS_LABEL[code] ?? humanize(code) : '—');

export function Badge({ tone = 'gray', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone])}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }: { status?: string | null; label?: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{STATUS_LABEL[status] ?? (label || humanize(status))}</Badge>;
}

/** Package availability with its blocking flags (hold / recall take precedence visually). */
export function AvailabilityBadge({ available, onHold, recalled }: { available?: boolean; onHold?: boolean; recalled?: boolean }) {
  if (recalled) return <Badge tone="red">Recalled</Badge>;
  if (onHold) return <Badge tone="red">On hold</Badge>;
  return available ? <Badge tone="green">Available</Badge> : <Badge tone="amber">Not available</Badge>;
}
