import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ warning: vi.fn(), info: vi.fn(), confirm: vi.fn(), save: vi.fn(), fetch: vi.fn(), error: vi.fn(), optimize: vi.fn(), tables: [] as any[], jobs: [] as any[], locations: [] as any[], result: null as any, t: (s: string) => s, tf: vi.fn((s: string) => s) }));
vi.mock('@/lib/callsheetOptimization', () => ({ optimizeCallsheetLocationsAndDistance: mocks.optimize }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: mocks.t, tf: mocks.tf, locale: 'es' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ getAccessToken: async () => 'test' }) }));
vi.mock('@/contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: { baseAddress: 'Home' } }) }));
vi.mock('@/contexts/ProjectsContext', () => ({ useProjects: () => ({ projects: [{ id: 'project', name: 'Film' }], addProject: async () => true, updateProject: async () => true }) }));
vi.mock('@/contexts/TripsContext', () => ({ useTrips: () => ({ trips: mocks.tables }) }));
vi.mock('@/hooks/use-ai-quota', () => ({ useAiQuota: () => ({ used: 0, limit: 3, remaining: 3 }) }));
vi.mock('@/hooks/use-plan-limits', () => ({ usePlanLimits: () => ({ checkCSVImportLimit: () => ({ allowed: true }), checkStopsLimit: () => ({ allowed: true }), canAddNonAITrip: { allowed: true }, limits: { maxCallsheetsPerBatch: 5 } }) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: mocks.jobs.length ? { id: 'user' } : null } }) },
  from: (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    const q: any = { select: () => q, eq: () => q, order: () => q, range: () => q,
      maybeSingle: async () => ({ data: mocks.result, error: null }),
      in: (key: string, values: any[]) => { filters.push(row => values.includes(row[key])); return q; },
      then: (resolve: any) => Promise.resolve({ data: (table === 'callsheet_locations' ? mocks.locations : mocks.jobs).filter(row => filters.every(fn => fn(row))), error: null }).then(resolve),
    }; return q;
  },
} }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: () => {}, info: mocks.info, warning: mocks.warning } }));
import { BulkUploadModal } from './BulkUploadModal';
const csv = 'date;projectName;origin;destination;km\n2026-09-09;Film;A;B;25';
function file(name: string, text: string, type = 'text/csv') {
  const f = new File([text], name, { type });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer });
  return f;
}
function open() { return render(<MemoryRouter><BulkUploadModal defaultOpen trigger={<button>Open</button>} onSave={mocks.save} /></MemoryRouter>); }
beforeEach(() => { cleanup(); mocks.jobs = []; mocks.tables = []; mocks.locations = []; mocks.result = null; vi.clearAllMocks(); mocks.fetch.mockReset(); vi.stubGlobal("confirm", mocks.confirm); mocks.confirm.mockReturnValue(true); mocks.save.mockResolvedValue(true); mocks.optimize.mockResolvedValue({ locations: ['Merged place'], distanceKm: 12 }); vi.stubGlobal('fetch', mocks.fetch); });
describe('bulk import user flow', () => {
  it.each(['needs_review', 'done'])('preserves row associations, edits and saved route when reopening %s', async status => {
    mocks.jobs = [{ id: 'job', status, storage_path: 'user/job/Original.pdf', created_at: new Date().toISOString() }];
    mocks.result = { date_value: '2026-09-10', project_value: 'Film' };
    mocks.locations = [
      { position: 0, label_source: 'LOCATION 1', address_raw: 'Jesuitenwiese Prater', formatted_address: status === 'done' ? 'Park Street 1' : '', selection_state: status === 'done' ? 'confirmed' : 'candidate', review_reason: status === 'done' ? null : 'Confirm park address' },
      { position: 1, label_source: 'LOCATION 2', address_raw: 'Erzbischofgasse 8', formatted_address: 'Erzbischofgasse 8, Wien', selection_state: 'confirmed' },
    ];
    open();
    const first = await screen.findByDisplayValue(status === 'done' ? 'Park Street 1' : 'Jesuitenwiese Prater');
    const second = screen.getByDisplayValue('Erzbischofgasse 8, Wien');
    expect(screen.queryByText('bulk.docProcessFailed')).not.toBeInTheDocument();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.tf).toHaveBeenCalledWith('bulk.aiParallelReviewStats', expect.objectContaining({
      review: status === 'needs_review' ? 1 : 0, failed: 0,
    }));
    expect(within(first.parentElement!).getByText(/LOCATION 1/)).toHaveTextContent(status === 'done' ? 'bulk.statusReady' : 'bulk.statusNeedsReview');
    expect(within(second.parentElement!).getByText(/LOCATION 2/)).toHaveTextContent('bulk.statusReady');
    if (status === 'needs_review') {
      expect(within(first.parentElement!).getByText('Confirm park address')).toBeInTheDocument();
      expect(mocks.optimize).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(mocks.optimize).toHaveBeenCalledOnce());
      await waitFor(() => expect(screen.getByText('bulk.saveTrip')).not.toBeDisabled());
      expect(screen.queryByDisplayValue('Merged place')).toBeNull();
    }
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(first, { target: { value: 'Reviewed Park Address' } });
    fireEvent.click(screen.getByText('bulk.saveTrip'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      callsheet_job_id: 'job', route: ['Home', 'Reviewed Park Address', 'Erzbischofgasse 8, Wien', 'Home'],
    })));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('defaults to manual CSV; drop, edit and save use the reviewed value without AI', async () => {
    open();
    expect(screen.getByLabelText('bulk.pasteCsv')).toBeInTheDocument();
    expect(screen.queryByLabelText('bulk.aiPasteLabel')).toBeNull();
    fireEvent.drop(screen.getByRole('dialog'), { dataTransfer: { files: [file('trips.csv', csv)] } });
    await screen.findByLabelText('km 1');
    fireEvent.change(screen.getByLabelText('km 1'), { target: { value: '42' } });
    fireEvent.click(screen.getByText('bulk.saveManual'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ distance: 42, date: '2026-09-09', route: ['A', 'B'] })));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('stages pasted CSV for review without saving or using AI until confirmed', async () => {
    open();
    fireEvent.change(screen.getByLabelText('bulk.pasteCsv'), { target: { value: csv } });
    fireEvent.click(screen.getByText('bulk.reviewPastedCsv'));
    await screen.findByLabelText('km 1');
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('km 1'), { target: { value: '18,5' } });
    fireEvent.click(screen.getByText('bulk.saveManual'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ distance: 18.5 })));
  });
  it('keeps the review after a failed save and does not repeat successful rows on retry', async () => {
    mocks.save.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValue(true);
    open();
    fireEvent.drop(screen.getByRole('dialog'), { dataTransfer: { files: [file('trips.csv', csv + '\n2026-09-10;Film;C;D;30')] } });
    await screen.findByLabelText('km 2'); fireEvent.click(screen.getByText('bulk.saveManual'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('bulk.saveManual')).not.toBeDisabled());
    fireEvent.click(screen.getByText('bulk.saveManual'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][0].date).toBe('2026-09-10');
  });
  it('blocks impossible dates before saving any rows', async () => {
    open(); fireEvent.drop(screen.getByRole('dialog'), { dataTransfer: { files: [file('bad.csv', csv.replace('2026-09-09', '2026-02-31'))] } });
    await screen.findByLabelText('km 1'); fireEvent.click(screen.getByText('bulk.saveManual'));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled()); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('AI selection appends dropped files, allows removal and stages pasted messages without calling AI', async () => {
    open();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'bulk.tabAi' }), { button: 0, ctrlKey: false });
    await screen.findByLabelText('bulk.aiPasteLabel');
    fireEvent.drop(screen.getByRole('dialog'), { dataTransfer: { files: [file('Dispo #25.pdf', '%PDF', 'application/pdf'), file('two.pdf', '%PDF', 'application/pdf')] } });
    expect(screen.getByRole('button', { name: 'bulk.removeFile Dispo #25.pdf' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'bulk.removeFile Dispo #25.pdf' }));
    expect(screen.queryByRole('button', { name: 'bulk.removeFile Dispo #25.pdf' })).toBeNull();
    fireEvent.change(screen.getByLabelText('bulk.aiPasteLabel'), { target: { value: 'Rodaje mañana a las 8 en Viena' } });
    fireEvent.click(screen.getByText('bulk.aiAddText'));
    expect(screen.getByRole('button', { name: /bulk.removeFile mensaje-/ })).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

