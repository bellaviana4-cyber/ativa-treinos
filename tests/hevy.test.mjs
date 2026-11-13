import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeWorkout,getPage,collectWorkouts} from '../supabase/functions/hevy/core.mjs';
const {mergeHistory}=createRequire(import.meta.url)('../hevy-model.js');
const workout=(id='test-workout')=>({id,title:'Treino teste',start_time:'2026-11-13T01:30:00Z',end_time:'2026-11-13T02:30:00Z',description:'private note',exercises:[{title:'Bench Press',notes:'private note',sets:[{type:'warmup',weight_kg:20,reps:10},{type:'normal',weight_kg:30,reps:8,rpe:8}]}]});

test('preserves warmups and work sets, uses São Paulo date, and omits notes',()=>{
  const [result]=normalizeWorkout(workout());
  assert.equal(result.d,'2026-11-12');assert.equal(result.time,'22:30:00');assert.equal(result.m,60);
  assert.equal(result.ex[0].s[0].t,'w');assert.equal(result.ex[0].s[1].kg,30);assert.equal(result.ex[0].s[1].r,8);
  assert.ok(!JSON.stringify(result).includes('private note'));
});
test('preserves assisted negative loads and timed bodyweight exercises',()=>{
  const w=workout();w.exercises=[{title:'Assisted Pull Up',sets:[{type:'dropset',weight_kg:-20,reps:6}]},{title:'Plank',sets:[{type:'normal',weight_kg:null,reps:null,duration_seconds:45}]}];
  const [result]=normalizeWorkout(w);assert.equal(result.ex[0].s[0].kg,-20);assert.equal(result.ex[0].s[0].t,'d');assert.equal(result.ex[1].s[0].sec,45);
});
test('mixed session keeps strength and running as separate records with stable ids',()=>{
  const w=workout();w.exercises.push({title:'Running',sets:[{distance_meters:5000,duration_seconds:1800}]});
  const results=normalizeWorkout(w);assert.equal(results.length,2);assert.equal(results[1].kind,'run');assert.equal(results[1].km,5);assert.equal(results[1].sec,1800);
  assert.deepEqual(normalizeWorkout(w).map(a=>a.id),results.map(a=>a.id));
});
test('every provider call is GET and passes the API key only in its header',async()=>{
  const result=await collectWorkouts('test-key',async(url,options)=>{
    assert.equal(options.method,'GET');assert.equal(options.headers['api-key'],'test-key');assert.ok(!url.includes('test-key'));
    return Response.json({page:1,page_count:1,workouts:[workout()]});
  });assert.equal(result.length,1);
});
test('failed or shifting pages do not return a partial history',async()=>{
  let page=0;
  await assert.rejects(collectWorkouts('test',async()=>++page===1?Response.json({page_count:2,workouts:Array.from({length:10},(_,i)=>workout(String(i)))}):new Response('',{status:429})),/HEVY_RATE/);
  page=0;
  await assert.rejects(collectWorkouts('test',async()=>++page===1?Response.json({page_count:2,workouts:Array.from({length:10},(_,i)=>workout(String(i)))}):Response.json({page_count:2,workouts:[workout('9')]})),/HEVY_CHANGED/);
});
test('validates Pro key errors and caps large accounts without dropping prior data',async()=>{
  await assert.rejects(getPage('test',1,async()=>new Response('',{status:401})),/HEVY_KEY/);
  await assert.rejects(collectWorkouts('test',async()=>Response.json({page_count:101,workouts:[]})),/HEVY_LIMIT/);
});
test('CSV and API merge deduplicates matching sessions but keeps unrelated CSV history',()=>{
  const [api]=normalizeWorkout(workout());
  const csv={...api,id:'csv-id',time:api.time.slice(0,5),api:false};
  const other={...csv,id:'csv-old',d:'2025-01-01'};
  const merged=mergeHistory([csv,other],[api]);assert.equal(merged.length,2);assert.equal(merged[0].id,api.id);assert.equal(merged[1].id,other.id);
  assert.equal(mergeHistory([csv,other],[]).length,2);
});
test('app starts with both integrations and excludes API copies from backups',()=>{
  const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{textContent:id==='hevy-history'?'[]':'',innerHTML:'',style:{},classList:{toggle(){}},addEventListener(){},querySelector(){return null}});return elements.get(id);};
  const sandbox={Date,Math,JSON,Number,String,Object,Array,Set,Map,URL,URLSearchParams,structuredClone,setTimeout,clearTimeout,setInterval(){},addEventListener(){},document:{hidden:false,getElementById:el,addEventListener(){},querySelectorAll(){return []}},history:{replaceState(){}},location:{search:'',pathname:'/',hash:''},navigator:{onLine:false},localStorage:{getItem(){return null},setItem(){}},sessionStorage:{getItem(){return null},removeItem(){}}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);
  for(const path of ['activity-model.js','hevy-model.js','hevy.js','strava-model.js','strava.js'])vm.runInContext(readFileSync(new URL('../'+path,import.meta.url),'utf8'),context);
  for(const match of readFileSync(new URL('../index.html',import.meta.url),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
  const settings=vm.runInContext('settingsPage()',context);assert.ok(settings.includes('Hevy automático'));assert.ok(settings.includes('Strava automático'));
  vm.runInContext("state.hevyApi=[{id:'hevy-api-1',api:true}];state.hevy=[{id:'csv-1'}];",context);
  assert.equal(vm.runInContext('completeState().hevyApi',context),undefined);assert.equal(vm.runInContext('completeState().hevy.length',context),1);
});
test('server source transpiles and validates every user before private data access',()=>{
  let handler,queried=false;
  const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/hevy/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
  const sandbox={Response,Request,URL,Date,crypto,createClient:()=>({auth:{getUser:async()=>({data:{user:null},error:{}})},from(){queried=true;throw Error('Unexpected table access');}}),Deno:{env:{get:()=> 'test-only'},serve:fn=>{handler=fn;}}};
  vm.runInNewContext(source,sandbox);
  return handler(new Request('https://example.supabase.co/functions/v1/hevy',{method:'POST',headers:{Authorization:'Bearer invalid'},body:'{"action":"sync"}'})).then(response=>{assert.equal(response.status,401);assert.equal(queried,false);});
});
