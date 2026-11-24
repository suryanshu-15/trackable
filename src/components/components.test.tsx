import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { GateEntryForm, initialGateEntry } from './receiving/GateEntryForm';
import { ScanBox } from './Scanner';
import { ConfirmDialog } from './Dialog';
import { ErrorState } from './ui';
import { IssueForm } from './issuing/IssueForm';
import { mockFetch, page, renderWithProviders } from '@/test/utils';
import type { MaterialRequest } from '@/lib/types';

afterEach(() => vi.unstubAllGlobals());

const masters = {
  '/bff/master/suppliers': { body: page([{ id: 1, code: 'S1', name: 'Alpha' }]) },
  '/bff/master/units': { body: page([{ id: 1, code: 'KG', name: 'Kilogram', symbol: 'kg', unit_type: 'WEIGHT' }, { id: 2, code: 'T', name: 'Tonne', symbol: 't', unit_type: 'WEIGHT' }]) },
  '/bff/master/materials': { body: page([{ id: 5, code: 'MAT-001', name: 'Soda ash' }]) },
  '/bff/master/locations': { body: page([{ id: 9, code: 'A-R1-S1', full_path: 'A > A-R1-S1', warehouse_name: 'Main', parent: null, is_quarantine: false }]) },
};

const filled = () => ({
  ...initialGateEntry(), supplier: '1', invoice_number: 'INV-1', vehicle_number: 'OD02AB1234',
  lines: [{ key: 'a', material: '5', description: 'Soda ash', quantity: '1', unit: '2', location: '9' }],
});

