import { afterEach, expect, it, vi } from 'vitest';
import { CALLSHEET_PROVIDER_TIMEOUT_MS } from '../callsheetTiming';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('allows a real SDK response after the old 40-second cutoff, then bounds stalled requests',async()=>{
 vi.useFakeTimers();vi.stubEnv('GEMINI_API_KEY','mock-key-for-offline-tests-only');vi.resetModules();
 const {generateContentFromPDF}=await import('./geminiClient');
 let signal: AbortSignal | null | undefined;
 vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise<Response>((resolve,reject)=>{
   signal=init.signal;signal?.addEventListener('abort',()=>reject(new DOMException('Request aborted','AbortError')));
   setTimeout(()=>resolve(new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:'{}'}]}}]}),{status:200})),60_000);
 })));
 const pending=generateContentFromPDF('gemini-2.5-flash','offline',Buffer.from('%PDF'),undefined,undefined,undefined,{timeoutMs:CALLSHEET_PROVIDER_TIMEOUT_MS});
 await vi.advanceTimersByTimeAsync(40_001);expect(signal?.aborted).toBe(false);
 await vi.advanceTimersByTimeAsync(20_000);expect((await pending).text).toBe('{}');
 vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Request aborted','AbortError'))))));
 const stalled=expect(generateContentFromPDF('gemini-2.5-flash','offline',Buffer.from('%PDF'),undefined,undefined,undefined,{timeoutMs:CALLSHEET_PROVIDER_TIMEOUT_MS})).rejects.toThrow(/abort/i);
 await vi.advanceTimersByTimeAsync(CALLSHEET_PROVIDER_TIMEOUT_MS);await stalled;
});
it('bounds OpenRouter response-body reads as well as headers',async()=>{
 vi.useFakeTimers();
 const {generateContent}=await import('./geminiClient');
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>({status:200,headers:new Headers(),text:()=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Request aborted','AbortError'))))})));
 const stalled=expect(generateContent('mock','offline',undefined,{openrouterEnabled:true,openrouterApiKey:'offline-only'},{timeoutMs:CALLSHEET_PROVIDER_TIMEOUT_MS})).rejects.toThrow(/abort/i);
 await vi.advanceTimersByTimeAsync(CALLSHEET_PROVIDER_TIMEOUT_MS);await stalled;
});
