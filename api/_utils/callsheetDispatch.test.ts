import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dispatchCallsheetWorker } from './callsheetDispatch';
const fetchMock=vi.fn();
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();vi.stubEnv('CRON_SECRET','test-secret');vi.stubEnv('APP_URL','https://dashboard.example.test');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('waits for the authenticated worker acknowledgement at the configured origin',async()=>{
 let resolve!:(response:Response)=>void;let finished=false;
 fetchMock.mockImplementation(()=>new Promise<Response>(r=>{resolve=r;}));
 const pending=dispatchCallsheetWorker(new URLSearchParams({userId:'owner',manual:'1'})).then(()=>{finished=true;});
 await Promise.resolve();expect(finished).toBe(false);
 expect(String(fetchMock.mock.calls[0][0])).toBe('https://dashboard.example.test/api/worker?userId=owner&manual=1&background=1');
 expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-secret');
 resolve(new Response('{}',{status:202}));await pending;expect(finished).toBe(true);
});
it('reports rejection instead of claiming the queue started',async()=>{
 fetchMock.mockResolvedValue(new Response('{}',{status:503}));
 await expect(dispatchCallsheetWorker(new URLSearchParams())).rejects.toThrow('worker_dispatch_failed_503');
 expect(fetchMock).toHaveBeenCalledOnce();
});
it('never starts a worker without server authentication',async()=>{
 vi.stubEnv('CRON_SECRET','');await expect(dispatchCallsheetWorker(new URLSearchParams())).rejects.toThrow('Missing CRON_SECRET');expect(fetchMock).not.toHaveBeenCalled();
});
