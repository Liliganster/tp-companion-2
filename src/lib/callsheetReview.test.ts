import { describe, expect, it } from 'vitest';
import { canMaterializeCallsheet, compactCallsheetReviewReason, getReviewCallsheetDrafts, type ReviewCallsheetJob } from './callsheetReview';

const job: ReviewCallsheetJob = { id: 'job-1', status: 'needs_review', storage_path: 'user/job-1/Dispo #17.pdf', created_at: '2026-09-10T08:00:00Z', project_id: 'project-1' };

it.each([
  ['needs_review', 'needs_review', 'candidate', false],
  ['done', 'needs_review', 'confirmed', false],
  ['done', 'done', 'candidate', false],
  ['failed', 'done', 'confirmed', false],
  ['done', 'done', 'confirmed', true],
])('project materialization respects stored state even with stale UI: %s/%s/%s', (status, result, selection_state, allowed) => {
  expect(canMaterializeCallsheet(String(status), String(result), [{ selection_state: String(selection_state) }])).toBe(allowed);
});

it('restores the partial date already saved by older extractions without assigning a year',()=>{
 const [draft]=getReviewCallsheetDrafts(JSON.parse(JSON.stringify([{...job,callsheet_results:{date_value:null,date_evidence:'Tuesday, 19th Nov'},callsheet_locations:[{formatted_address:'Example Street 12'}]}])),[],[]);
 expect(draft.trip).toMatchObject({date:'',extractedDate:'Tuesday, 19th Nov',route:['Example Street 12']});
});
it('keeps old verbose review messages compact without copying Maps URLs',()=>{
 const reason='Check the date https://maps.app.goo.gl/example '+ 'Repeated explanation '.repeat(30);
 expect(compactCallsheetReviewReason(reason).length).toBeLessThanOrEqual(110);
 expect(compactCallsheetReviewReason(reason)).not.toContain('https');
 expect(compactCallsheetReviewReason('Year missing.')).toBe('Year missing.');
});
describe('persisted callsheet review drafts', () => {
  it('restores extracted candidates and date beside the original without making a confirmed trip', () => {
    const [draft] = getReviewCallsheetDrafts([{ ...job, callsheet_results: { date_value: '2025-08-07', project_value: 'Film' }, callsheet_locations: [{ address_raw: 'Staatsoper' }, { address_raw: 'Stadtpark' }] }], [], []);
    expect(draft.trip).toMatchObject({ date: '2025-08-07', route: ['Staatsoper', 'Stadtpark'], distance: 0 });
    expect(draft.job.status).toBe('needs_review');
    expect(draft.trip.documents?.[0].storagePath).toBe(job.storage_path);
  });
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
