import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({jobs:[] as any[],extract:vi.fn(),finish:vi.fn(),reserve:vi.fn(),background:[] as Promise<unknown>[],dispatch:vi.fn()}));
vi.mock('@vercel/functions',()=>({waitUntil:(promise:Promise<unknown>)=>{m.background.push(promise);}}));
vi.mock('./callsheetDispatch.js',()=>({dispatchCallsheetWorker:m.dispatch}));
vi.mock('../../src/lib/supabaseServer.js',()=>({supabaseAdmin:{from:(table:string)=>{
 let changes:any;const filters:Array<(row:any)=>boolean>=[];let single=false;let head=false;let take=Infinity;
 const result=()=>{
  const rows=table==='callsheet_jobs'?m.jobs.filter(row=>filters.every(f=>f(row))):[{}];
  if(changes) rows.forEach(row=>Object.assign(row,changes));
  return {data:head?null:single?rows[0]??null:rows.slice(0,take),error:null,count:rows.length};
 };
 const q:any={select:(_fields:any,options:any)=>{head=Boolean(options?.head);return q;},
 eq:(field:string,value:any)=>{filters.push(row=>row[field]===value);return q;},
 lt:(field:string,value:any)=>{filters.push(row=>row[field]<value);return q;},
 in:(field:string,values:any[])=>{filters.push(row=>values.includes(row[field]));return q;},
 update:(value:any)=>{changes=value;return q;},order:()=>q,limit:(value:number)=>{take=value;return q;},
 maybeSingle:()=>{single=true;return Promise.resolve(result());},insert:()=>Promise.resolve({error:null}),
 then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};
 return q;
}}}));
vi.mock('./observability.js',()=>({captureServerException:vi.fn(),withApiObservability:(fn:any)=>(req:any,res:any)=>fn(req,res,{log:{info:vi.fn(),warn:vi.fn(),error:vi.fn()},requestId:'test'})}));
vi.mock('./runtimeWatchdog.js',()=>({startRuntimeWatchdog:()=>({cancel:()=>({context:{},elapsedMs:0,warningLogged:false})})}));
vi.mock('./rateLimit.js',()=>({enforceRateLimit:async()=>true}));
vi.mock('./entitlements.js',()=>({getServerPlanTier:async()=>'pro'}));
vi.mock('./aiQuota.js',()=>({reserveAiQuota:m.reserve,finishAiQuota:m.finish}));
vi.mock('./callsheetExtraction.js',()=>({extractCallsheet:m.extract}));
import handler from '../worker';
const run=async(query={})=>{
 const res:any={status:vi.fn(()=>res),json:vi.fn(),setHeader:vi.fn(),end:vi.fn()};
 await handler({method:'POST',headers:{},query},res);return res;
};
beforeEach(()=>{
 vi.clearAllMocks();m.dispatch.mockReset();m.background=[];vi.stubEnv('CRON_SECRET','');vi.stubEnv('VERCEL_ENV','');
 m.jobs=[{id:'job',user_id:'user',status:'queued',storage_path:'user/job/file.pdf',created_at:'2026-09-10',next_retry_at:'2020-01-01',retry_count:0}];
 m.reserve.mockImplementation(async()=>{m.jobs[0].status='processing';return {allowed:true,requestId:'request',attemptId:'attempt',storagePath:'user/job/file.pdf'};});
 m.extract.mockRejectedValue(new Error('Request aborted'));
 m.finish.mockResolvedValue(true);
});
afterEach(()=>vi.unstubAllEnvs());
it('a second worker run does not regenerate a failed document or consume quota',async()=>{
 await run();
 expect(m.jobs[0]).toMatchObject({status:'failed',next_retry_at:null});
 await run();
 expect(m.extract).toHaveBeenCalledOnce();expect(m.reserve).toHaveBeenCalledOnce();
 expect(m.finish).toHaveBeenCalledWith(expect.anything(),false);
 expect(m.finish).not.toHaveBeenCalledWith(expect.anything(),true);
});
it('stale processing becomes a visible failure instead of being queued for another AI call',async()=>{
 m.jobs[0].status='processing';m.jobs[0].processing_started_at='2020-01-01';
 await run();expect(m.jobs[0]).toMatchObject({status:'failed',next_retry_at:null});
 expect(m.extract).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});

it('acknowledges the background job while extraction is still pending and retains its promise',async()=>{
 let reject!: (error: Error) => void;
 m.extract.mockImplementation(()=>new Promise((_resolve,rejectPromise)=>{reject=rejectPromise;}));
 const res=await run({background:'1'});
 expect(res.status).toHaveBeenCalledWith(202);
 expect(m.background).toHaveLength(1);
 await vi.waitFor(()=>expect(m.extract).toHaveBeenCalledOnce());
 expect(m.jobs[0].status).toBe('processing');
 reject(new Error('provider timeout'));
 await m.background[0];
 expect(m.jobs[0].status).toBe('failed');
 expect(res.json).toHaveBeenCalledOnce();
 await run();expect(m.extract).toHaveBeenCalledOnce();
});