describe('Gate entry form', () => {
  it('shows what is missing without calling the API', async () => {
    mockFetch(masters);
    const onSave = vi.fn();
    renderWithProviders(<GateEntryForm initial={initialGateEntry()} onSave={onSave} onCancel={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save and send to receiving' }));
    expect(screen.getByText('Choose the supplier.')).toBeInTheDocument();
    expect(screen.getByText('Invoice number is required.')).toBeInTheDocument();
    expect(screen.getByText('Choose the material.')).toBeInTheDocument();
    expect(screen.getByText('Enter the quantity.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends the gate register columns and every material row, defaulting new rows to tonnes', async () => {
    mockFetch(masters);
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<GateEntryForm initial={{ ...filled(), transporter_name: 'Kalinga Roadlines', lr_number: 'LR-1', eway_bill_number: '3210', driver_mobile: '9876543210', driver_licence_number: 'OD0220150012345' }}
      onSave={onSave} onCancel={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add another material' }));
    await userEvent.type(screen.getAllByRole('combobox', { name: /Material/ })[1], 'soda');
    await userEvent.click(await screen.findByRole('option', { name: 'Soda ash (MAT-001)' }));
    await userEvent.type(screen.getAllByLabelText(/Quantity/)[1], '0.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save and send to receiving' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [body, ack, send] = onSave.mock.calls[0];
    expect([ack, send]).toEqual([false, true]);
    expect(body).toMatchObject({ supplier: 1, invoice_number: 'INV-1', vehicle_number: 'OD02AB1234', transporter_name: 'Kalinga Roadlines',
      lr_number: 'LR-1', eway_bill_number: '3210', driver_mobile: '9876543210', driver_licence_number: 'OD0220150012345', send: true });
    expect(body.lines).toEqual([
      { material: 5, material_name_declared: 'Soda ash', declared_quantity: '1', declared_unit: 2, storage_location: 9 },
      { material: 5, material_name_declared: 'Soda ash', declared_quantity: '0.5', declared_unit: 2, storage_location: null },
    ]);
  });

  it('warns on a duplicate invoice and saves again only when confirmed', async () => {
    mockFetch(masters);
    const onSave = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, { error: 'duplicate_invoice', message: 'dup', details: { duplicate_receipts: ['GE-2026-00001'] } }, null))
      .mockResolvedValueOnce(undefined);
    renderWithProviders(<GateEntryForm initial={filled()} onSave={onSave} onCancel={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save and send to receiving' }));
    expect(await screen.findByText('This invoice is already entered')).toBeInTheDocument();
    expect(screen.getByText('GE-2026-00001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.anything(), true, true));
  });

  it('saves a draft, and asks before leaving with unsaved changes', async () => {
    mockFetch(masters);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    renderWithProviders(<GateEntryForm initial={filled()} onSave={onSave} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ send: false }), false, false));
    await userEvent.type(screen.getByLabelText('Driver name'), 'Ramesh');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(onCancel).toHaveBeenCalled();
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

describe('Master data "+ New"', () => {
  it('shows "+ New" only for permitted roles and selects the record it creates', async () => {
    const { MasterSelect } = await import('./master/MasterSelect');
    const { useState } = await import('react');
    let created = false;
    mockFetch({
      '/bff/auth/me': { body: { id: 1, role: 'GATE', display_name: 'Gate' } },
      '/bff/policy': { body: { 'master.create_roles': { supplier: ['ADMIN', 'GATE'], unit: ['ADMIN'] } } },
      'GET /bff/master/suppliers': () => ({ body: page(created ? [{ id: 7, code: 'SUP-NEW', name: 'New Supplier' }] : []) }),
      'POST /bff/master/suppliers': (init) => { created = true; expect(JSON.parse(String(init!.body))).toMatchObject({ code: 'SUP-NEW', name: 'New Supplier' }); return { status: 201, body: { id: 7 } }; },
      '/bff/master': { body: page([]) },
    });
    function Form() {
      const [s, setS] = useState('');
      const [u, setU] = useState('');
      return (
        <>
          <MasterSelect kind="supplier" label="Supplier" value={s} onChange={setS} options={s ? [{ value: 7, label: 'New Supplier' }] : []} />
          <MasterSelect kind="unit" label="Unit" value={u} onChange={setU} options={[]} />
          <output data-testid="chosen">{s}</output>
        </>
      );
    }
    renderWithProviders(<Form />);
    const add = await screen.findByRole('button', { name: '+ New' }); // only one: suppliers yes, units no
    expect(screen.getAllByRole('button', { name: '+ New' })).toHaveLength(1);
    expect(screen.getByText(/No units yet — ask an administrator/)).toBeInTheDocument();
    await userEvent.click(add);
    await userEvent.type(screen.getByLabelText(/^Code/), 'sup-new');
    await userEvent.type(screen.getByLabelText(/^Name/), 'New Supplier');
    await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }));
    await waitFor(() => expect(screen.getByTestId('chosen')).toHaveTextContent('7'));
  });
});

describe('Master data editor', () => {
  it('edits a material including its lab tests and sends a PATCH', async () => {
    const { MasterEditor } = await import('./master/MasterEditor');
    const { kindBySlug } = await import('./master/config');
    let sent: Record<string, unknown> | null = null;
    mockFetch({
      '/bff/master/units': { body: page([{ id: 2, code: 'T', name: 'Tonne', symbol: 't' }]) },
      '/bff/master/test-definitions': { body: page([{ id: 1, code: 'MOIST', name: 'Moisture' }, { id: 5, code: 'PUR', name: 'Purity' }]) },
      'PATCH /bff/master/materials/9': (init) => { sent = JSON.parse(String(init!.body)); return { body: { id: 9 } }; },
      '/bff/master': { body: page([]) },
    });
    const row = { id: 9, code: 'MAT-9', name: 'Soda', default_unit: 2, qc_required: true, requires_expiry: true, requires_retest: true,
      allow_partial_issue: false, test_requirements: [{ test_definition: 1 }] };
    const onSaved = vi.fn();
    renderWithProviders(<MasterEditor kind={kindBySlug('materials')!} record={row} onClose={vi.fn()} onSaved={onSaved} />);
    expect(await screen.findByLabelText('MOIST — Moisture')).toBeChecked();
    await userEvent.click(screen.getByLabelText('PUR — Purity'));
    await userEvent.clear(screen.getByLabelText(/^Code/));
    await userEvent.type(screen.getByLabelText(/^Code/), 'mat-9a');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(false));
    expect(sent).toMatchObject({ code: 'MAT-9A', name: 'Soda', default_unit: 2, test_ids: [1, 5], qc_required: true, category: null });
  });
});


describe('Searchable dropdown', () => {
  it('filters by every word typed (label and keywords), picks with the keyboard, and Escape only closes the list', async () => {
    const { SearchableSelect } = await import('./SearchableSelect');
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog open onClose={onClose} title="Pick" onConfirm={async () => undefined}>
        <SearchableSelect label="Supplier" value="" onChange={onChange} required options={[
          { value: 1, label: 'Alpha Chemicals (SUP-1)', keywords: '21AAA gst' },
          { value: 2, label: 'Beta Polymers (SUP-2)', keywords: '27BBB' },
          { value: 3, label: 'Alpha Metals (SUP-3)' },
        ]} />
      </ConfirmDialog>,
    );
    const box = screen.getByRole('combobox', { name: /Supplier/ });
    await userEvent.type(box, 'alpha met');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Alpha Metals (SUP-3)']);
    await userEvent.clear(box);
    await userEvent.type(box, '27bbb');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Beta Polymers (SUP-2)']);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('2');
    await userEvent.type(box, 'zzz');
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled(); // the dialog stays open
  });
});

describe('Password field', () => {
  it('shows and hides the typed password with the eye button', async () => {
    const { PasswordField } = await import('./forms');
    render(<PasswordField label="Password" defaultValue="" />);
    const input = screen.getByLabelText('Password');
    await userEvent.type(input, 'S3cret!');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('S3cret!');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('Unit-aware verification', () => {
  it('treats 0.25 t received against a 250 kg invoice line as a match', async () => {
    const { VerifyDialog, expectedIn } = await import('./receiving/LineDialogs');
    const conv = [{ from_unit: 2, to_unit: 1, factor: '1000' }];
    expect(expectedIn(250, 1, 2, conv)).toBe(0.25); // kg → t via the inverse of t → kg
    expect(expectedIn(250, 1, 9, conv)).toBeNull();
    mockFetch({
      '/bff/policy': { body: { 'receiving.line_acceptance': 'WHOLE', 'package.unit_codes': ['T'] } },
      '/bff/master/units': { body: page([{ id: 1, code: 'KG', symbol: 'kg' }, { id: 2, code: 'T', symbol: 't' }]) },
      '/bff/master/unit-conversions': { body: page([{ from_unit: 2, to_unit: 1, factor: '1000.00000000' }]) },
      '/bff/master': { body: page([]) },
    });
    const line = { id: 'l4', line_number: 4, declared_quantity: '250.0000', declared_unit: 1, declared_unit_symbol: 'kg', material_name: 'Billets' } as never;
    renderWithProviders(<VerifyDialog open line={line} onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(/^Unit/)).toHaveDisplayValue('t'));
    await userEvent.type(screen.getByLabelText(/Received quantity/), '0.25');
    expect(await screen.findByText('Matches invoice (250 kg = 0.25 t).')).toBeInTheDocument();
    expect(screen.queryByText(/will be flagged/)).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Received quantity/));
    await userEvent.type(screen.getByLabelText(/Received quantity/), '0.248');
    expect(await screen.findByText('Short by 0.002 t (250 kg = 0.25 t)')).toBeInTheDocument();
  });

  it('the mouse wheel leaves a number field instead of changing its value', async () => {
    const { Providers } = await import('@/app/providers');
    render(<Providers><input type="number" aria-label="Qty" defaultValue="250" /></Providers>);
    const qty = screen.getByLabelText('Qty');
    qty.focus();
    qty.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }));
    expect(qty).not.toHaveFocus();
    expect(qty).toHaveValue(250);
  });
});

describe('Weighing the loaded truck', () => {
  it('refuses a loaded weight that is not more than the invoice weight, before calling the API', async () => {
    const { calls } = mockFetch({ '/bff/master/units': { body: page([{ id: 1, code: 'KG', name: 'Kilogram', symbol: 'kg', unit_type: 'WEIGHT' }, { id: 2, code: 'T', name: 'Tonne', symbol: 't', unit_type: 'WEIGHT' }]) } });
    const { WeighDialog } = await import('./receiving/WeighDialog');
    renderWithProviders(<WeighDialog stage="LOADED" receipt={{ id: 'r1', gross_weight: null, weight_unit: null, weight_unit_symbol: '', invoice_weight_kg: '185000' }}
      onClose={() => undefined} onDone={() => undefined} />);
    expect(await screen.findByText(/Material on the invoice: 1,85,000 kg/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Unit'), '2');
    await userEvent.type(screen.getByLabelText(/Weight/), '20');
    expect(screen.getByText('Must be more than the invoice weight (185 t).')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save and start unloading' }));
    expect(calls.some((c) => c.url.includes('/weigh'))).toBe(false);
  });
});

describe('Weighing the empty truck', () => {
  it('asks for a strong confirmation when the net weight does not match the invoice, and saves only after it', async () => {
    const { calls } = mockFetch({
      '/bff/master/units': { body: page([{ id: 1, code: 'KG', name: 'Kilogram', symbol: 'kg', unit_type: 'WEIGHT' }, { id: 2, code: 'T', name: 'Tonne', symbol: 't', unit_type: 'WEIGHT' }]) },
      '/bff/policy': { body: { 'receipt.weight_tolerance_percent': '0.5' } },
      'POST /bff/receiving/goods-receipts/r1/weigh': { body: {} },
    });
    const { WeighDialog } = await import('./receiving/WeighDialog');
    const onDone = vi.fn();
    renderWithProviders(<WeighDialog stage="EMPTY" receipt={{ id: 'r1', gross_weight: '9502', weight_unit: 1, weight_unit_symbol: 'kg', invoice_weight_kg: '1500' }}
      onClose={() => undefined} onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText(/Weight/), '8250');
    expect(await screen.findByText(/does not match \(16\.53%, allowed 0\.5%\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save empty weight' }));
    expect(await screen.findByText('⚠ Weight does not match the invoice')).toBeInTheDocument();
    expect(screen.getByText(/Short by 248 kg/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/weigh'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Check the reading again' }));
    expect(screen.queryByText('⚠ Weight does not match the invoice')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save empty weight' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, the reading is correct — save' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/weigh'))).toBe(true));
    expect(onDone).toHaveBeenCalledWith(expect.stringContaining('manager'));
  });

  it('saves straight away when the weight matches', async () => {
    const { calls } = mockFetch({
      '/bff/master/units': { body: page([{ id: 1, code: 'KG', name: 'Kilogram', symbol: 'kg', unit_type: 'WEIGHT' }]) },
      '/bff/policy': { body: { 'receipt.weight_tolerance_percent': '0.5' } },
      'POST /bff/receiving/goods-receipts/r1/weigh': { body: {} },
    });
    const { WeighDialog } = await import('./receiving/WeighDialog');
    renderWithProviders(<WeighDialog stage="EMPTY" receipt={{ id: 'r1', gross_weight: '9502', weight_unit: 1, weight_unit_symbol: 'kg', invoice_weight_kg: '1500' }}
      onClose={() => undefined} onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText(/Weight/), '8000');
    await userEvent.click(screen.getByRole('button', { name: 'Save empty weight' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/weigh'))).toBe(true));
    expect(screen.queryByText('⚠ Weight does not match the invoice')).not.toBeInTheDocument();
  });
});

describe('Factory request for a mixture', () => {
  it('turns shares into quantities, insists on 100 %, and shows lab-passed stock', async () => {
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/requests/new', useSearchParams: () => new URLSearchParams() }));
    const posted: unknown[] = [];
    mockFetch({
      '/bff/master/factories': { body: page([{ id: 1, code: 'F1', name: 'Unit 1' }]) },
      '/bff/master/departments': { body: page([]) },
      '/bff/master/materials': { body: page([{ id: 5, code: 'FE', name: 'Iron', default_unit: 2 }, { id: 6, code: 'AL', name: 'Aluminium', default_unit: 2 }]) },
      '/bff/master/units': { body: page([{ id: 2, code: 'T', name: 'Tonne', symbol: 't', unit_type: 'WEIGHT' }]) },
      '/bff/policy': { body: {} },
      '/bff/auth/me': { body: { id: 1, username: 'f', role: 'FACTORY', display_name: 'F' } },
      '/bff/inventory/requests/availability': { body: [{ material: 5, unit: 't', available_quantity: '12.5', in_stock: '20' }] },
      'POST /bff/inventory/requests': (init) => { posted.push(JSON.parse(String(init?.body))); return { body: { id: 'r1', request_number: 'REQ-1' } }; },
    });
    const { default: NewRequestPage } = await import('@/app/(app)/requests/new/page');
    renderWithProviders(<NewRequestPage />);
    await userEvent.type(screen.getByLabelText('Product / grade to make'), 'Alloy Fe-Al 70/30');
    await userEvent.type(screen.getByLabelText(/Quantity to make/), '10');
    await userEvent.type(screen.getByRole('combobox', { name: /Factory/ }), 'unit');
    await userEvent.click(await screen.findByRole('option', { name: 'Unit 1' }));
    await userEvent.click(screen.getByLabelText(/This is a mixture/));
    await userEvent.type(screen.getByRole('combobox', { name: /Material 1/ }), 'iron');
    await userEvent.click(await screen.findByRole('option', { name: 'Iron (FE)' }));
    await userEvent.type(screen.getByLabelText('Share (%)'), '70');
    expect(await screen.findByText(/Lab-passed, available now: 12.5 t/)).toBeInTheDocument();
    expect(screen.getByText('7 t')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText(/they must add up to 100 %/)).toBeInTheDocument();
    expect(posted).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: '+ Add material' }));
    await userEvent.type(screen.getByRole('combobox', { name: /Material 2/ }), 'alu');
    await userEvent.click(await screen.findByRole('option', { name: 'Aluminium (AL)' }));
    await userEvent.type(screen.getAllByLabelText('Share (%)')[1], '30');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ factory: 1, product_name: 'Alloy Fe-Al 70/30', product_quantity: '10', product_unit: 2,
      lines: [{ material: 5, percentage: '70' }, { material: 6, percentage: '30' }] });
  });
});
