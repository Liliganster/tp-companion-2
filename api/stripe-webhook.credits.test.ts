import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({construct:vi.fn(),fulfill:vi.fn(),list:vi.fn()}));
vi.mock('./_utils/stripeClient.js',()=>({getStripeClient:()=>({webhooks:{constructEvent:m.construct},checkout:{sessions:{list:m.list}}}),getStripeWebhookSecret:()=> 'test',getAllowedStripePriceIds:()=> new Set()}));
vi.mock('./_utils/aiCredits.js',()=>({fulfillAiCredits:m.fulfill}));
vi.mock('./_utils/entitlements.js',()=>({findUserIdByStripeIds:vi.fn(),saveStripeSubscription:vi.fn()}));
vi.mock('./_utils/accountLifecycle.js',()=>({isAccountDeleting:vi.fn()}));
import handler from './stripe-webhook';
const run=()=>handler.fetch(new Request('https://app.example/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':'signed'},body:'raw body'}));
beforeEach(()=>{vi.clearAllMocks();m.fulfill.mockResolvedValue('paid');});
it.each(['checkout.session.completed','checkout.session.async_payment_succeeded'])('fulfills signed %s through the same idempotent operation',async(type)=>{
 m.construct.mockReturnValue({id:'evt_1',type,data:{object:{id:'cs_1',mode:'payment'}}});
 expect((await run()).status).toBe(200);expect(m.fulfill).toHaveBeenCalledWith('cs_1');
 expect(m.construct).toHaveBeenCalledWith('raw body','signed','test');
});
it('rejects an invalid signature before granting anything',async()=>{m.construct.mockImplementation(()=>{throw new Error('signature');});expect((await run()).status).toBe(400);expect(m.fulfill).not.toHaveBeenCalled();});
it('returns 500 so Stripe can retry a failed ledger write',async()=>{m.construct.mockReturnValue({id:'evt_1',type:'checkout.session.completed',data:{object:{id:'cs_1',mode:'payment'}}});m.fulfill.mockRejectedValue(new Error('database down'));expect((await run()).status).toBe(500);});
it('reconciles a refund with the current charge using its payment intent',async()=>{m.construct.mockReturnValue({id:'evt_2',type:'charge.refunded',data:{object:{payment_intent:'pi_1'}}});m.list.mockResolvedValue({data:[{id:'cs_1'}]});expect((await run()).status).toBe(200);expect(m.list).toHaveBeenCalledWith({payment_intent:'pi_1',limit:1});expect(m.fulfill).toHaveBeenCalledWith('cs_1');});
