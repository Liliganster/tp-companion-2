import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {} }));
vi.mock('./stripeClient.js', () => ({ getStripeClient: vi.fn() }));
import { runAccountDeletion, type DeletionDependencies } from './accountDeletion';

function fixture(phase = 'storage') {
  const deps: DeletionDependencies = {
    rpc: vi.fn(async (name) => name === 'account_deletion_claim'
      ? { phase, notBefore: new Date(0).toISOString() }
      : name === 'account_deletion_files' ? [] : true),
    cancelBilling: vi.fn(async () => true), removeFiles: vi.fn(async () => {}),
    deleteAuth: vi.fn(async () => {}), now: () => Date.now(),
  };
  return deps;
}
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

it('uses actual buckets and rereads remaining files after a partial failure', async () => {
  const deps = fixture();
  const files = [{ bucket: 'project_documents', path: 'user-a/receipt.jpg' }, { bucket: 'callsheets', path: 'legacy/document.pdf' }];
  vi.mocked(deps.rpc).mockImplementation(async name => name === 'account_deletion_claim'
    ? { phase: 'storage', notBefore: new Date(0).toISOString() } : name === 'account_deletion_files' ? [...files] : true);
  vi.mocked(deps.removeFiles).mockImplementation(async bucket => {
    if (bucket === 'callsheets') throw new Error('temporary storage failure');
    files.splice(0, 1);
  });
  expect((await runAccountDeletion('user-a', deps)).status).toBe(503);
  expect(deps.deleteAuth).not.toHaveBeenCalled();
  vi.mocked(deps.removeFiles).mockResolvedValue(undefined);
  expect((await runAccountDeletion('user-a', deps)).status).toBe(202);
  expect(deps.removeFiles).toHaveBeenLastCalledWith('callsheets', ['legacy/document.pdf']);
});

it.each(['inventory unavailable', 'storage_owner_conflict'])('stops before deleting on %s', async message => {
  const deps = fixture();
  vi.mocked(deps.rpc).mockImplementation(async name => {
    if (name === 'account_deletion_claim') return { phase: 'storage', notBefore: new Date(0).toISOString() };
    if (name === 'account_deletion_files') throw new Error(message);
    return true;
  });
  expect((await runAccountDeletion('user-a', deps)).status).toBe(503);
  expect(deps.removeFiles).not.toHaveBeenCalled();
  expect(deps.deleteAuth).not.toHaveBeenCalled();
});

it('waits for prior requests to drain before billing or file removal', async () => {
  const deps = fixture('billing');
  vi.mocked(deps.rpc).mockResolvedValue({ phase: 'billing', notBefore: new Date(Date.now() + 120000).toISOString() });
  expect((await runAccountDeletion('user-a', deps)).status).toBe(202);
  expect(deps.cancelBilling).not.toHaveBeenCalled();
});

it('does not run another worker while a lease is active', async () => {
  const deps = fixture(); vi.mocked(deps.rpc).mockResolvedValue({ busy: true });
  expect((await runAccountDeletion('user-a', deps)).status).toBe(202);
  expect(deps.rpc).toHaveBeenCalledTimes(1);
  expect(deps.removeFiles).not.toHaveBeenCalled();
});

it('does not advance past incomplete subscription cancellation', async () => {
  const deps = fixture('billing'); vi.mocked(deps.cancelBilling).mockResolvedValue(false);
  expect((await runAccountDeletion('user-a', deps)).status).toBe(202);
  expect(vi.mocked(deps.rpc).mock.calls.some(([name, args]) => name === 'account_deletion_checkpoint' && args.p_phase)).toBe(false);
});

it('keeps the login if transactional data removal fails', async () => {
  const deps = fixture('data');
  vi.mocked(deps.rpc).mockImplementation(async name => {
    if (name === 'account_deletion_claim') return { phase: 'data', notBefore: new Date(0).toISOString() };
    if (name === 'account_deletion_purge') throw new Error('database unavailable');
    return true;
  });
  expect((await runAccountDeletion('user-a', deps)).status).toBe(503);
  expect(deps.deleteAuth).not.toHaveBeenCalled();
});

it('does not report success if auth deletion fails', async () => {
  const deps = fixture('auth'); vi.mocked(deps.deleteAuth).mockRejectedValue(new Error('auth unavailable'));
  expect((await runAccountDeletion('user-a', deps)).status).toBe(503);
});

it('acknowledges completion only after removing auth and persisting completion', async () => {
  const deps = fixture('auth');
  expect(await runAccountDeletion('user-a', deps)).toEqual({ status: 200, body: { ok: true } });
  expect(deps.deleteAuth).toHaveBeenCalledWith('user-a');
  expect(deps.rpc).toHaveBeenLastCalledWith('account_deletion_checkpoint', expect.objectContaining({ p_phase: 'complete' }));
});
