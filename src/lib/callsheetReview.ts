import type { Trip } from '@/contexts/TripsContext';
import { resolveCallsheetMime } from './callsheetMime';

export function canMaterializeCallsheet(status: string | null | undefined, resultState: string | null | undefined, locations: { selection_state?: string | null }[]) {
  return status === 'done' && resultState !== 'needs_review' && locations.every(location => location.selection_state !== 'candidate');
}

export type ReviewCallsheetJob = {
  id: string;
  storage_path: string;
  created_at: string;
  project_id?: string | null;
  status: string;
  needs_review_reason?: string | null;
  callsheet_results?: { date_value?: string | null; date_evidence?: string | null; project_value?: string | null } | null;
  callsheet_locations?: { formatted_address?: string | null; address_raw?: string | null; name_raw?: string | null; page?: number | null; position?: number | null; label_source?: string | null; selection_state?: string | null; review_reason?: string | null }[];
};

// These drafts are already persisted as jobs. They are not confirmed trips and
// must not enter reports, distances or emissions before the user saves them.
export function getReviewCallsheetDrafts(jobs: ReviewCallsheetJob[], trips: Pick<Trip, 'callsheet_job_id'>[], projects: { id: string; name: string }[]) {
  const saved = new Set(trips.map(t => t.callsheet_job_id).filter(Boolean));
  return jobs.filter(job => ['created', 'queued', 'processing', 'done', 'failed', 'needs_review', 'out_of_quota', 'cancelled'].includes(job.status) && !saved.has(job.id) && job.storage_path && job.storage_path !== 'pending')
    .map(job => {
      const name = job.storage_path.split('/').pop() || job.id;
      const trip: Trip = {
        id: job.id, callsheet_job_id: job.id, date: job.callsheet_results?.date_value ?? '',
        extractedDate: job.callsheet_results?.date_evidence ?? undefined,
        route: [...(job.callsheet_locations ?? [])].sort((a, b) => (a.position ?? a.page ?? 0) - (b.position ?? b.page ?? 0))
          .map(location => location.formatted_address ?? location.address_raw ?? '').filter(Boolean),
        project: projects.find(p => p.id === job.project_id)?.name ?? job.callsheet_results?.project_value ?? '',
        projectId: job.project_id, purpose: '', passengers: 0, distance: 0, co2: 0,
        documents: [{ id: job.id, name, storagePath: job.storage_path, bucketId: 'callsheets',
          mimeType: resolveCallsheetMime(job.storage_path), kind: 'document', createdAt: job.created_at }],
      };
      return { job, trip, name };
    });
}

/** Presentation only. Preserve full evidence in storage; keep review rows short. */
export function compactCallsheetReviewReason(reason?: string | null): string {
  const text = (reason ?? '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  return text.length <= 110 ? text : `${text.slice(0, 107).trimEnd()}…`;
}
