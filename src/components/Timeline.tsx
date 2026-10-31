import type { TimelineEvent } from '@/lib/types';
import { fmtDateTime, humanize } from '@/lib/format';
import { Empty } from './ui';

function describe(e: TimelineEvent): string {
  if (e.title) return e.title;
  const status = (e.after_state as { status?: string } | null)?.status;
  const what = humanize(e.entity_type?.replace(/([a-z])([A-Z])/g, '$1_$2'));
  return `${what}: ${humanize(e.action)}${status ? ` → ${humanize(status)}` : ''}`;
}

function detailText(e: TimelineEvent): string | null {
  const reason = e.reason || (e.details?.reason as string | undefined);
  return reason ? `Reason: ${reason}` : null;
}

/** Chronological, read-only event history (receipt, package, sample). */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <Empty>No events recorded.</Empty>;
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {events.map((e, i) => (
        <li key={i} className="mb-4 ml-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-900">{describe(e)}</p>
          <p className="text-xs text-slate-500">
            {fmtDateTime(e.timestamp)}
            {(e.actor_name || e.actor) && ` · ${e.actor_name || e.actor}`}
            {e.kind && ` · ${humanize(e.kind)}`}
          </p>
          {detailText(e) && <p className="mt-0.5 text-xs text-slate-600">{detailText(e)}</p>}
        </li>
      ))}
    </ol>
  );
}
