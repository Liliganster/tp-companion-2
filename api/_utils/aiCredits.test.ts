import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({retrieve:vi.fn(),rpc:vi.fn(),entitlement:vi.fn(),deleting:vi.fn()}));
vi.mock('../../src/lib/supabaseServer.js',()=>({supabaseAdmin:{rpc:m.rpc}}));
vi.mock('./stripeClient.js',()=>({getStripeClient:()=>({checkout:{sessions:{retrieve:m.retrieve}}})}));
vi.mock('./entitlements.js',()=>({getBillingEntitlement:m.entitlement}));
vi.mock('./accountLifecycle.js',()=>({isAccountDeleting:m.deleting}));
import { fulfillAiCredits, assertAiCreditsReady } from './aiCredits';
const paid=()=>({id:'cs_test_paid',mode:'payment',metadata:{kind:'ai_credits_100_v1',user_id:'u'},client_reference_id:'u',customer:'cus_u',payment_status:'paid',status:'complete',amount_total:1000,currency:'eur',payment_intent:{id:'pi_paid',status:'succeeded',amount_received:1000,currency:'eur',latest_charge:{paid:true,amount_refunded:0}}});
beforeEach(()=>{vi.clearAllMocks();m.retrieve.mockResolvedValue(paid());m.rpc.mockResolvedValue({data:100,error:null});m.entitlement.mockResolvedValue({customerId:'cus_u'});m.deleting.mockResolvedValue(false);});
it('fulfills from freshly retrieved Stripe state, not client assertions',async()=>{
 expect(await fulfillAiCredits('cs_test_paid','u')).toBe('paid');
 expect(m.rpc).toHaveBeenCalledWith('sync_ai_credit_purchase',{p_user_id:'u',p_session_id:'cs_test_paid',p_payment_intent_id:'pi_paid',p_refunded_cents:0});
});
it('rejects another user before writing any credits',async()=>{
 await expect(fulfillAiCredits('cs_test_paid','other')).rejects.toThrow('credit_owner_mismatch');expect(m.rpc).not.toHaveBeenCalled();
});
it('rejects customer mapping mismatch',async()=>{
 m.entitlement.mockResolvedValue({customerId:'cus_other'});await expect(fulfillAiCredits('cs_test_paid')).rejects.toThrow('credit_customer_mismatch');expect(m.rpc).not.toHaveBeenCalled();
});
it.each(['unpaid','no_payment_required'])('does not fulfill %s sessions',async(payment_status)=>{
 m.retrieve.mockResolvedValue({...paid(),payment_status});expect(await fulfillAiCredits('cs_test_paid')).toBe('pending');expect(m.rpc).not.toHaveBeenCalled();
});
it.each([{amount_total:1},{currency:'usd'},{payment_intent:null}])('rejects invalid payment %j',async(change)=>{
 m.retrieve.mockResolvedValue({...paid(),...change});await expect(fulfillAiCredits('cs_test_paid')).rejects.toThrow('invalid_credit_payment');expect(m.rpc).not.toHaveBeenCalled();
});
it('ignores subscription payments',async()=>{m.retrieve.mockResolvedValue({...paid(),mode:'subscription'});expect(await fulfillAiCredits('cs_test_paid')).toBe('ignored');expect(m.rpc).not.toHaveBeenCalled();});
it('ignores an account being deleted',async()=>{m.deleting.mockResolvedValue(true);expect(await fulfillAiCredits('cs_test_paid')).toBe('ignored');expect(m.rpc).not.toHaveBeenCalled();});
it('applies current cumulative refunds',async()=>{const p=paid();p.payment_intent.latest_charge.amount_refunded=500;m.retrieve.mockResolvedValue(p);m.rpc.mockResolvedValue({data:50});expect(await fulfillAiCredits('cs_test_paid')).toBe('refunded');expect(m.rpc).toHaveBeenCalledWith('sync_ai_credit_purchase',expect.objectContaining({p_refunded_cents:500}));});
it('database failure is retriable and cannot falsely confirm fulfillment',async()=>{m.rpc.mockResolvedValue({error:{code:'unavailable'}});await expect(fulfillAiCredits('cs_test_paid')).rejects.toThrow('credit_grant_failed');await expect(assertAiCreditsReady('u')).rejects.toThrow('ai_credits_unavailable');});
