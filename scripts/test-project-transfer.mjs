import fs from 'node:fs';
import assert from 'node:assert/strict';
// Run with an installed @electric-sql/pglite or pass its module URL as the first argument.
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const root=fileURLToPath(new URL('../',import.meta.url));
const db=new PGlite();
const u='10000000-0000-4000-8000-000000000001', stranger='10000000-0000-4000-8000-000000000002';
const a='20000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002', foreign='20000000-0000-4000-8000-000000000003';
const t='30000000-0000-4000-8000-000000000001', t2='30000000-0000-4000-8000-000000000002';
const j='40000000-0000-4000-8000-000000000001', invoice='50000000-0000-4000-8000-000000000001', d='60000000-0000-4000-8000-000000000001';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.projects(id uuid PRIMARY KEY,user_id uuid NOT NULL,name text NOT NULL);
CREATE TABLE public.callsheet_jobs(id uuid PRIMARY KEY,user_id uuid NOT NULL,project_id uuid REFERENCES projects ON DELETE SET NULL,storage_path text);
CREATE TABLE public.callsheet_results(job_id uuid REFERENCES callsheet_jobs,project_value text);
CREATE TABLE public.trips(id uuid PRIMARY KEY,user_id uuid NOT NULL,project_id uuid REFERENCES projects ON DELETE SET NULL,trip_date date,route jsonb,distance_km numeric,documents jsonb,callsheet_job_id uuid REFERENCES callsheet_jobs,invoice_job_id uuid,purpose text);
CREATE TABLE public.invoice_jobs(id uuid PRIMARY KEY,user_id uuid NOT NULL,project_id uuid REFERENCES projects ON DELETE CASCADE,trip_id uuid REFERENCES trips,storage_path text);
ALTER TABLE public.trips ADD FOREIGN KEY(invoice_job_id) REFERENCES invoice_jobs;
CREATE TABLE public.project_documents(id uuid PRIMARY KEY,user_id uuid NOT NULL,project_id uuid REFERENCES projects ON DELETE CASCADE,trip_id uuid REFERENCES trips,invoice_job_id uuid REFERENCES invoice_jobs,storage_path text);
CREATE TABLE public.project_expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,project_id uuid REFERENCES projects ON DELETE CASCADE,amount numeric);
CREATE TABLE public.future_project_content(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects ON DELETE CASCADE);
`);
await db.exec(fs.readFileSync(root+'/supabase/migrations/20261001000002_move_trip_to_project.sql','utf8'));
async function reset(){await db.exec('TRUNCATE projects,callsheet_jobs,callsheet_results,trips,invoice_jobs,project_documents,project_expenses,future_project_content CASCADE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[u]);await db.query('INSERT INTO projects VALUES ($1,$4,\'Source\'),($2,$4,\'Target\'),($3,$5,\'Private\')',[a,b,foreign,u,stranger]);await db.query("INSERT INTO trips(id,user_id,project_id,trip_date,route,distance_km,documents,purpose) VALUES($1,$2,$3,'2026-10-01','[\"A\",\"B\"]',24,'[]','shoot')",[t,u,a]);}
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const move=(trip=t,source=a,target=b)=>one('SELECT public.move_trip_to_project($1,$2,$3) AS result',[trip,source,target]).then(r=>r.result);
const exists=async(id)=>Number((await one('SELECT count(*) AS n FROM projects WHERE id=$1',[id])).n)>0;
const checks=[];
async function check(name,run){await reset();await run();checks.push(name);console.log('PASS '+name);}
await check('move commits and removes a truly empty source; repeat is idempotent',async()=>{
  await db.exec('SET ROLE authenticated');const result=await move();await db.exec('RESET ROLE');
  assert.equal(result.source_deleted,true);assert.equal(await exists(a),false);
  const row=await one('SELECT * FROM trips WHERE id=$1',[t]);assert.equal(row.project_id,b);assert.deepEqual(row.route,['A','B']);assert.equal(Number(row.distance_km),24);assert.equal(row.purpose,'shoot');
  assert.equal((await move()).source_deleted,true);
});
await check('original callsheet, invoice and receipt move with their trip without deleting file references',async()=>{
  await db.query("INSERT INTO callsheet_jobs VALUES ($1,$2,$3,'user/original.pdf')",[j,u,a]);
  await db.query("INSERT INTO invoice_jobs VALUES ($1,$2,$3,$4,'user/receipt.pdf')",[invoice,u,a,t]);
  await db.query("INSERT INTO project_documents VALUES ($1,$2,$3,$4,$5,'user/receipt.pdf')",[d,u,a,t,invoice]);
  const docs=[{kind:'client_meta',name:'Source'},{storagePath:'user/original.pdf',bucketId:'callsheets'},{storagePath:'user/receipt.pdf',bucketId:'project_documents'}];
  await db.query('UPDATE trips SET callsheet_job_id=$1,invoice_job_id=$2,documents=$3 WHERE id=$4',[j,invoice,JSON.stringify(docs),t]);
  assert.equal((await move()).source_deleted,true);
  for(const table of ['callsheet_jobs','invoice_jobs','project_documents'])assert.equal((await one('SELECT project_id FROM '+table)).project_id,b);
  const saved=(await one('SELECT documents FROM trips')).documents;assert.equal(saved[0].name,'Target');assert.deepEqual(saved.slice(1),docs.slice(1));
});
await check('a trip in another year protects the source',async()=>{
  await db.query("INSERT INTO trips(id,user_id,project_id,trip_date) VALUES ($1,$2,$3,'2024-01-01')",[t2,u,a]);
  assert.equal((await move()).source_deleted,false);assert.equal(await exists(a),true);
});
await check('unlinked legacy trips protect the source',async()=>{
  await db.query('INSERT INTO trips(id,user_id,documents) VALUES ($1,$2,$3)',[t2,u,JSON.stringify([{kind:'client_meta',name:'Source'}])]);
  assert.equal((await move()).source_deleted,false);
});
for(const table of ['project_expenses','project_documents','invoice_jobs','callsheet_jobs','future_project_content'])await check('preserve independent '+table,async()=>{
  if(table==='future_project_content')await db.query('INSERT INTO future_project_content(project_id) VALUES ($1)',[a]);
  else await db.query('INSERT INTO '+table+'(id,user_id,project_id) VALUES ($1,$2,$3)',[d,u,a]);
  const result=await move();assert.equal(result.source_deleted,false);assert.equal(result.source_retained,true);assert.equal(await exists(a),true);
});
await check('legacy extracted callsheets protect the source',async()=>{
  await db.query('INSERT INTO callsheet_jobs(id,user_id) VALUES ($1,$2)',[j,u]);await db.query("INSERT INTO callsheet_results VALUES ($1,'Source')",[j]);assert.equal((await move()).source_retained,true);
});
await check('legacy name-only trip can be moved without inventing IDs',async()=>{
  await db.query('UPDATE trips SET project_id=null,documents=$1',[JSON.stringify([{kind:'client_meta',name:'Source'}])]);assert.equal((await move()).source_deleted,true);
});
await check('ambiguous legacy name is rejected and nothing changes',async()=>{
  await db.query('UPDATE trips SET project_id=null,documents=$1',[JSON.stringify([{kind:'client_meta',name:'Source'}])]);
  await db.query("UPDATE projects SET name='SOURCE' WHERE id=$1",[b]);await assert.rejects(move());assert.equal(await exists(a),true);assert.equal((await one('SELECT project_id FROM trips')).project_id,null);
});
await check('cross-account target is rejected',async()=>{await assert.rejects(move(t,a,foreign));assert.equal((await one('SELECT project_id FROM trips')).project_id,a);});
await check('cross-account trip is rejected',async()=>{await db.query('UPDATE trips SET user_id=$1',[stranger]);await assert.rejects(move());assert.equal(await exists(a),true);});
await check('unauthenticated calls are rejected',async()=>{await db.query("SELECT set_config('request.jwt.claim.sub','',false)");await assert.rejects(move());});
await check('stale source is rejected without moving the trip',async()=>{await db.query('UPDATE projects SET user_id=$1 WHERE id=$2',[u,foreign]);await assert.rejects(move(t,foreign,b));assert.equal((await one('SELECT project_id FROM trips')).project_id,a);});
await check('shared callsheet is preserved for the remaining trip',async()=>{
  await db.query("INSERT INTO callsheet_jobs VALUES ($1,$2,$3,'shared.pdf')",[j,u,a]);await db.query('UPDATE trips SET callsheet_job_id=$1',[j]);
  await db.query('INSERT INTO trips(id,user_id,project_id,callsheet_job_id) VALUES ($1,$2,$3,$4)',[t2,u,a,j]);
  assert.equal((await move()).source_deleted,false);assert.equal((await one('SELECT project_id FROM callsheet_jobs')).project_id,a);
});
await check('failure after moving documents rolls back the entire transaction',async()=>{
  await db.query("INSERT INTO callsheet_jobs VALUES ($1,$2,$3,'original.pdf')",[j,u,a]);await db.query('UPDATE trips SET callsheet_job_id=$1',[j]);
  await db.exec(`CREATE FUNCTION fail_trip_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END $$;
  CREATE TRIGGER fail_trip_move BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION fail_trip_move();`);
  await assert.rejects(move());assert.equal((await one('SELECT project_id FROM callsheet_jobs')).project_id,a);assert.equal((await one('SELECT project_id FROM trips')).project_id,a);assert.equal(await exists(a),true);
  await db.exec('DROP TRIGGER fail_trip_move ON trips; DROP FUNCTION fail_trip_move();');
});
await db.close();console.log(checks.length+' database scenarios passed.');
