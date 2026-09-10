import { describe, expect, it } from 'vitest';
import { getReviewCallsheetDrafts, type ReviewCallsheetJob } from './callsheetReview';

const job: ReviewCallsheetJob = { id: 'job-1', status: 'needs_review', storage_path: 'user/job-1/Dispo #17.pdf', created_at: '2026-09-10T08:00:00Z', project_id: 'project-1' };
describe('persisted callsheet review drafts', () => {
  it('recovers the original viewer attachment after a reload without inventing a date or route', () => {
    const [draft] = getReviewCallsheetDrafts(JSON.parse(JSON.stringify([job])), [], [{ id: 'project-1', name: 'Film' }]);
    expect(draft.trip).toMatchObject({ callsheet_job_id: job.id, date: '', route: [], distance: 0, project: 'Film' });
    expect(draft.trip.documents?.[0]).toMatchObject({ storagePath: job.storage_path, name: 'Dispo #17.pdf', bucketId: 'callsheets', mimeType: 'application/pdf' });
  });
  it('removes only the saved job from review and preserves same-name documents', () => {
    const second = { ...job, id: 'job-2', storage_path: 'user/job-2/Dispo #17.pdf' };
    expect(getReviewCallsheetDrafts([job, second], [{ callsheet_job_id: job.id }], []).map(d => d.trip.id)).toEqual(['job-2']);
  });
  it('includes failures and quota failures but not cancelled or unfinished uploads', () => {
    const jobs = ['failed', 'out_of_quota', 'processing', 'cancelled'].map(status => ({ ...job, id: status, status }));
    jobs.push({ ...job, id: 'pending', storage_path: 'pending' });
    expect(getReviewCallsheetDrafts(jobs, [], []).map(d => d.trip.id)).toEqual(['failed', 'out_of_quota']);
  });
});
