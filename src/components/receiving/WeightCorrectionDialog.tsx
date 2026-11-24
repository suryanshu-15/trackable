'use client';

import { useEffect, useState } from 'react';
import { post } from '@/lib/api';
import { fmtQty } from '@/lib/format';
import type { Receipt } from '@/lib/types';
import { ConfirmDialog } from '../Dialog';
import { TextField } from '../forms';

type WeighedReceipt = Pick<Receipt, 'id' | 'gross_weight' | 'tare_weight' | 'weight_unit_symbol' | 'invoice_weight_kg'>;

/**
 * Edit a weighbridge reading that was typed wrongly. A reason is required and the old value stays in
 * the history. The empty weight can be edited once it has been entered (until then it is the next step).
 */
export function WeightCorrectionDialog({ receipt, open, onClose, onDone }: { receipt: WeighedReceipt; open: boolean; onClose: () => void; onDone: () => void }) {
  const [gross, setGross] = useState('');
  const [tare, setTare] = useState('');
  useEffect(() => {
    if (open) { setGross(receipt.gross_weight ?? ''); setTare(receipt.tare_weight ?? ''); }
  }, [open, receipt.gross_weight, receipt.tare_weight]);
  const unit = receipt.weight_unit_symbol ?? '';
  const perUnitKg = unit === 'kg' ? 1 : unit === 't' ? 1000 : null;
  const invoice = receipt.invoice_weight_kg != null && perUnitKg ? Number(receipt.invoice_weight_kg) / perUnitKg : null;
  const tooLight = invoice != null && gross !== '' && Number(gross) <= invoice;
  const tareTooHeavy = gross !== '' && tare !== '' && Number(tare) > Number(gross);
  return (
    <ConfirmDialog open={open} onClose={onClose} title="Edit truck weight" description="Use this when a reading was typed wrongly. The old value stays in the history with your reason."
      reason="required" confirmLabel="Save weight"
      onConfirm={async (reason) => {
        if (!(Number(gross) > 0)) throw new Error('Enter the loaded truck weight.');
        if (tooLight) throw new Error(`The loaded truck must weigh more than the material on the invoice (${fmtQty(invoice, unit)}).`);
        if (tareTooHeavy) throw new Error('The empty truck cannot weigh more than the loaded truck.');
        await post(`receiving/goods-receipts/${receipt.id}/correct-weights`, {
          gross_weight: gross, ...(receipt.tare_weight != null ? { tare_weight: tare || null } : {}), reason,
        });
        onDone();
      }}>
      <div className="grid grid-cols-2 gap-3">
        <TextField label={`Loaded truck (${unit})`} type="number" inputMode="decimal" step="any" min="0" value={gross} onChange={(e) => setGross(e.target.value)}
          error={tooLight ? `Must be more than ${fmtQty(invoice, unit)}.` : undefined}
          hint={invoice != null ? `Invoice: ${fmtQty(invoice, unit)}` : undefined} />
        {receipt.tare_weight != null && (
          <TextField label={`Empty truck (${unit})`} type="number" inputMode="decimal" step="any" min="0" value={tare} onChange={(e) => setTare(e.target.value)}
            error={tareTooHeavy ? 'More than the loaded weight.' : undefined} />
        )}
      </div>
    </ConfirmDialog>
  );
}
