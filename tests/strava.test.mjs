import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {normalizeActivity, collectActivities, hashState} from '../supabase/functions/strava/core.mjs';
const {mergeActivities}=createRequire(import.meta.url)('../strava-model.js');
const activity=(id=123)=>({id,sport_type:'Run',start_date_local:'2026-11-13T06:30:00Z',
  start_date:'2026-11-13T09:30:00Z',name:'Corrida <manhã>',distance:5123,moving_time:1800,
  map:{summary_polyline:'private route'},start_latlng:[1,2],athlete:{id:987},access_token:'private'});

test('keeps local date, converts meters, and returns only the display metrics',()=>{
  const result=normalizeActivity(activity());
  assert.deepEqual(result,{id:'strava-api-123',stravaId:'123',api:true,d:'2026-11-13',time:'06:30:00',
    t:'Corrida <manhã>',kind:'run',km:5.12,sec:1800,source:'Strava'});
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('accepts trail and virtual runs, rejects rides and broken measurements',()=>{
  assert.ok(normalizeActivity({...activity(),sport_type:'TrailRun'}));
  assert.ok(normalizeActivity({...activity(),sport_type:'VirtualRun'}));
  for(const values of [{sport_type:'Ride'},{id:'123'},{distance:0},{moving_time:NaN},{start_date_local:'bad'}])
    assert.equal(normalizeActivity({...activity(),...values}),null);
});
test('reads every page and stable ids deduplicate a changing page boundary',async()=>{
  let calls=0;
  const result=await collectActivities('test-token',async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert.ok(url.startsWith('https://www.strava.com/api/v3/athlete/activities?'));
    calls++;
    return Response.json(calls===1?Array.from({length:200},(_,i)=>activity(i+1)):[activity(200),activity(201)]);
  });
  assert.equal(calls,2);assert.equal(result.length,201);
});
test('a failed second page rejects the entire scan instead of replacing old data',async()=>{
  let calls=0;
  await assert.rejects(collectActivities('test',async()=>++calls===1?
    Response.json(Array.from({length:200},(_,i)=>activity(i+1))):new Response('',{status:429})),/STRAVA_RATE_LIMIT/);
});
test('caps a huge history without silently marking the partial result complete',async()=>{
  let calls=0;
  await assert.rejects(collectActivities('test',async()=>{calls++;return Response.json(Array.from({length:200},(_,i)=>activity(calls*200+i)));}),/STRAVA_HISTORY_LIMIT/);
  assert.equal(calls,20);
});
test('merging replaces API copies, keeps CSV, handles deletion and never duplicates ids',()=>{
  const csv={id:'csv-original',kind:'run',d:'2026-11-12',km:4,sec:1200};
  const old={...normalizeActivity(activity(1)),apiUser:'user-1'};
  const remote=normalizeActivity(activity(2));
  const merged=mergeActivities([old,csv],[remote,remote],'user-1');
  assert.equal(merged.length,2);assert.equal(merged[0].apiUser,'user-1');assert.equal(merged[1],csv);
  assert.deepEqual(mergeActivities(merged,[],'user-1'),[csv]);
  assert.throws(()=>mergeActivities([csv],[{...remote,km:-1}],'user-1'),/inválida/);
});
test('OAuth state fingerprints are deterministic and do not store the bearer state',async()=>{
  const state='random-test-state';
  const hash=await hashState(state);
  assert.equal(hash.length,64);assert.equal(hash,await hashState(state));
  assert.notEqual(hash,await hashState(state+'other'));assert.ok(!hash.includes(state));
});

function handlerFixture({valid=true,expired=false}={}) {
  const calls=[];
  let handler;
  const database={
    auth:{getUser:async token=>{
      calls.push(['getUser',token]);
      return {data:{user:valid?{id:'owner-123'}:null},error:valid?null:{message:'invalid'}};
    }},
    from(table){
      const chain={};let operation='';
      for(const name of ['select','eq','gt','delete','upsert'])chain[name]=(...args)=>{
        calls.push([table,name,...args]);if(name==='delete')operation='delete';return chain;
      };
      chain.maybeSingle=async()=>({data:null,error:null});
      chain.then=(resolve,reject)=>Promise.resolve({data:operation==='delete'?(expired?[]:[{user_id:'owner-123'}]):null,error:null}).then(resolve,reject);
      return chain;
    }
  };
  const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/strava/index.ts',import.meta.url),'utf8'))
    .replace(/^import .*;\r?\n/gm,'');
  vm.runInNewContext(source,{
    createClient:()=>database,collectActivities,hashState,crypto,Response,Request,URL,URLSearchParams,AbortSignal,
    fetch:()=>{throw Error('Unexpected provider call');},
    Deno:{env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',STRAVA_CLIENT_ID:'1',STRAVA_CLIENT_SECRET:'test-only'})[key]},serve:fn=>{handler=fn;}}
  });
  return {calls,handler};
}
const apiRequest=(body,token='user-test')=>new Request('https://example.supabase.co/functions/v1/strava',{
  method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});

test('missing and invalid sessions never query the private tables',async()=>{
  for(const token of ['', 'invalid']){
    const fixture=handlerFixture({valid:false});
    const response=await fixture.handler(apiRequest({action:'status'},token));
    assert.equal(response.status,401);
    assert.ok(!fixture.calls.some(c=>c[0].startsWith('ativa_')));
  }
});
test('status queries only the authenticated owner and does not return credentials',async()=>{
  const fixture=handlerFixture();
  const response=await fixture.handler(apiRequest({action:'status'}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{connected:false,lastSync:null});
  assert.ok(fixture.calls.some(c=>c[0]==='ativa_strava_connections'&&c[1]==='eq'&&c[2]==='user_id'&&c[3]==='owner-123'));
});
test('OAuth state redemption filters by authenticated owner, hash and expiry before token exchange',async()=>{
  const fixture=handlerFixture({expired:true});
  const response=await fixture.handler(apiRequest({action:'exchange',state:'test-state',code:'test-code',user_id:'someone-else'}));
  assert.equal(response.status,400);assert.match((await response.json()).error,/venceu/);
  const calls=fixture.calls.filter(c=>c[0]==='ativa_strava_oauth');
  assert.ok(calls.some(c=>c[1]==='delete'));
  assert.ok(calls.some(c=>c[1]==='eq'&&c[2]==='user_id'&&c[3]==='owner-123'));
  assert.ok(calls.some(c=>c[1]==='eq'&&c[2]==='state_hash'&&c[3].length===64));
  assert.ok(calls.some(c=>c[1]==='gt'&&c[2]==='expires_at'));
});
test('requests from unrelated websites are rejected before authentication or data access',async()=>{
  const fixture=handlerFixture();
  const request=apiRequest({action:'status'});request.headers.set('Origin','https://unrelated.example');
  assert.equal((await fixture.handler(request)).status,403);assert.equal(fixture.calls.length,0);
});
