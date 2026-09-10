import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Trip } from '@/contexts/TripsContext';
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
  fireEvent.change(screen.getByLabelText('tripDetail.route 2'), { target: { value: 'Set' } });
  fireEvent.click(screen.getByText('tripModal.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-09', route: ['Home', 'Set'], callsheet_job_id: 'job', documents: trip.documents })));
});
