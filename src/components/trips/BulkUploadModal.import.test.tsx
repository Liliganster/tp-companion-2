import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ save: vi.fn(), fetch: vi.fn(), error: vi.fn(), tables: [] }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (s: string) => s, tf: (s: string) => s, locale: 'es' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ getAccessToken: async () => 'test' }) }));
vi.mock('@/contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: { baseAddress: 'Home' } }) }));
vi.mock('@/contexts/ProjectsContext', () => ({ useProjects: () => ({ projects: [{ id: 'project', name: 'Film' }], addProject: async () => true, updateProject: async () => true }) }));
vi.mock('@/contexts/TripsContext', () => ({ useTrips: () => ({ trips: mocks.tables }) }));
vi.mock('@/hooks/use-ai-quota', () => ({ useAiQuota: () => ({ used: 0, limit: 3, remaining: 3 }) }));
vi.mock('@/hooks/use-plan-limits', () => ({ usePlanLimits: () => ({ checkCSVImportLimit: () => ({ allowed: true }), checkStopsLimit: () => ({ allowed: true }), canAddNonAITrip: { allowed: true }, limits: { maxCallsheetsPerBatch: 5 } }) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: () => {}, info: () => {}, warning: () => {} } }));
import { BulkUploadModal } from './BulkUploadModal';
const csv = 'date;projectName;origin;destination;km\n2026-09-09;Film;A;B;25';
function file(name: string, text: string, type = 'text/csv') {
  const f = new File([text], name, { type });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer });
  return f;
}
function open() { return render(<MemoryRouter><BulkUploadModal defaultOpen trigger={<button>Open</button>} onSave={mocks.save} /></MemoryRouter>); }
beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.save.mockResolvedValue(true); vi.stubGlobal('fetch', mocks.fetch); });
describe('bulk import user flow', () => {
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
    fireEvent.drop(screen.getByRole('dialog'), { dataTransfer: { files: [file('one.pdf', '%PDF', 'application/pdf'), file('two.pdf', '%PDF', 'application/pdf')] } });
    expect(screen.getByRole('button', { name: 'bulk.removeFile one.pdf' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'bulk.removeFile one.pdf' }));
    expect(screen.queryByRole('button', { name: 'bulk.removeFile one.pdf' })).toBeNull();
    fireEvent.change(screen.getByLabelText('bulk.aiPasteLabel'), { target: { value: 'Rodaje mañana a las 8 en Viena' } });
    fireEvent.click(screen.getByText('bulk.aiAddText'));
    expect(screen.getByRole('button', { name: /bulk.removeFile mensaje-/ })).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
