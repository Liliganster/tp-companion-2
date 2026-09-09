import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../src/lib/supabaseServer.js';
import { getStripeClient } from './stripeClient.js';

type Phase = 'billing' | 'storage' | 'data' | 'auth' | 'complete';
export type DeletionDependencies = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<any>;
  cancelBilling: (userId: string) => Promise<boolean>;
  removeFiles: (bucket: string, paths: string[]) => Promise<void>;
  deleteAuth: (userId: string) => Promise<void>;
  now: () => number;
};

/** Read trusted billing records; a failed lookup must never be treated as Free. */
export async function cancelAccountBilling(userId: string): Promise<boolean> {
  const [secure, legacy] = await Promise.all([
    supabaseAdmin.from('billing_entitlements').select('stripe_customer_id,stripe_subscription_id').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('user_profiles').select('stripe_customer_id,stripe_subscription_id').eq('id', userId).maybeSingle(),
  ]);
  if (secure.error || legacy.error) throw new Error('billing_lookup_failed');
  const customers = [...new Set([secure.data?.stripe_customer_id, legacy.data?.stripe_customer_id].filter(Boolean))] as string[];
  const subscriptions = [...new Set([secure.data?.stripe_subscription_id, legacy.data?.stripe_subscription_id].filter(Boolean))] as string[];
  if (!customers.length && !subscriptions.length) return true;
  const stripe = getStripeClient();
  const started = Date.now();
  const options = { timeout: 10000, maxNetworkRetries: 0 };
  for (const id of subscriptions) {
    const sub = await stripe.subscriptions.retrieve(id, {}, options);
    if (sub.metadata?.user_id && sub.metadata.user_id !== userId) throw new Error('billing_owner_conflict');
    const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    if (!customers.includes(customer)) customers.push(customer);
  }
  for (const customerId of customers) {
    const customer = await stripe.customers.retrieve(customerId, {}, options);
    if (!('metadata' in customer)) continue;
    if (customer.metadata?.user_id && customer.metadata.user_id !== userId) throw new Error('billing_owner_conflict');
    // Expire pending checkout links so they cannot create a subscription after deletion.
    for await (const session of stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 }, options)) {
      await stripe.checkout.sessions.expire(session.id, {}, options);
      if (Date.now() - started > 20000) return false;
    }
    for await (const sub of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 }, options)) {
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') continue;
      if (sub.metadata?.user_id && sub.metadata.user_id !== userId) throw new Error('billing_owner_conflict');
      // No immediate invoice, proration or automatic refund is created here.
      await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false }, options);
      if (Date.now() - started > 20000) return false;
    }
  }
  return true;
}

const defaults: DeletionDependencies = {
  async rpc(name, args) { const { data, error } = await supabaseAdmin.rpc(name, args); if (error) throw error; return data; },
  cancelBilling: cancelAccountBilling,
  async removeFiles(bucket, paths) { const { error } = await supabaseAdmin.storage.from(bucket).remove(paths); if (error) throw error; },
  async deleteAuth(userId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error && error.status !== 404 && error.code !== 'user_not_found') throw error;
    const verification = await supabaseAdmin.auth.admin.getUserById(userId);
    if (verification.data?.user) throw new Error('auth_not_deleted');
    if (verification.error && verification.error.status !== 404 && verification.error.code !== 'user_not_found') throw verification.error;
  },
  now: () => Date.now(),
};

/** One bounded, resumable step per HTTP request. Files are removed via Storage, never SQL. */
export async function runAccountDeletion(userId: string, deps: DeletionDependencies = defaults) {
  const token = randomUUID();
  const params = { p_user_id: userId, p_token: token };
  let leased = false, phase: Phase | undefined;
  const pending = () => ({ status: 202, body: { ok: false, pending: true, phase, retryAfterMs: 5000 } });
  try {
    const claim = await deps.rpc('account_deletion_claim', params);
    if (claim?.complete) return { status: 200, body: { ok: true } };
    if (claim?.busy) return pending();
    if (!['billing','storage','data','auth'].includes(claim?.phase)) throw new Error('invalid_deletion_state');
    phase = claim.phase; leased = true;
    // Let requests already in flight finish before cancellation/inventory.
    if (deps.now() < Date.parse(claim.notBefore)) return pending();
    const next = async (value: Phase) => {
      await deps.rpc('account_deletion_checkpoint', { ...params, p_phase: value }); phase = value;
    };
    if (phase === 'billing') {
      if (await deps.cancelBilling(userId)) await next('storage');
      return pending();
    }
    if (phase === 'storage') {
      const files = await deps.rpc('account_deletion_files', params) as { bucket: string; path: string }[];
      if (!Array.isArray(files)) throw new Error('storage_inventory_failed');
      if (!files.length) { await next('data'); return pending(); }
      const buckets = [...new Set(files.map(file => file.bucket))];
      for (const bucket of buckets) await deps.removeFiles(bucket, files.filter(file => file.bucket === bucket).map(file => file.path));
      // The next request reads the remaining objects, including partial failures.
      return pending();
    }
    if (phase === 'data') {
      await deps.rpc('account_deletion_purge', params); phase = 'auth'; return pending();
    }
    const files = await deps.rpc('account_deletion_files', params);
    if (!Array.isArray(files) || files.length) throw new Error('storage_not_empty');
    await deps.deleteAuth(userId);
    await next('complete'); leased = false;
    return { status: 200, body: { ok: true } };
  } catch (error) {
    console.error('[account-deletion] step failed', { phase, error });
    if (leased) {
      try { await deps.rpc('account_deletion_checkpoint', { ...params, p_error: 'step_failed' }); leased = false; }
      catch { /* a lost connection/lease expires; progress stays persisted */ }
    }
    return { status: 503, body: { ok: false, error: 'account_deletion_incomplete', phase, retryable: true } };
  } finally {
    if (leased) {
      try { await deps.rpc('account_deletion_checkpoint', params); }
      catch { /* the next request can reclaim after lease expiry */ }
    }
  }
}
