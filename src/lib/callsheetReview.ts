import type { Trip } from '@/contexts/TripsContext';
import { resolveCallsheetMime } from './callsheetMime';

export type ReviewCallsheetJob = {
  id: string;
  storage_path: string;
  created_at: string;
  project_id?: string | null;
  status: string;
  needs_review_reason?: string | null;
};

// These drafts are already persisted as jobs. They are not confirmed trips and
// must not enter reports, distances or emissions before the user saves them.
export function getReviewCallsheetDrafts(jobs: ReviewCallsheetJob[], trips: Pick<Trip, 'callsheet_job_id'>[], projects: { id: string; name: string }[]) {
  const saved = new Set(trips.map(t => t.callsheet_job_id).filter(Boolean));
  return jobs.filter(job => ['failed', 'needs_review', 'out_of_quota'].includes(job.status) && !saved.has(job.id) && job.storage_path && job.storage_path !== 'pending')
    .map(job => {
      const name = job.storage_path.split('/').pop() || job.id;
      const trip: Trip = {
        id: job.id, callsheet_job_id: job.id, date: '', route: [],
        project: projects.find(p => p.id === job.project_id)?.name ?? '',
        projectId: job.project_id, purpose: '', passengers: 0, distance: 0, co2: 0,
        documents: [{ id: job.id, name, storagePath: job.storage_path, bucketId: 'callsheets',
          mimeType: resolveCallsheetMime(job.storage_path), kind: 'document', createdAt: job.created_at }],
      };
      return { job, trip, name };
    });
}
