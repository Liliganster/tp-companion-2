import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  profile: { ratePerKm: '', passengerSurcharge: '', baseAddress: 'Home', city: '', country: '', fullName: 'Crew', licensePlate: 'TEST', language: 'en' },
  trips: [{ id: 'trip', date: '2026-09-01', route: ['Home', 'Set'], projectId: 'film', project: 'Film', distance: 405, passengers: 2, purpose: 'Shooting', co2: 0, ratePerKmOverride: 0.42 }],
  projects: [{ id: 'film', name: 'Film', ratePerKm: 0.3, producer: 'Production', createdAt: '2026-09-01' }],
}));
vi.mock('@/contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: state.profile }) }));
vi.mock('@/contexts/TripsContext', () => ({ useTrips: () => ({ trips: state.trips, loading: false }) }));
vi.mock('@/contexts/ProjectsContext', () => ({ useProjects: () => ({ projects: state.projects }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/contexts/ReportsContext', () => ({ useReports: () => ({ reports: [] }) }));
vi.mock('@/contexts/PlanContext', () => ({ usePlan: () => ({ planTier: 'pro', limits: { maxSavedReportsPerMonth: -1 } }) }));
vi.mock('@/hooks/use-plan-limits', () => ({ usePlanLimits: () => ({ canAddProject: { allowed: true } }) }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, tf: (key: string) => key, locale: 'en-US' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-emissions-input', () => ({ useEmissionsInput: () => ({ emissionsInput: {} }) }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }: any) => children }));
vi.mock('@/components/projects/ProjectDetailModal', () => ({ ProjectDetailModal: () => null }));
vi.mock('@/components/projects/ProjectEditModal', () => ({ ProjectEditModal: () => null }));
vi.mock('@/hooks/use-project-export', () => ({ buildProjectZip: vi.fn() }));
vi.mock('@/lib/reportPdf', () => ({ buildReportPdf: vi.fn(() => ({ autoPrint: vi.fn(), output: vi.fn(() => new Blob()) })) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => ({ select: async () => ({ data: [] }) }) } }));
import Projects from './Projects';
import ReportView from './ReportView';
import { RecentTrips } from '@/components/dashboard/RecentTrips';
import { buildReportPdf } from '@/lib/reportPdf';

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); state.profile.ratePerKm = ''; state.profile.passengerSurcharge = ''; });
afterEach(cleanup);

describe('Settings rates across screens', () => {
  it('projects use 0.50 by default and update when Settings changes, ignoring legacy project and trip rates', async () => {
    const view = render(<MemoryRouter><Projects /></MemoryRouter>);
    await waitFor(() => expect(within(view.container).getByText('202.50 €')).toBeInTheDocument());
    expect(within(view.container).queryByText('121.50 €')).not.toBeInTheDocument();
    state.profile.ratePerKm = '0,65';
    view.rerender(<MemoryRouter><Projects /></MemoryRouter>);
    expect(within(view.container).getByText('263.25 €')).toBeInTheDocument();
    state.profile.ratePerKm = '0';
    view.rerender(<MemoryRouter><Projects /></MemoryRouter>);
    expect(within(view.container).getByText('0.00 €')).toBeInTheDocument();
  });

  it.each([
    ['', '', '202.50', '202.80', 0.5, 0.15],
    ['0,65', '0,25', '263.25', '263.75', 0.65, 0.25],
    ['0', '0', '0.00', '0.00', 0, 0],
  ])('report, PDF input and dashboard share Settings rates (%s / %s)', (km, passenger, mileage, total, rate, surcharge) => {
    state.profile.ratePerKm = km;
    state.profile.passengerSurcharge = passenger;
    const report = render(<MemoryRouter><ReportView /></MemoryRouter>);
    expect(within(report.container).getAllByText(`${mileage} €`).length).toBeGreaterThan(0);
    expect(within(report.container).getByText(`reportPdf.grandTotal: ${total} €`)).toBeInTheDocument();
    fireEvent.click(within(report.container).getByRole('button', { name: 'reportView.print' }));
    expect(buildReportPdf).toHaveBeenCalledWith(expect.objectContaining({
      ratePerKm: rate, passengerSurcharge: surcharge,
      trips: [expect.objectContaining({ distanceKm: 405, passengers: 2, ratePerKm: rate, amount: Number(mileage) })],
    }));
    if (surcharge > 0) {
      fireEvent.click(within(report.container).getByRole('switch', { name: 'reportView.mergePassengers' }));
      expect(within(report.container).getByText(`reportPdf.grandTotal: ${total} €`)).toBeInTheDocument();
      fireEvent.click(within(report.container).getByRole('button', { name: 'reportView.print' }));
      expect(buildReportPdf).toHaveBeenLastCalledWith(expect.objectContaining({
        ratePerKm: rate, passengerSurcharge: 0,
        trips: [expect.objectContaining({ ratePerKm: rate, amount: Number(total) })],
      }));
    }
    const dashboard = render(<MemoryRouter><RecentTrips /></MemoryRouter>);
    expect(within(dashboard.container).getByText(`${total} €`)).toBeInTheDocument();
  });
});
