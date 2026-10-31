'use client';

import { useEffect, useState } from 'react';
import { post } from '@/lib/api';
import { fmtQty } from '@/lib/format';
import type { Package } from '@/lib/types';
import { ConfirmDialog } from '../Dialog';
import { TextArea } from '../forms';
import { LocationPicker } from './LocationPicker';

export type MoveKind = 'putaway' | 'transfer';

export function MoveDialog({ kind, pkg, open, onClose, onDone }: {
  kind: MoveKind; pkg: Package; open: boolean; onClose: () => void; onDone: (p: Package) => void;
}) {
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) { setLocation(''); setNotes(''); } }, [open]);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={kind === 'putaway' ? `Put away ${pkg.package_id}` : `Transfer ${pkg.package_id}`}
      description={kind === 'transfer' && <>Currently at <strong>{pkg.location_display}</strong>.</>}
      confirmLabel={kind === 'putaway' ? 'Confirm put-away' : 'Confirm transfer'}
      onConfirm={async () => {
        if (!location) throw new Error('Choose or scan the destination location.');
        onDone(await post<Package>(`inventory/packages/${pkg.id}/${kind}`, { location: Number(location), notes }));
      }}
    >
      <LocationPicker value={location} onChange={setLocation} quarantineOnly={pkg.requires_quarantine} excludeId={pkg.current_location} />
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
    </ConfirmDialog>
  );
}

export function SplitDialog({ pkg, open, onClose, onDone }: {
  pkg: Package; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  const quantities = text.split(/[\s,;]+/).filter(Boolean).map(Number);
  const total = quantities.reduce((a, b) => a + b, 0);
  const free = Number(pkg.current_quantity) - Number(pkg.reserved_quantity || 0);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Split / repack ${pkg.package_id}`}
      description={<>Creates new labelled child packages from this one. Current {fmtQty(pkg.current_quantity, pkg.unit_symbol)}{Number(pkg.reserved_quantity) > 0 && <>, of which {fmtQty(pkg.reserved_quantity, pkg.unit_symbol)} is reserved</>}. QC status, lot and history carry over.</>}
      confirmLabel="Split"
      reason="required"
      onConfirm={async (reason) => {
        if (!quantities.length || quantities.some((q) => !(q > 0))) throw new Error('Enter at least one quantity above zero.');
        if (total > free + 1e-9) throw new Error(`Total ${fmtQty(total, pkg.unit_symbol)} exceeds the unreserved ${fmtQty(free, pkg.unit_symbol)}.`);
        await post(`inventory/packages/${pkg.id}/split`, { quantities: quantities.map(String), reason });
        onDone();
      }}
    >
      <TextArea label={`New package quantities (${pkg.unit_symbol})`} hint={`One per new package, e.g. 50, 50. Total: ${fmtQty(total)}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} />
    </ConfirmDialog>
  );
}