it('does not keep dispatching when quota storage is unavailable',async()=>{
 m.reserve.mockRejectedValue(new Error('database unavailable'));
 await run();expect(m.extract).not.toHaveBeenCalled();expect(m.dispatch).not.toHaveBeenCalled();
 expect(m.jobs[0].status).toBe('queued');
});
it('does not spin or call AI when the account already has active extractions',async()=>{
 m.reserve.mockResolvedValue({allowed:false,busy:true,reason:'concurrency_limit'});
 await run();expect(m.extract).not.toHaveBeenCalled();expect(m.dispatch).not.toHaveBeenCalled();
 expect(m.jobs[0].status).toBe('queued');
});
it('a manual worker never expires another customer processing job',async()=>{
 m.jobs=[{id:'other',user_id:'other-user',status:'processing',processing_started_at:'2020-01-01'}];
 await run({manual:'1',userId:'user'});expect(m.jobs[0].status).toBe('processing');expect(m.extract).not.toHaveBeenCalled();
});

function rollingScenario(count: number) {
 const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
 let active = 0, peak = 0;
 m.jobs = Array.from({ length: count }, (_, i) => ({ id: 'job-' + i, user_id: 'user', status: 'queued', storage_path: 'user/job-' + i + '/file.pdf', created_at: '2026-10-01' }));
 m.reserve.mockImplementation(async (userId: string, jobId: string) => {
   const job = m.jobs.find(row => row.id === jobId && row.user_id === userId)!;
   if (job.status !== 'queued') return { allowed: false, busy: true };
   if (m.jobs.filter(row => row.user_id === userId && row.status === 'processing').length >= 2) return { allowed: false, busy: true, reason: 'concurrency_limit' };
   job.status = 'processing';
   return { allowed: true, jobId, userId, requestId: jobId, attemptId: 'attempt-' + jobId, storagePath: job.storage_path };
 });
 m.finish.mockImplementation(async (reservation: any, success: boolean) => {
   if (success) m.jobs.find(row => row.id === reservation.jobId)!.status = 'done';
   return true;
 });
 m.extract.mockImplementation(({ jobId }: any) => {
   active += 1; peak = Math.max(peak, active);
   return new Promise((resolve, reject) => pending.set(jobId, { resolve, reject })).finally(() => { active -= 1; });
 });
 m.dispatch.mockImplementation(async (params: URLSearchParams) => {
   await run({ ...Object.fromEntries(params), background: '1' });
 });
 return {
   pending,
   peak: () => peak,
   complete: (id: string) => pending.get(id)!.resolve({ ok: true, cached: true, status: 'done' }),
   fail: (id: string) => pending.get(id)!.reject(new Error('provider timeout')),
 };
}

it('replaces each completed document immediately while the other original document is still running', async () => {
 const scenario = rollingScenario(4);
 await run({ manual: '1', userId: 'user', background: '1' });
 await vi.waitFor(() => expect(scenario.pending.size).toBe(2));
 scenario.complete('job-0');
 await vi.waitFor(() => expect(scenario.pending.has('job-2')).toBe(true));
 expect(m.jobs[1].status).toBe('processing');
 scenario.complete('job-2');
 await vi.waitFor(() => expect(scenario.pending.has('job-3')).toBe(true));
 expect(m.jobs[1].status).toBe('processing');
 scenario.complete('job-1');scenario.complete('job-3');
 await Promise.all(m.background);
 expect(scenario.peak()).toBe(2);
 expect(m.extract.mock.calls.map(([args]) => args.jobId)).toEqual(['job-0','job-1','job-2','job-3']);
 expect(m.jobs.every(row => row.status === 'done')).toBe(true);
 for (const [params] of m.dispatch.mock.calls) {
   expect(params.get('slots')).toBe('1');expect(params.get('userId')).toBe('user');
 }
});

it('fills both slots after simultaneous completions without losing a slot to a claim race', async () => {
 const scenario = rollingScenario(6);
 await run({ manual: '1', userId: 'user', background: '1' });
 await vi.waitFor(() => expect(scenario.pending.size).toBe(2));
 scenario.complete('job-0');scenario.complete('job-1');
 await vi.waitFor(() => expect(scenario.pending.size).toBe(4));
 expect(m.jobs.filter(row => row.status === 'processing')).toHaveLength(2);
 scenario.complete('job-2');scenario.complete('job-3');
 await vi.waitFor(() => expect(scenario.pending.size).toBe(6));
 expect(m.jobs.filter(row => row.status === 'processing')).toHaveLength(2);
 scenario.complete('job-4');scenario.complete('job-5');
 await Promise.all(m.background);
 expect(scenario.peak()).toBe(2);
 expect(m.extract).toHaveBeenCalledTimes(6);
 expect(new Set(m.extract.mock.calls.map(([args]) => args.jobId)).size).toBe(6);
});

it('replaces a failed document with the next queued one instead of retrying the failure', async () => {
 const scenario = rollingScenario(3);
 await run({ manual: '1', userId: 'user', background: '1' });
 await vi.waitFor(() => expect(scenario.pending.size).toBe(2));
 scenario.fail('job-0');
 await vi.waitFor(() => expect(scenario.pending.has('job-2')).toBe(true));
 expect(m.jobs[0].status).toBe('failed');expect(m.jobs[1].status).toBe('processing');
 scenario.complete('job-1');scenario.complete('job-2');
 await Promise.all(m.background);
 expect(m.extract.mock.calls.filter(([args]) => args.jobId === 'job-0')).toHaveLength(1);
 expect(scenario.peak()).toBe(2);
});
