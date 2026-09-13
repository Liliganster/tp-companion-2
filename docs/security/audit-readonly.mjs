import fs from 'node:fs';
import dotenv from 'dotenv';
const env=dotenv.parse(fs.readFileSync('.env.local'));
const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
const key=env.SUPABASE_SERVICE_ROLE_KEY;
console.log('local_config_presence',Object.fromEntries(['SUPABASE_SERVICE_ROLE_KEY','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','CRON_SECRET','GEMINI_API_KEY','VITE_TURNSTILE_SITE_KEY'].map(k=>[k,Boolean(env[k])])));
async function read(label,target,headers={},body=false){
 try {const r=await fetch(target,{headers,signal:AbortSignal.timeout(15000)}); const out={label,status:r.status};
 if(body){const j=await r.json();out.data=label==='buckets'&&Array.isArray(j)?j.map(x=>({id:x.id,public:x.public,file_size_limit:x.file_size_limit,allowed_mime_types:x.allowed_mime_types})):label==='auth_settings'?{disable_signup:j.disable_signup,mailer_autoconfirm:j.mailer_autoconfirm,phone_autoconfirm:j.phone_autoconfirm}:undefined;}
 else out.headers=Object.fromEntries(['content-security-policy','strict-transport-security','x-frame-options','x-content-type-options','referrer-policy','cache-control','content-range'].map(k=>[k,r.headers.get(k)]));
 console.log(JSON.stringify(out));}catch(e){console.log(JSON.stringify({label,error:e.cause?.code||e.name}));}
}
await Promise.all([
 read('production','https://dashboard.fahrtenbuchpro.com/'),
 ...['/api/user/subscription','/api/worker','/api/google/oauth/access-token'].map(p=>read(p,'https://dashboard.fahrtenbuchpro.com'+p)),
 ...(url&&key?[read('buckets',url+'/storage/v1/bucket',{apikey:key,Authorization:'Bearer '+key},true),
 ...['billing_entitlements','ai_quota_reservations','account_deletion_requests'].map(t=>read('table_'+t,url+'/rest/v1/'+t+'?select=*&limit=0',{apikey:key,Authorization:'Bearer '+key})),
 read('auth_settings',url+'/auth/v1/settings',{apikey:env.VITE_SUPABASE_ANON_KEY||key},true),
 ...['google_connections','user_profiles','projects','trips','callsheet_jobs','billing_entitlements','ai_quota_reservations'].map(t=>read('anonymous_'+t,url+'/rest/v1/'+t+'?select=*&limit=0',{apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+env.VITE_SUPABASE_ANON_KEY,Prefer:'count=exact'}))]:[])
]);
