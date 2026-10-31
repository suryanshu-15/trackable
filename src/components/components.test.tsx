import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { ReceiptForm, initialReceipt } from './receiving/ReceiptForm';
import { ScanBox } from './Scanner';
import { ConfirmDialog } from './Dialog';
import { ErrorState } from './ui';
import { IssueForm } from './issuing/IssueForm';
import { mockFetch, page, renderWithProviders } from '@/test/utils';
import type { MaterialRequest } from '@/lib/types';

afterEach(() => vi.unstubAllGlobals());

const masters = {
  '/bff/master/suppliers': { body: page([{ id: 1, code: 'S1', name: 'Alpha' }]) },
  '/bff/master/units': { body: page([{ id: 1, code: 'KG', name: 'Kilogram', symbol: 'kg', unit_type: 'WEIGHT' }]) },
};

describe('Gate receipt form', () => {
  it('shows client-side validation without calling the API', async () => {
    mockFetch(masters);
    const onSubmit = vi.fn();
    renderWithProviders(<ReceiptForm initial={initialReceipt()} submitLabel="Create receipt" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create receipt' }));
    expect(screen.getByText('Choose the supplier.')).toBeInTheDocument();
    expect(screen.getByText('Invoice number is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('warns on a duplicate invoice and re-submits only when acknowledged', async () => {
    mockFetch(masters);
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, { error: 'duplicate_invoice', message: 'dup', details: { duplicate_receipts: ['GR-1'] } }, null))
      .mockResolvedValueOnce(undefined);
    renderWithProviders(<ReceiptForm initial={{ ...initialReceipt(), invoice_number: 'INV-1', vehicle_number: 'OD01' }} submitLabel="Create receipt" onSubmit={onSubmit} />);
    await screen.findByRole('option', { name: 'Alpha (S1)' });
    await userEvent.selectOptions(screen.getByLabelText(/Supplier/), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Create receipt' }));
    expect(await screen.findByText('Possible duplicate invoice')).toBeInTheDocument();
    expect(screen.getByText('GR-1')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ supplier: 1, invoice_number: 'INV-1' }), false);
    await userEvent.click(screen.getByRole('button', { name: 'Create anyway' }));
    await waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith(expect.anything(), true));
  });

  it('maps API field errors back onto the inputs', async () => {
    mockFetch(masters);
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, { error: 'bad_request', message: 'Gross weight cannot be negative.', details: { gross_weight: ['Must be ≥ 0.'] } }, 'abc123'));
    renderWithProviders(<ReceiptForm initial={{ ...initialReceipt(), supplier: '1', invoice_number: 'I', vehicle_number: 'V' }} submitLabel="Save" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Must be ≥ 0.')).toBeInTheDocument();
    expect(screen.getByText('Reference: abc123')).toBeInTheDocument();
  });
});

