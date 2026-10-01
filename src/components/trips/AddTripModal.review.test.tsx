import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
const mocks = vi.hoisted(() => ({ save: vi.fn(), addProject: vi.fn(), close: vi.fn(), view: vi.fn(), trips: [], projects: [{ id: 'project', name: 'Film' }], profile: { country: '', city: '', baseAddress: '', ratePerKm: '0.5' } }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (s: string) => s, tf: (s: string) => s, locale: 'es' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, getAccessToken: async () => null }) }));
vi.mock('@/contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: mocks.profile }) }));
vi.mock('@/contexts/ProjectsContext', () => ({ useProjects: () => ({ projects: mocks.projects, addProject: mocks.addProject }) }));
vi.mock('@/contexts/TripsContext', () => ({ useTrips: () => ({ trips: mocks.trips }) }));
vi.mock('@/contexts/PlanContext', () => ({ usePlan: () => ({ limits: { maxStopsPerTrip: 20 } }) }));
vi.mock('@/components/tour/TripModalTour', () => ({ TripModalTour: () => null, shouldAutoShowTripTour: () => false }));
vi.mock('@/components/expenses/ExpenseScanButton', () => ({ ExpenseScanButton: () => null }));
vi.mock('@/components/google/AddressAutocompleteInput', () => ({ AddressAutocompleteInput: ({ value, onCommit, onDraftChange }: { value: string; onCommit: (v: string) => void; onDraftChange?: (v: string) => void }) => <input value={value} onChange={e => { onDraftChange?.(e.target.value); onCommit(e.target.value); }} /> }));
import { AddTripModal } from './AddTripModal';
const document = { id: 'job', name: 'original.pdf', storagePath: 'user/job/original.pdf', bucketId: 'callsheets' as const, mimeType: 'application/pdf', createdAt: '2026-09-10' };
function open(route = ['Origin', 'Destination'], patch = {}) {
  return render(<TooltipProvider><AddTripModal open trip={{ id: 'job', callsheet_job_id: 'job', date: '2026-09-10', route, project: 'Film', documents: [document], distance: 12, ...patch }} onOpenChange={mocks.close} onSave={mocks.save} onViewDocument={mocks.view} /></TooltipProvider>);
}
beforeEach(() => { mocks.profile.baseAddress=""; mocks.profile.city=""; mocks.profile.country=""; cleanup(); vi.clearAllMocks(); mocks.projects = [{ id: 'project', name: 'Film' }]; });
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

it('uses the server project ID when the local list is missing an existing project', async () => {
  mocks.projects = [];
  mocks.addProject.mockResolvedValueOnce('server-film-id');
  mocks.save.mockResolvedValue(true);
  open();
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'server-film-id', documents: [document] })));
});
it('keeps the form open and does not save when project persistence fails', async () => {
  mocks.projects = [];
  mocks.addProject.mockRejectedValueOnce(new Error('Offline'));
  open();
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(mocks.addProject).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByText('tripModal.update')).not.toBeDisabled());
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
});

it('preserves the explicit project and unedited consumption values', async () => {
  mocks.save.mockResolvedValue(true);
  mocks.projects = [{ id: 'other', name: 'Film' }];
  open(undefined, { projectId: 'original-project', fuelLiters: 7, evKwhUsed: 4, ratePerKmOverride: 0.6 });
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'original-project', fuelLiters: 7, evKwhUsed: 4, ratePerKmOverride: 0.6, documents: [document] })));
  expect(mocks.addProject).not.toHaveBeenCalled();
});
it('saves a one-location document just like the document viewer editor', async () => {
  mocks.save.mockResolvedValue(true);
  open(['Studio'], { distance: 0 });
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ route: ['Studio'], distance: 0, callsheet_job_id: 'job' })));
});
it('keeps unresolved middle locations for correction instead of silently dropping them', async () => {
  open(['A', '', 'B']);
  fireEvent.click(screen.getByText('tripModal.update'));
  await waitFor(() => expect(screen.getByText('tripModal.update')).not.toBeDisabled());
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
});

it('recognizes saved short base endpoints instead of wrapping them a second time',async()=>{
 mocks.profile.baseAddress='Home 1';mocks.profile.city='Wien';mocks.profile.country='Austria';
 mocks.save.mockResolvedValue(true);
 const {baseElement}=open(['Home 1','Studio 8','Home 1']);
 const inputs=Array.from(baseElement.querySelectorAll<HTMLInputElement>('[data-tour="trip-route"] input'));
 expect(inputs.map(input=>input.value)).toEqual(['Home 1','Studio 8','Home 1']);
 fireEvent.click(screen.getByText('tripModal.update'));
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({route:['Home 1','Studio 8','Home 1']})));
});
it('recognizes a full base without appending its city and country again',()=>{
 mocks.profile.baseAddress='Home 1, Wien, Austria';mocks.profile.city='Wien';mocks.profile.country='Austria';
 const {baseElement}=open(['Home 1, Wien, Austria','Studio 8','Home 1, Wien, Austria']);
 const inputs=Array.from(baseElement.querySelectorAll<HTMLInputElement>('[data-tour="trip-route"] input'));
 expect(inputs.map(input=>input.value)).toEqual(['Home 1, Wien, Austria','Studio 8','Home 1, Wien, Austria']);
});
