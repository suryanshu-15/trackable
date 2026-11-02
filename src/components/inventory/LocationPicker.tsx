'use client';

import { useMemo, useState } from 'react';
import { useLocations } from '@/lib/hooks';
import type { Location } from '@/lib/types';
import { TextField } from '../forms';
import { MasterSelect } from '../master/MasterSelect';

/** Only leaf locations (shelves, bins…) can hold stock; parents are containers. */
export function storableLocations(all: Location[]): Location[] {
  const parents = new Set(all.map((l) => l.parent).filter(Boolean));
  return all.filter((l) => !parents.has(l.id));
}

export function locationLabel(l: Location) {
  return `${l.warehouse_name ? `${l.warehouse_name} / ` : ''}${l.full_path}${l.is_quarantine ? ' (quarantine)' : ''}`;
}

/**
 * Pick a storage location by scanning / typing its code or choosing from the list. When the
 * package must be quarantined only quarantine locations are offered (the API enforces this too).
 */
export function LocationPicker({ value, onChange, quarantineOnly, excludeId, error }: {
  value: string; onChange: (id: string) => void; quarantineOnly?: boolean; excludeId?: number | null; error?: string;
}) {
  const { items, isLoading } = useLocations();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const options = useMemo(
    () => storableLocations(items)
      .filter((l) => (!quarantineOnly || l.is_quarantine) && l.id !== excludeId)
      .sort((a, b) => a.full_path.localeCompare(b.full_path)),
    [items, quarantineOnly, excludeId],
  );

  const resolve = (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!c) return;
    const hit = options.find((l) => l.full_path.toUpperCase() === c || l.code.toUpperCase() === c);
    if (hit) { onChange(String(hit.id)); setCodeError(undefined); setCode(''); }
    else setCodeError(`No ${quarantineOnly ? 'quarantine ' : ''}storage location matches “${raw.trim()}”.`);
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <TextField
        label="Scan location code"
        placeholder="e.g. A-R1-S2"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resolve(code); } }}
        onBlur={() => code && resolve(code)}
        error={codeError}
        autoComplete="off"
      />
      <MasterSelect
        kind="location"
        defaults={quarantineOnly ? { location_type: 'QUARANTINE', is_quarantine: true } : undefined}
        label="Location"
        required
        value={value}
        onChange={onChange}
        error={error}
        placeholder={isLoading ? 'Loading…' : 'Choose a location'}
        options={options.map((l) => ({ value: l.id, label: locationLabel(l) }))}
        hint={quarantineOnly ? 'This package is pending or failed QC and must go to quarantine.' : undefined}
      />
    </div>
  );
}