describe('Scan workflow', () => {
  it('accepts keyboard-wedge input terminated by Enter and clears for the next scan', async () => {
    const onScan = vi.fn();
    render(<ScanBox onScan={onScan} />);
    const input = screen.getByLabelText('Scan or type a code');
    expect(input).toHaveFocus();
    await userEvent.type(input, '  PKG-ABC123  {Enter}');
    expect(onScan).toHaveBeenCalledWith('PKG-ABC123');
    expect(input).toHaveValue('');
    await userEvent.type(input, '{Enter}');
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('explains when the camera is unavailable instead of failing silently', async () => {
    render(<ScanBox onScan={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Scan with camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTPS|camera/i);
  });
});

describe('Confirmation with reason', () => {
  it('requires a reason and shows server errors without closing', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ApiError(403, { error: 'separation_of_duties', message: 'You cannot approve your own adjustment.' }, null));
    const onClose = vi.fn();
    render(<ConfirmDialog open onClose={onClose} title="Approve" reason="required" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Reason is required.');
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Reason/), 'Counted twice');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('Counted twice');
    expect(await screen.findByText('You cannot approve your own adjustment.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Error states', () => {
  it('distinguishes forbidden from failures and offers retry only for the latter', async () => {
    const retry = vi.fn();
    const { rerender } = render(<ErrorState error={new ApiError(403, { message: 'Nope' }, null)} onRetry={retry} />);
    expect(screen.getByText('You do not have access to this.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(502, { message: 'Server unreachable' }, 'r1')} onRetry={retry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Issue form', () => {
  const request = {
    id: 'req-1', request_number: 'REQ-1', status: 'ALLOCATED',
    lines: [{ id: 'line-1', material: 1, material_code: 'M1', remaining_quantity: '100.0000', unit_symbol: 'kg', reservations: [] }],
  } as unknown as MaterialRequest;
  const suggestions = [{ line: 'line-1', material_code: 'M1', remaining: '100', unit: 'kg', policy: 'FIFO', shortfall: '0', suggestions: [
    { package: 'p-old', package_id: 'PKG-OLD', quantity: '100', unit: 'kg', batch_number: 'L1', received_at: '2026-01-01T00:00:00Z', expiry_date: null, retest_date: null },
  ] }];

  it('requires an override reason after a FIFO violation and resends with the same retry key per payload', async () => {
    const posted: { body: Record<string, unknown>; key: string | null }[] = [];
    let n = 0;
    mockFetch({
      '/bff/inventory/requests/req-1/suggestions': { body: suggestions },
      'GET /bff/inventory/packages/resolve': { body: { id: 'p-new', package_id: 'PKG-NEW', material: 1, material_code: 'M1', is_available: true, blocking_reasons: [], current_quantity: '100', batch_number: 'L2', unit_symbol: 'kg', status_display: 'Stored' } },
      'POST /bff/inventory/issues': (init) => {
        posted.push({ body: JSON.parse(String(init!.body)), key: new Headers(init!.headers).get('Idempotency-Key') });
        return n++ === 0
          ? { status: 409, body: { error: 'fifo_override_required', message: 'override', details: { violations: [{ package_id: 'PKG-NEW', older_stock_not_used: ['PKG-OLD'] }], policy: 'FIFO' } } }
          : { status: 201, body: { id: 'iss-1', issue_number: 'ISS-1', fifo_override: true } };
      },
    });
    const onIssued = vi.fn();
    renderWithProviders(<IssueForm request={request} onIssued={onIssued} />);
    await userEvent.type(screen.getByLabelText('Scan package to pick'), 'PKG-NEW{Enter}');
    expect(await screen.findByLabelText('Quantity from PKG-NEW')).toHaveValue(100);
    await userEvent.click(screen.getByRole('button', { name: /Issue 1 package/ }));
    expect(await screen.findByText('Out of FIFO / FEFO order')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('PKG-NEW skips older stock: PKG-OLD');

    await userEvent.click(screen.getByRole('button', { name: 'Issue with override' }));
    expect(await screen.findByText(/Give a reason/)).toBeInTheDocument();
    expect(posted).toHaveLength(1);

    await userEvent.type(screen.getByLabelText(/Override reason/), 'Older lot is at the far store');
    await userEvent.click(screen.getByRole('button', { name: 'Issue with override' }));
    await waitFor(() => expect(onIssued).toHaveBeenCalled());
    expect(posted[1].body.override_reason).toBe('Older lot is at the far store');
    expect(posted[0].key).toBeTruthy();
    expect(posted[1].key).not.toBe(posted[0].key);
  });

  it('refuses to pick blocked packages before calling the API', async () => {
    const { calls } = mockFetch({
      '/bff/inventory/requests/req-1/suggestions': { body: suggestions },
      'GET /bff/inventory/packages/resolve': { body: { id: 'p-q', package_id: 'PKG-Q', material: 1, is_available: false, blocking_reasons: ['QC status is Testing'], status_display: 'Stored' } },
    });
    renderWithProviders(<IssueForm request={request} onIssued={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Scan package to pick'), 'PKG-Q{Enter}');
    expect(await screen.findByText(/PKG-Q cannot be issued: QC status is Testing/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.startsWith('/bff/inventory/issues'))).toBe(false);
  });
});

describe('Business rules in forms', () => {
  const policy = { 'receiving.line_acceptance': 'WHOLE', 'package.unit_codes': ['T'], 'package.type': 'BAG', 'issue.whole_packages_only': true, 'lab.sample_scope': 'SINGLE' };

  it('verifies an invoice line as accept-whole or reject, with a reason for rejection', async () => {
    const { VerifyDialog } = await import('./receiving/LineDialogs');
    const posted: Record<string, unknown>[] = [];
    mockFetch({
      '/bff/policy': { body: policy },
      '/bff/master/units': { body: page([{ id: 1, code: 'KG', symbol: 'kg' }, { id: 2, code: 'T', symbol: 't' }]) },
      '/bff/master/materials': { body: page([]) },
      'POST /bff/receiving/invoice-lines/l1/verify': (init) => { posted.push(JSON.parse(String(init!.body))); return { body: { verification_status: 'DISCREPANT' } }; },
    });
    const line = { id: 'l1', line_number: 1, declared_quantity: '2.0000', declared_unit: 2, declared_unit_symbol: 't', material_name: 'Soda' } as never;
    renderWithProviders(<VerifyDialog open line={line} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByLabelText('Accept whole line')).toBeChecked();
    expect(screen.queryByLabelText('Accepted quantity')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Reject line'));
    await userEvent.type(screen.getByLabelText(/Received quantity/), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Record verification' }));
    expect(screen.getByText('Give the reason for rejecting the line.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Reason for rejection/), 'Bags wet');
    await userEvent.click(screen.getByRole('button', { name: 'Record verification' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ received_quantity: '2', accepted_quantity: '0', received_unit: 2, discrepancy_notes: 'Bags wet' });
  });

  it('refuses a bag bigger than the quantity still requested (whole bags only)', async () => {
    mockFetch({
      '/bff/policy': { body: policy },
      '/bff/inventory/requests/req-2/suggestions': { body: [] },
      'GET /bff/inventory/packages/resolve': { body: { id: 'big', package_id: 'PKG-BIG', material: 1, is_available: true, blocking_reasons: [], current_quantity: '1.0000', unit_symbol: 't', batch_number: 'L' } },
    });
    const request = { id: 'req-2', lines: [{ id: 'x', material: 1, remaining_quantity: '0.5000', unit_symbol: 't', reservations: [] }] } as unknown as MaterialRequest;
    renderWithProviders(<IssueForm request={request} onIssued={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Scan package to pick'), 'PKG-BIG{Enter}');
    expect(await screen.findByText(/Bags are issued whole/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity from PKG-BIG')).not.toBeInTheDocument();
  });
});

describe('Dialog focus', () => {
  it('keeps focus in the field while typing when the parent holds the form state', async () => {
    const { useState } = await import('react');
    const { TextField } = await import('./forms');
    function Parent() {
      const [name, setName] = useState('');
      // Inline onClose / onConfirm change on every keystroke, like the Add user form.
      return (
        <ConfirmDialog open onClose={() => undefined} title="Add user" onConfirm={async () => undefined}>
          <TextField label="Username" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Email" value="" onChange={() => undefined} />
        </ConfirmDialog>
      );
    }
    render(<Parent />);
    const input = screen.getByLabelText('Username');
    await waitFor(() => expect(input).toHaveFocus()); // opens in the first field, not on ✕
    await userEvent.type(input, 'warehouse_lead_01');
    expect(input).toHaveValue('warehouse_lead_01');
    expect(input).toHaveFocus();
  });
});
