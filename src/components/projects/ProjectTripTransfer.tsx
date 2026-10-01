import { useState, type ComponentProps } from 'react';
import { GripVertical, Loader2 } from 'lucide-react';
import { TableRow } from '@/components/ui/table';
import { useI18n } from '@/hooks/use-i18n';
import type { Trip } from '@/contexts/TripsContext';
import type { ProjectTripDrag } from '@/lib/moveProjectTrip';

export function ProjectDropRow({ projectId, dragged, busy, onMove, children, className, ...props }: ComponentProps<typeof TableRow> & {
  projectId: string; dragged: ProjectTripDrag | null; busy: boolean;
  onMove: (trip: ProjectTripDrag, target: string) => void;
}) {
  const [over, setOver] = useState(false);
  const canDrop = !busy && dragged && dragged.sourceProjectId !== projectId;
  return <TableRow {...props} className={className + (over && canDrop ? ' bg-primary/15 ring-2 ring-inset ring-primary' : '')}
    onDragOver={event => { if (canDrop) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false); }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); setOver(false); if (canDrop) onMove(dragged, projectId); }}>
    {children}
  </TableRow>;
}

export function ProjectTripTransfer({ sourceProjectId, trips, projects, busy, onMove, onDrag }: {
  sourceProjectId: string; trips: Trip[]; projects: { id: string; name: string }[]; busy: boolean;
  onMove: (trip: ProjectTripDrag, target: string) => void;
  onDrag: (trip: ProjectTripDrag | null) => void;
}) {
  const { t, tf } = useI18n();
  return <div className="space-y-2 p-2" aria-busy={busy}>
    <p className="text-sm text-muted-foreground">{t('projects.moveTripHint')}</p>
    {!trips.length && <p className="text-sm">{t('projects.noTripsInFilter')}</p>}
    {trips.map(trip => <div key={trip.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3">
      <button type="button" draggable={!busy} disabled={busy} className="touch-auto cursor-grab rounded p-2 text-muted-foreground active:cursor-grabbing disabled:opacity-50"
        aria-label={tf('projects.dragTrip', { date: trip.date })}
        onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', trip.id); onDrag({ tripId: trip.id, sourceProjectId }); }}
        onDragEnd={() => onDrag(null)}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GripVertical className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1"><p className="font-medium">{trip.date} · {trip.distance} km</p><p className="break-words text-sm text-muted-foreground">{trip.route.join(' → ')}</p></div>
      <select value="" disabled={busy || projects.length < 2} aria-label={tf('projects.moveTripLabel', { date: trip.date })}
        className="max-w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        onChange={event => { if (event.target.value) onMove({ tripId: trip.id, sourceProjectId }, event.target.value); }}>
        <option value="" disabled>{t('projects.moveTripTo')}</option>
        {projects.filter(p => p.id !== sourceProjectId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>)}
  </div>;
}
