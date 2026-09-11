import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({jobs:[] as any[],extract:vi.fn(),finish:vi.fn(),reserve:vi.fn()}));
vi.mock('../../src/lib/supabaseServer.js',()=>({supabaseAdmin:{from:(table:string)=>{
 let changes:any;const filters:Array<(row:any)=>boolean>=[];let single=false;let head=false;
 const result=()=>{
  const rows=table==='callsheet_jobs'?m.jobs.filter(row=>filters.every(f=>f(row))):[{}];
  if(changes) rows.forEach(row=>Object.assign(row,changes));
  return {data:head?null:single?rows[0]??null:rows,error:null,count:rows.length};
 };
 const q:any={select:(_fields:any,options:any)=>{head=Boolean(options?.head);return q;},
 eq:(field:string,value:any)=>{filters.push(row=>row[field]===value);return q;},
 lt:(field:string,value:any)=>{filters.push(row=>row[field]<value);return q;},
 update:(value:any)=>{changes=value;return q;},order:()=>q,limit:()=>q,
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
const run=async()=>{
 const res:any={status:vi.fn(()=>res),json:vi.fn(),setHeader:vi.fn(),end:vi.fn()};
 await handler({method:'POST',headers:{},query:{}},res);return res;
};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('CRON_SECRET','');vi.stubEnv('VERCEL_ENV','');
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
