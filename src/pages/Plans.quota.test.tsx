import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }: any) => children }));
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const planMock = vi.hoisted(() => ({ planTier: 'basic', isLoading: false, subscriptionError: false, refreshSubscription: vi.fn() }));
vi.mock('@/contexts/PlanContext', () => ({ usePlan: () => planMock }));
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

beforeEach(() => { planMock.subscriptionError = false; planMock.isLoading = false; vi.clearAllMocks(); });
it('does not offer another purchase or mark Free as current when verification failed', () => {
  planMock.subscriptionError = true;
  render(<Plans />);
  expect(screen.getByRole('alert')).toHaveTextContent('plans.unavailable');
  expect(screen.queryByText('plans.currentPlan')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'plans.upgrade' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'plans.statusUnavailable' })).toHaveLength(2);
  screen.getAllByRole('button', { name: 'plans.statusUnavailable' }).forEach(button => expect(button).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'ui.retry' }));
  expect(planMock.refreshSubscription).toHaveBeenCalledOnce();
});
