import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }: any) => children }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/PlanContext', () => ({ usePlan: () => ({ planTier: 'basic', isLoading: false, refreshSubscription: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ getAccessToken: vi.fn() }) }));
import Plans from './Plans';
afterEach(cleanup);
it('shows 400 per subscription year for annual and 60 per month for monthly', () => {
  render(<Plans />);
  expect(screen.getByText('plans.features.ai400Annual')).toBeInTheDocument();
  expect(screen.queryByText('plans.features.ai60')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'plans.billingMonthly' }));
  expect(screen.getByText('plans.features.ai60')).toBeInTheDocument();
  expect(screen.queryByText('plans.features.ai400Annual')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /plans.billingAnnual/ }));
  expect(screen.getByText('plans.features.ai400Annual')).toBeInTheDocument();
});
