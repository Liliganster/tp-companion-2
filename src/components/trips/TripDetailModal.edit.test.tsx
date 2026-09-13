import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Trip } from '@/contexts/TripsContext';
import { TripInputSchema } from '@/lib/schemas';
import { getReviewCallsheetDrafts } from '@/lib/callsheetReview';
const mocks = vi.hoisted(() => ({ save: vi.fn(), download: vi.fn(), addProject: vi.fn(), trips: [], projects: [{ id: 'project', name: 'Film' }] }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (s: string) => s, tf: (s: string) => s, locale: 'es' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ getAccessToken: async () => null }) }));
vi.mock('@/contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: { fullName: 'Crew', ratePerKm: '0.5' } }) }));
vi.mock('@/contexts/ProjectsContext', () => ({ useProjects: () => ({ projects: mocks.projects, addProject: mocks.addProject }) }));
vi.mock('@/contexts/TripsContext', () => ({ useTrips: () => ({ trips: mocks.trips }) }));
vi.mock('@/components/trips/TripGoogleMap', () => ({ TripGoogleMap: () => null }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { storage: { from: () => ({ download: mocks.download }) } } }));
import { TripDetailModal } from './TripDetailModal';
const trip: Trip = { id: 'job', callsheet_job_id: 'job', date: '2026-09-10', project: 'Film', projectId: 'project', purpose: 'Shooting', route: ['A', 'B'], passengers: 0, distance: 12, co2: 0, tollAmount: 4, documents: [{ id: 'doc', name: 'original.pdf', storagePath: 'user/job/original.pdf', bucketId: 'callsheets', mimeType: 'application/pdf', createdAt: '2026-09-10' }] };
beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  mocks.save.mockResolvedValue(true);
  mocks.download.mockResolvedValue({ data: new Blob(['pdf']), error: null });
  URL.createObjectURL = vi.fn(() => 'blob:original'); URL.revokeObjectURL = vi.fn();
});
async function open(value = trip) {
  render(<TripDetailModal trip={value} open onOpenChange={vi.fn()} onSave={mocks.save} />);
  await screen.findByTitle('tripDetail.previewFrameTitle');
  fireEvent.click(screen.getByText('trips.edit'));
}
it('edits alongside the original viewer and preserves the attachment and job on save', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('tripDetail.route 2'), { target: { value: 'Correct destination' } });
  fireEvent.change(screen.getByLabelText('tripModal.distance'), { target: { value: '24,5' } });
  expect(screen.getByTitle('tripDetail.previewFrameTitle')).toHaveAttribute('src', 'blob:original');
  fireEvent.click(screen.getByText('tripModal.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ route: ['A', 'Correct destination'], distance: 24.5, documents: trip.documents, callsheet_job_id: 'job', tollAmount: 4 })));
  await screen.findByText('trips.edit');
  expect(mocks.download).toHaveBeenCalledOnce();
});
it('keeps edited values and the viewer available after a save error', async () => {
  mocks.save.mockResolvedValue(false);
  await open();
  fireEvent.change(screen.getByLabelText('tripModal.purpose'), { target: { value: 'Corrected' } });
  fireEvent.click(screen.getByText('tripModal.save'));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('tripModal.purpose')).toHaveValue('Corrected');
  expect(screen.getByTitle('tripDetail.previewFrameTitle')).toBeInTheDocument();
});
it('can cancel editing without changing the trip or reloading the original', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('tripModal.purpose'), { target: { value: 'Discard this' } });
  fireEvent.click(screen.getByText('bulk.cancel'));
  expect(screen.getByText('Shooting')).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.download).toHaveBeenCalledOnce();
});
it('completes an empty review draft in the viewer', async () => {
  await open({ ...trip, date: '', route: [], distance: 0 });
  fireEvent.change(screen.getByLabelText('tripModal.date'), { target: { value: '2026-09-09' } });
  fireEvent.change(screen.getByLabelText('tripDetail.route 1'), { target: { value: 'Home' } });
  fireEvent.click(screen.getByText('tripModal.addStop'));
  fireEvent.change(screen.getByLabelText('tripDetail.route 1'), { target: { value: 'Home' } });
  fireEvent.change(screen.getByLabelText('tripDetail.route 2'), { target: { value: 'Set' } });
  fireEvent.click(screen.getByText('tripModal.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-09', route: ['Home', 'Set'], callsheet_job_id: 'job', documents: trip.documents })));
});

it('saves after correcting the review date with one location and no unrelated trip fields', async () => {
  const [{ trip: draft }] = getReviewCallsheetDrafts([{
    id: 'job', status: 'needs_review', storage_path: 'user/job/original.pdf', created_at: '2026-09-10',
    needs_review_reason: 'Year missing.', callsheet_results: { date_value: null },
    callsheet_locations: [{ address_raw: 'Studio 1, Vienna', selection_state: 'confirmed' }],
  }], [], []);
  await open(draft);
  fireEvent.change(screen.getByLabelText('tripModal.date'), { target: { value: '2026-09-10' } });
  fireEvent.change(screen.getByLabelText('tripModal.distance'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('trips.passengers'), { target: { value: '' } });
  expect(screen.getByLabelText('tripModal.distance')).not.toBeRequired();
  expect(screen.getByLabelText('trips.passengers')).not.toBeRequired();
  fireEvent.click(screen.getByText('tripModal.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const saved = mocks.save.mock.calls[0][0];
  expect(saved).toMatchObject({ date: '2026-09-10', route: ['Studio 1, Vienna'], project: '', projectId: null, purpose: '', distance: 0, passengers: 0, documents: draft.documents });
  expect(TripInputSchema.safeParse(saved).success).toBe(true);
  expect(mocks.addProject).not.toHaveBeenCalled();
});

it('saves a corrected single location without inventing an origin or requiring distance', async () => {
  await open({ ...trip, route: ['Unclear location'], distance: 0, project: '', projectId: null, purpose: '' });
  fireEvent.change(screen.getByLabelText('tripDetail.route 1'), { target: { value: 'Correct filming location' } });
  fireEvent.click(screen.getByText('tripModal.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ route: ['Correct filming location'], distance: 0, project: '', purpose: '' })));
});

it('lets the reviewer explicitly remove an unnecessary empty stop without discarding other rows', async () => {
  await open({ ...trip, route: ['Studio', ''] });
  expect(screen.getByLabelText('tripDetail.route 2')).toHaveValue('');
  fireEvent.click(screen.getByLabelText('trips.delete 2'));
  fireEvent.click(screen.getByText('tripModal.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ route: ['Studio'] })));
});

it.each([
  ['tripModal.distance', '-1'],
  ['trips.passengers', '1.5'],
])('still rejects invalid values entered in optional document field %s', async (label, value) => {
  await open({ ...trip, route: ['Studio'] });
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByText('tripModal.save'));
  expect(await screen.findByRole('alert')).toHaveTextContent('tripDetail.editInvalidDocument');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('does not silently confirm a review while an unresolved location is blank', async () => {
  await open({ ...trip, route: ['Studio', ''] });
  fireEvent.submit(screen.getByText('tripModal.save').closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('tripDetail.editInvalidDocument');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('keeps the complete route validation for a manual trip', async () => {
  await open({ ...trip, callsheet_job_id: undefined, route: ['Studio'] });
  expect(screen.getByLabelText('tripModal.distance')).toBeRequired();
  fireEvent.click(screen.getByText('tripModal.save'));
  expect(await screen.findByRole('alert')).toHaveTextContent('tripDetail.editInvalid');
  expect(mocks.save).not.toHaveBeenCalled();
});
