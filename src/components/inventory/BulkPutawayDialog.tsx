'use client';

/**
 * Put several bags away in one location at once. If any chosen bag is waiting for the lab, only
 * quarantine locations are offered. When every bag has the same location from the gate register
 * (and none needs quarantine), that location is filled in.
 */
import { useEffect, useState } from 'react';
import { ApiError, post } from '@/lib/api';
import { fmtQty } from '@/lib/format';
import type { PackageListItem } from '@/lib/types';
import { ConfirmDialog } from '../Dialog';
import { TextArea } from '../forms';
import { LocationPicker } from './LocationPicker';

export function BulkPutawayDialog({ bags: offered, open, onClose, onDone }: {
  bags: PackageListItem[]; open: boolean; onClose: () => void; onDone: (stored: PackageListItem[]) => void;
}) {
  // Every offered bag starts ticked; untick the ones going somewhere else.
  const [chosen, setChosen] = useState<string[]>([]);
  const offeredKey = offered.map((b) => b.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setChosen(offered.map((b) => b.id)); }, [open, offeredKey]);
  const bags = offered.filter((b) => chosen.includes(b.id));
  const quarantine = bags.some((b) => b.requires_quarantine);
  const planned = [...new Set(bags.map((b) => b.planned_location))];
  const suggested = !quarantine && planned.length === 1 && planned[0] ? String(planned[0]) : '';
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) { setLocation(suggested); setNotes(''); } }, [open, suggested]);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Put away ${bags.length} bag(s)`}
      description={
        <div className="space-y-2">
          <p>All the bags below go to the same location.</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2 text-xs">
            {offered.map((b) => (
              <li key={b.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" checked={chosen.includes(b.id)} onChange={() => toggle(b.id)} aria-label={`Put away ${b.package_id}`} />
                  <span className="font-mono">{b.package_id}</span> — {fmtQty(b.current_quantity, b.unit_symbol)}
                  {b.requires_quarantine && <span className="text-amber-700">· waiting for lab → quarantine</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      }
      confirmLabel={`Put away ${bags.length} bag(s)`}
      onConfirm={async () => {
        if (!bags.length) throw new Error('Tick at least one bag.');
        if (!location) throw new Error('Choose or scan the location.');
        try {
          onDone(await post<PackageListItem[]>('inventory/packages/bulk-putaway', { packages: bags.map((b) => b.id), location: Number(location), notes }));
        } catch (err) {
          // List every bag that cannot go there, not only the first.
          const each = err instanceof ApiError ? (err.details.packages as string[] | undefined) : undefined;
          if (each?.length) throw new Error(`${err instanceof Error ? err.message : ''} ${each.join(' · ')}`);
          throw err;
        }
      }}
    >
      <LocationPicker value={location} onChange={setLocation} quarantineOnly={quarantine} />
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
    </ConfirmDialog>
  );
}
