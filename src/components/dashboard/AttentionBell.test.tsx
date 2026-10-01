import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
const m = vi.hoisted(() => ({
  rows: [] as any[], trips: [] as any[], userId: 'u' as string | null,
  read: vi.fn(), eq: vi.fn(), navigate: vi.fn(), fail: false,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: m.userId ? { id: m.userId } : null }) }));
vi.mock('@/contexts/TripsContext', () => ({ useTrips: () => ({ trips: m.trips }) }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'es-ES' }) }));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children, onOpenChange }: any) => <div><button onClick={() => onOpenChange(true)}>open-alerts</button>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => children,
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => {
  let start = 0; let end = 499;
  const chain: any = {
    select: () => chain, eq: (...args: any[]) => { m.eq(...args); return chain; },
    in: () => chain, order: () => chain,
    range: (a: number, b: number) => { start = a; end = b; return chain; },
    abortSignal: (signal: AbortSignal) => { m.read(signal); return Promise.resolve(m.fail ? { error: new Error('offline') } : { data: m.rows.slice(start, end + 1), error: null }); },
  };
  return chain;
} } }));
import { AttentionBell } from './AttentionBell';
const job = (id: string, status = 'failed') => ({ id, status, storage_path: `u/${id}/Callsheet-${id}.pdf`, created_at: '2026-10-01', needs_review_reason: null });
const trip = (id: string, jobId?: string) => ({ id, callsheet_job_id: jobId, date: '2026-10-01', route: ['A', 'B'], distance: 20, projectId: 'p' });
let client: QueryClient;
function mount() { return render(<QueryClientProvider client={client}><AttentionBell /></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks(); m.rows = []; m.trips = []; m.userId = 'u'; m.fail = false;
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  focusManager.setFocused(true);
});
afterEach(() => { cleanup(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers(); });
it('removes a deleted document when reopening the bell, without reloading the dashboard', async () => {
  m.rows = [job('bad')]; mount();
  await screen.findByText('Callsheet-bad.pdf');
  m.rows = []; fireEvent.click(screen.getByText('open-alerts'));
  await waitFor(() => expect(screen.queryByText('Callsheet-bad.pdf')).not.toBeInTheDocument());
  expect(screen.getByText('dashboard.attentionEmpty')).toBeInTheDocument();
  expect(m.eq).toHaveBeenCalledWith('user_id', 'u');
});
it('removes historical review errors once the trip is saved; keeps real trip warnings', async () => {
  m.rows = [job('review', 'needs_review')]; const view = mount();
  await screen.findByText('Callsheet-review.pdf');
  m.trips = [{ ...trip('saved', 'review'), distance: 0 }];
  view.rerender(<QueryClientProvider client={client}><AttentionBell /></QueryClientProvider>);
  expect(screen.queryByText('Callsheet-review.pdf')).not.toBeInTheDocument();
  expect(screen.getByText('tripWarning.zeroDistance')).toBeInTheDocument();
  m.trips = [trip('saved', 'review')];
  view.rerender(<QueryClientProvider client={client}><AttentionBell /></QueryClientProvider>);
  expect(screen.queryByText('tripWarning.zeroDistance')).not.toBeInTheDocument();
});
it('refreshes corrected documents periodically while the dashboard stays open', async () => {
  m.rows = [job('bad')]; mount(); await screen.findByText('Callsheet-bad.pdf');
  vi.useFakeTimers();
  // Reschedule the query interval under the fake clock, while the issue still exists.
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); await vi.advanceTimersByTimeAsync(20); });
  expect(screen.getByText('Callsheet-bad.pdf')).toBeInTheDocument();
  m.rows = [];
  await act(async () => { await vi.advanceTimersByTimeAsync(10020); });
  expect(screen.queryByText('Callsheet-bad.pdf')).not.toBeInTheDocument();
});
it('does not claim everything is fine or retain old document errors after a failed refresh', async () => {
  m.rows = [job('bad')]; mount(); await screen.findByText('Callsheet-bad.pdf');
  m.fail = true; fireEvent.click(screen.getByText('open-alerts'));
  await screen.findByText('dashboard.attentionUnavailable');
  expect(screen.queryByText('Callsheet-bad.pdf')).not.toBeInTheDocument();
  expect(screen.queryByText('dashboard.attentionEmpty')).not.toBeInTheDocument();
  m.fail = false; m.rows = []; fireEvent.click(screen.getByText('ui.retry'));
  await screen.findByText('dashboard.attentionEmpty');
});
it('does not show the previous account notifications after switching users', async () => {
  m.rows = [job('private')]; const view = mount(); await screen.findByText('Callsheet-private.pdf');
  m.rows = []; m.userId = 'other';
  view.rerender(<QueryClientProvider client={client}><AttentionBell /></QueryClientProvider>);
  expect(screen.queryByText('Callsheet-private.pdf')).not.toBeInTheDocument();
  await screen.findByText('dashboard.attentionEmpty'); expect(m.eq).toHaveBeenCalledWith('user_id', 'other');
});
it('includes more than ten issues and excludes incomplete uploads consistently with Trips', async () => {
  m.rows = [...Array.from({ length: 11 }, (_, i) => job(String(i))), { ...job('pending'), storage_path: 'pending' }]; mount();
  await screen.findByText('Callsheet-10.pdf');
  expect(screen.getAllByText('dashboard.attentionCallsheetFailed')).toHaveLength(11);
  expect(screen.queryByText('pending')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Callsheet-10.pdf')); expect(m.navigate).toHaveBeenCalledWith('/trips');
});
it('refreshes the shared trips cache when the menu opens', async () => {
  const invalidate = vi.spyOn(client, 'invalidateQueries'); mount();
  fireEvent.click(screen.getByText('open-alerts'));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips', 'u'] });
  await screen.findByText('dashboard.attentionEmpty');
});
