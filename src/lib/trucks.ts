import type { ReceiptListItem } from './types';

/** Plates are typed many ways ("OD 02 AB-4521", "od02ab4521"): compare letters and digits only. */
export const plateKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function matchesTruck(r: Pick<ReceiptListItem, 'vehicle_number' | 'receipt_number' | 'invoice_number'>, query: string) {
  const q = plateKey(query);
  return !q || [r.vehicle_number, r.receipt_number, r.invoice_number].some((x) => plateKey(x ?? '').includes(q));
}
