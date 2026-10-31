import { describe, expect, it } from 'vitest';
import { ApiError, toSearch } from './api';
import { code128B } from './code128';
import { fmtDate, fmtQty, humanize } from './format';
import { LANDING, can, navFor } from './roles';
import { safeNext } from '@/app/login/LoginForm';
import { validateReceipt, initialReceipt } from '@/components/receiving/ReceiptForm';
import { storableLocations } from '@/components/inventory/LocationPicker';
import type { Location } from './types';

describe('api helpers', () => {
  it('repeats array params and drops empty values', () => {
    expect(toSearch({ status: ['A', 'B'], q: '', n: 0, x: undefined })).toBe('?status=A&status=B&n=0');
  });
  it('exposes field errors from the API envelope', () => {
    const e = new ApiError(400, { error: 'bad_request', message: 'Bad', details: { tare_weight: ['Too big.'], code: 'x' } }, 'req-1');
    expect(e.fieldErrors()).toEqual({ tare_weight: 'Too big.', code: 'x' });
    expect(e.requestId).toBe('req-1');
  });
});

describe('formatting', () => {
  it('trims decimal strings and keeps units', () => {
    expect(fmtQty('250.0000', 'kg')).toBe('250 kg');
    expect(fmtQty('0.5000')).toBe('0.5');
    expect(fmtQty(null)).toBe('—');
  });
  it('does not shift calendar dates across timezones', () => {
    expect(fmtDate('2027-01-01')).toBe('01 Jan 2027');
  });
  it('humanizes codes', () => expect(humanize('AWAITING_PUTAWAY')).toBe('Awaiting putaway'));
});

describe('Code 128 labels', () => {
  it('encodes with start B, checksum and stop', () => {
    const widths = code128B('PKG-1');
    // start(6) + 5 chars(6 each) + checksum(6) + stop(7)
    expect(widths.length).toBe(6 + 30 + 6 + 7);
    expect(widths.slice(0, 6).join('')).toBe('211214');
    expect(widths.slice(-7).join('')).toBe('2331112');
    // every symbol is 11 modules wide (stop is 13)
    expect(widths.reduce((a, b) => a + b, 0)).toBe(11 * 7 + 13);
  });
  it('rejects characters it cannot encode', () => expect(() => code128B('é')).toThrow());
});

describe('role navigation (UI only — the API enforces permissions)', () => {
  it('gives each role its own landing page and menu', () => {
    expect(LANDING.FACTORY).toBe('/requests');
    const factory = navFor('FACTORY').map((n) => n.href);
    expect(factory).toContain('/requests');
    expect(factory).not.toContain('/gate');
    expect(factory).not.toContain('/audit');
    expect(navFor('AUDITOR').map((n) => n.href)).toContain('/audit');
    expect(navFor('GATE').map((n) => n.href)).not.toContain('/admin/users');
  });
  it('mirrors server-side separation of duties', () => {
    expect(can.approveAdjustment('WAREHOUSE')).toBe(false);
    expect(can.approveAdjustment('MANAGER')).toBe(true);
    expect(can.createReceipt('RECEIVING')).toBe(false);
    expect(can.issue('FACTORY')).toBe(false);
  });
});

describe('post-login redirect', () => {
  it('only allows same-app paths', () => {
    expect(safeNext('/packages/1')).toBe('/packages/1');
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/\\evil')).toBeNull();
    expect(safeNext('/login')).toBeNull();
  });
});

describe('receipt validation', () => {
  it('requires the gate essentials and sane weights', () => {
    const errors = validateReceipt({ ...initialReceipt(), gross_weight: '100', tare_weight: '150' });
    expect(Object.keys(errors).sort()).toEqual(['invoice_number', 'supplier', 'tare_weight', 'vehicle_number', 'weight_unit']);
    expect(validateReceipt({ ...initialReceipt(), supplier: '1', invoice_number: 'I', vehicle_number: 'V' })).toEqual({});
  });
});

describe('storable locations', () => {
  it('offers only leaf locations', () => {
    const locs = [{ id: 1, parent: null }, { id: 2, parent: 1 }, { id: 3, parent: 2 }, { id: 4, parent: null }] as unknown as Location[];
    expect(storableLocations(locs).map((l) => l.id)).toEqual([3, 4]);
  });
});
