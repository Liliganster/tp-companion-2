import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const m=vi.hoisted(()=>({token:vi.fn(async()=> 'token'),refresh:vi.fn(),fetch:vi.fn(),available:100 as number|null}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({getAccessToken:m.token})}));
vi.mock('@/hooks/use-ai-quota',()=>({useAiQuota:()=>({creditsAvailable:m.available,loading:false,refresh:m.refresh})}));
vi.mock('@/hooks/use-i18n',()=>({useI18n:()=>({t:(key:string)=>key,tf:(key:string,args:any)=>`${key}:${args.count}`})}));
import { AiCreditPack } from './AiCreditPack';
beforeEach(()=>{vi.clearAllMocks();m.available=100;window.history.replaceState({},'','/plans');vi.stubGlobal('fetch',m.fetch);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows balance and one-time purchase for any account',()=>{render(<AiCreditPack/>);expect(screen.getByText('credits.balance:100')).toBeInTheDocument();expect(screen.getByRole('button',{name:'credits.buy'})).toBeEnabled();});
it('disables payment if balance cannot be verified',()=>{m.available=null;render(<AiCreditPack/>);expect(screen.getByRole('button',{name:'credits.buy'})).toBeDisabled();});
it('never trusts success URL; pending payment has explicit retry and no automatic paid calls',async()=>{
 window.history.replaceState({},'','/plans?credits=success&session_id=cs_test_1');m.fetch.mockResolvedValue({ok:true,json:async()=>({status:'pending'})});
 render(<AiCreditPack/>);await waitFor(()=>expect(screen.getByRole('button',{name:'credits.checkPayment'})).toBeEnabled());
 expect(screen.getByRole('status')).toHaveTextContent('credits.pending');expect(m.fetch).toHaveBeenCalledOnce();expect(m.refresh).not.toHaveBeenCalled();
 m.fetch.mockResolvedValue({ok:true,json:async()=>({status:'paid'})});fireEvent.click(screen.getByRole('button',{name:'credits.checkPayment'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('credits.confirmed'));expect(m.refresh).toHaveBeenCalledOnce();expect(window.location.search).toBe('');
});