it('reopens a four-document batch with both failed and cancelled originals, excluding only the two saved trips', async () => {
  mocks.jobs = ['done', 'failed', 'cancelled', 'done'].map((status,index) => ({ id: 'job-'+index, status, storage_path: 'user/job-'+index+'/Document-'+index+'.pdf', created_at: new Date().toISOString(), needs_review_reason: status === 'failed' ? 'Upload failed' : null }));
  mocks.tables = [{ callsheet_job_id: 'job-0' }, { callsheet_job_id: 'job-3' }];
  open();
  await screen.findByText('Document-1.pdf');
  expect(await screen.findByText('Document-2.pdf')).toBeInTheDocument();
  expect(screen.queryByText('Document-0.pdf')).not.toBeInTheDocument();
  expect(screen.queryByText('Document-3.pdf')).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('closes the modal without cancelling server extraction', async () => {
  mocks.jobs = [{ id: 'job', status: 'processing', storage_path: 'user/job/Active.pdf', created_at: new Date().toISOString(), processing_started_at: new Date().toISOString() }];
  open(); await screen.findByText('Active.pdf');
  fireEvent.click(screen.getAllByRole('button', { name: 'modal.close' })[0]);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.jobs[0].status).toBe('processing');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each(['failed', 'cancelled'])('retries a %s document only on explicit confirmation, using its existing id', async status => {
  mocks.jobs = [{ id: 'job', status, storage_path: 'user/job/Original.pdf', created_at: new Date().toISOString() }];
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, status: "done" }), { status: 200 }));
  open(); await screen.findByText('Original.pdf');
  expect(mocks.fetch).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'bulk.retryDocument' }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
  expect(mocks.confirm).toHaveBeenCalledWith('bulk.retryDocumentConfirm');
  expect(mocks.fetch.mock.calls[0][0]).toMatch(/^\/api\/callsheets\/process\?jobId=job&requestId=[a-f0-9-]+$/);
  expect(mocks.fetch.mock.calls[0][1].method).toBe('POST');
});
it('does not retry when the user declines the new extraction', async () => {
  mocks.jobs = [{ id: 'job', status: 'failed', storage_path: 'user/job/Original.pdf', created_at: new Date().toISOString() }];
  mocks.confirm.mockReturnValue(false);
  open(); await screen.findByText('Original.pdf');
  fireEvent.click(await screen.findByRole('button', { name: 'bulk.retryDocument' }));
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('reextracts a reviewed document from scratch and replaces the previous preview with the new version', async () => {
  mocks.jobs = [{ id: 'job', status: 'needs_review', ai_request_id: 'old', storage_path: 'user/job/Original.pdf', created_at: new Date().toISOString() }];
  mocks.result = { date_value: '2026-09-10', project_value: 'Old Film', extraction_request_id: 'old' };
  mocks.locations = [{ position: 0, address_raw: 'Old address', selection_state: 'candidate' }];
  let complete!: (value: Response) => void;
  mocks.fetch.mockImplementation(() => new Promise<Response>(resolve => { complete = resolve; }));
  open(); await screen.findByDisplayValue('Old address');
  fireEvent.click(screen.getByRole('button', { name: 'bulk.retryDocument' }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
  expect(screen.queryByDisplayValue('Old address')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'bulk.retryDocument' })).not.toBeInTheDocument();
  const url = new URL(mocks.fetch.mock.calls[0][0], 'https://example.test');
  const freshId = url.searchParams.get('requestId');
  mocks.jobs = [{ ...mocks.jobs[0], status: 'needs_review', ai_request_id: freshId }];
  mocks.result = { date_value: '2026-10-01', project_value: 'New Film', extraction_request_id: freshId };
  mocks.locations = [{ position: 0, address_raw: 'New address', selection_state: 'candidate' }];
  complete(new Response(JSON.stringify({ ok: true, status: 'needs_review', reviewReason: 'Check address' }), { status: 200 }));
  expect(await screen.findByDisplayValue('New address')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Old address')).not.toBeInTheDocument();
  expect(screen.getByDisplayValue('New Film')).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.save).not.toHaveBeenCalled();
});

it('restores the previous review when both processing slots are busy, without auto retrying', async () => {
  mocks.jobs = [{ id: 'job', status: 'needs_review', storage_path: 'user/job/Original.pdf', created_at: new Date().toISOString() }];
  mocks.result = { date_value: '2026-09-10', project_value: 'Film' };
  mocks.locations = [{ position: 0, address_raw: 'Reviewed address', selection_state: 'candidate' }];
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'not_claimable', status: 'processing' }), { status: 409 }));
  open(); await screen.findByDisplayValue('Reviewed address');
  fireEvent.click(screen.getByRole('button', { name: 'bulk.retryDocument' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('bulk.retryBusy'));
  expect(await screen.findByDisplayValue('Reviewed address')).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledOnce();
});

