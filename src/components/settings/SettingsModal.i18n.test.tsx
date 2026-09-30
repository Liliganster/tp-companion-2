import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/use-electricity-maps', () => ({ useElectricityMapsCarbonIntensity: () => ({ data: null }) }));
vi.mock('@/hooks/use-climatiq', () => ({ useClimatiqFuelFactor: () => ({ data: null }) }));
vi.mock('@/hooks/use-openrouter-models', () => ({ useOpenRouterModels: () => ({ data: [] }) }));
import { SettingsModal } from './SettingsModal';

beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue(true); });
afterEach(cleanup);
it.each([
  ['es', 'Seguridad', 'Cambiar contraseña', 'Integraciones', 'Gemini IA (predeterminado)', 'Cerrar'],
  ['en', 'Security', 'Change password', 'Integrations', 'Gemini AI (default)', 'Close'],
  ['de', 'Sicherheit', 'Passwort ändern', 'Integrationen', 'Gemini-KI (Standard)', 'Schließen'],
])('keeps settings sections and dialog controls in %s', async (language, security, password, apis, gemini, close) => {
  mocks.profile.language = language;
  render(<MemoryRouter><SettingsModal open onOpenChange={mocks.close} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: close })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: security }));
  expect(screen.getByRole('button', { name: password })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: apis }));
  expect(await screen.findByText(gemini)).toBeInTheDocument();
  if (language !== 'es') {
    expect(screen.queryByText('Gemini IA (predeterminado)')).not.toBeInTheDocument();
  }
});
it('updates an open settings dialog immediately when the selected language changes', () => {
  mocks.profile.language = 'es';
  const view = render(<MemoryRouter><SettingsModal open onOpenChange={mocks.close} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Seguridad' }));
  mocks.profile.language = 'de';
  view.rerender(<MemoryRouter><SettingsModal open onOpenChange={mocks.close} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeInTheDocument();
  expect(screen.queryByText('Cambiar contraseña')).not.toBeInTheDocument();
});
