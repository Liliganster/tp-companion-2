import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
const mocks = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn(), view: vi.fn(), trips: [], projects: [{ id: 'project', name: 'Film' }], profile: { country: '', city: '', baseAddress: '', ratePerKm: '0.5' } }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (s: string) => s, tf: (s: string) => s, locale: 'es' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, getAccessToken: async () => null }) }));
vi.mock('@/contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: mocks.profile }) }));
vi.mock('@/contexts/ProjectsContext', () => ({ useProjects: () => ({ projects: mocks.projects, addProject: vi.fn() }) }));
vi.mock('@/contexts/TripsContext', () => ({ useTrips: () => ({ trips: mocks.trips }) }));
vi.mock('@/contexts/PlanContext', () => ({ usePlan: () => ({ limits: { maxStopsPerTrip: 20 } }) }));
vi.mock('@/components/tour/TripModalTour', () => ({ TripModalTour: () => null, shouldAutoShowTripTour: () => false }));
vi.mock('@/components/expenses/ExpenseScanButton', () => ({ ExpenseScanButton: () => null }));
vi.mock('@/components/google/AddressAutocompleteInput', () => ({ AddressAutocompleteInput: ({ value, onCommit, onDraftChange }: { value: string; onCommit: (v: string) => void; onDraftChange?: (v: string) => void }) => <input value={value} onChange={e => { onDraftChange?.(e.target.value); onCommit(e.target.value); }} /> }));
import { AddTripModal } from './AddTripModal';
const document = { id: 'job', name: 'original.pdf', storagePath: 'user/job/original.pdf', bucketId: 'callsheets' as const, mimeType: 'application/pdf', createdAt: '2026-09-10' };
function open(route = ['Origin', 'Destination']) {
  return render(<TooltipProvider><AddTripModal open trip={{ id: 'job', callsheet_job_id: 'job', date: '2026-09-10', route, project: 'Film', documents: [document], distance: 12 }} onOpenChange={mocks.close} onSave={mocks.save} onViewDocument={mocks.view} /></TooltipProvider>);
}
beforeEach(() => { cleanup(); vi.clearAllMocks(); });
it('keeps an unresolved blank stop between known sites and saves its manual correction in place', async () => {
  mocks.save.mockResolvedValue(true);
  const { baseElement } = open(['Jesuitenwiese Prater', '', 'Erzbischofgasse 8']);
  const inputs = Array.from(baseElement.querySelectorAll<HTMLInputElement>('[data-tour="trip-route"] input'));
  expect(inputs.map(input => input.value)).toEqual(['', 'Jesuitenwiese Prater', '', 'Erzbischofgasse 8', '']);
  fireEvent.change(inputs[0], { target: { value: 'Home' } });
  fireEvent.change(inputs[2], { target: { value: 'Reviewed Site' } });
  fireEvent.change(inputs[4], { target: { value: 'Home' } });
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ route: ['Home', 'Jesuitenwiese Prater', 'Reviewed Site', 'Erzbischofgasse 8', 'Home'] })));
});
it('saves the manually completed values with the original job and viewer attachment', async () => {
  mocks.save.mockResolvedValue(true);
  open();
  fireEvent.click(screen.getByText('callsheetReview.open'));
  expect(mocks.view).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ callsheet_job_id: 'job', documents: [document], date: '2026-09-10', distance: 12 })));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(false));
});
it('keeps the manual form open when saving fails', async () => {
  mocks.save.mockResolvedValue(false);
  open();
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.close).not.toHaveBeenCalled();
  expect(screen.getByText('tripModal.update')).not.toBeDisabled();
});