it('retries a timed-out processing document with a fresh identity instead of an ignored worker dispatch', async () => {
  mocks.jobs = [{ id: 'job', status: 'processing', ai_request_id: 'old', storage_path: 'user/job/Original.pdf', created_at: '2020-01-01', processing_started_at: '2020-01-01' }];
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, status: 'done' }), { status: 200 }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'bulk.retryDocument' }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
  expect(mocks.fetch.mock.calls[0][0]).toMatch(/^\/api\/callsheets\/process\?jobId=job&requestId=[a-f0-9-]+$/);
});

it('shows the manual-review toast when the three-retry limit is reached', async () => {
  mocks.jobs = [{ id: 'job', status: 'failed', storage_path: 'user/job/Original.pdf', created_at: new Date().toISOString() }];
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'retry_limit_exceeded', retryCount: 3 }), { status: 409 }));
  open(); fireEvent.click(await screen.findByRole('button', { name: 'bulk.retryDocument' }));
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith('bulk.retryLimit'));
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'bulk.retryDocument' })).toBeInTheDocument();
});
it('shows manual review immediately after the third unsuccessful retry', async () => {
  mocks.jobs = [{ id: 'job', status: 'failed', storage_path: 'user/job/Original.pdf', created_at: new Date().toISOString() }];
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'extraction_invalid', reason: 'invalid' }), { status: 422, headers: { 'X-Callsheet-Retries-Used': '3' } }));
  open(); fireEvent.click(await screen.findByRole('button', { name: 'bulk.retryDocument' }));
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith('bulk.retryLimit'));
  expect(mocks.fetch).toHaveBeenCalledOnce();
});

it('saves existing base endpoints once and preserves a return visit inside the route',async()=>{
 mocks.jobs=[{id:'job',status:'needs_review',storage_path:'user/job/Original.pdf',created_at:new Date().toISOString()}];
 mocks.result={date_value:'2026-09-10',project_value:'Film'};
 mocks.locations=['Home','Studio 8','Studio 8','Home','Park 2','Home'].map((value,position)=>({position,formatted_address:value,address_raw:value,selection_state:'confirmed'}));
 open();
 await screen.findByDisplayValue('Park 2');
 expect(screen.queryByText(/bulk\.originLabel/)).toBeNull();
 expect(screen.queryByText(/bulk\.destinationLabel/)).toBeNull();
 fireEvent.click(screen.getByText('bulk.saveTrip'));
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({route:['Home','Studio 8','Home','Park 2','Home']})));
 // Review evidence stays editable; it is not silently deleted from the document.
 expect(screen.getAllByDisplayValue('Studio 8')).toHaveLength(2);
});
