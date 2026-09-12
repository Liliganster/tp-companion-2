import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn(), toast: vi.fn(), profile: {
  fullName: 'Original', vatId: '', licensePlate: '', language: 'es', ratePerKm: '0.5', passengerSurcharge: '',
  baseAddress: 'Home', city: '', country: '', fuelType: 'unknown', fuelLPer100Km: '', evKwhPer100Km: '',
  gridKgCo2PerKwh: '', fuelPricePerLiter: '', electricityPricePerKwh: '', maintenanceEurPerKm: '',
  otherEurPerKm: '', annualCarTotalKm: '', openrouterEnabled: false, openrouterApiKey: '', openrouterModel: '',
} }));
vi.mock('@/contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: mocks.profile, saveProfile: mocks.save }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, getAccessToken: async () => null }) }));
vi.mock('@/contexts/PlanContext', () => ({ usePlan: () => ({ planTier: 'pro' }) }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (s: string) => s, tf: (s: string) => s, locale: 'es' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/use-electricity-maps', () => ({ useElectricityMapsCarbonIntensity: () => ({ data: null }) }));
vi.mock('@/hooks/use-climatiq', () => ({ useClimatiqFuelFactor: () => ({ data: null }) }));
vi.mock('@/hooks/use-openrouter-models', () => ({ useOpenRouterModels: () => ({ data: [] }) }));
import { SettingsModal } from './SettingsModal';
beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.save.mockResolvedValue(true); });
function open() { render(<MemoryRouter><SettingsModal open onOpenChange={mocks.close} /></MemoryRouter>); }
it('preserves drafts across categories and saves all categories together', async () => {
  open();
  fireEvent.change(screen.getByLabelText('settings.fullName'), { target: { value: 'Updated name' } });
  fireEvent.click(screen.getByRole('button', { name: 'modal.costs' }));
  expect(screen.queryByLabelText('settings.fullName')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('settings.ratePerKm'), { target: { value: '0,65' } });
  fireEvent.click(screen.getByRole('button', { name: 'modal.vehicle' }));
  fireEvent.change(screen.getByLabelText('settings.licensePlate'), { target: { value: 'W 12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'settings.tabProfile' }));
  expect(screen.getByLabelText('settings.fullName')).toHaveValue('Updated name');
  fireEvent.click(screen.getByRole('button', { name: 'settings.save' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Updated name', ratePerKm: '0,65', licensePlate: 'W 12345' }), expect.anything()));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(false));
});
it('cancel does not save drafts from another category', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'modal.costs' }));
  fireEvent.change(screen.getByLabelText('settings.ratePerKm'), { target: { value: '0,65' } });
  fireEvent.click(screen.getByRole('button', { name: 'settings.cancel' }));
  expect(mocks.close).toHaveBeenCalledWith(false);
  expect(mocks.save).not.toHaveBeenCalled();
});
