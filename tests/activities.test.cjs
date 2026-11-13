const test=require('node:test'),assert=require('node:assert/strict');
const {completed,forPlan}=require('../activity-model.js');
const gym={id:'hevy-1',d:'2026-11-09',time:'10:00:00',kind:'strength',t:'B - superiores',source:'Hevy'};
const run={id:'hevy-2',d:'2026-11-12',kind:'run',km:8,sec:2930,source:'Hevy'};
test('Hevy sessions count as completed activities without any local logs',()=>{
  const activities=completed([gym,run]);assert.equal(activities.length,2);
  assert.equal(activities.filter(a=>a.kind==='strength').length,1);
  assert.equal(activities.filter(a=>a.kind==='run').reduce((n,a)=>n+a.km,0),8);
});
test('off-schedule B on Monday never completes the planned A',()=>{
  assert.equal(forPlan(completed([gym]),gym.d,{kind:'strength',id:'A'}),null);
  assert.equal(forPlan(completed([gym]),gym.d,{kind:'strength',id:'B'}).id,gym.id);
});
test('an imported Thursday run completes its planned run on its actual date',()=>{
  assert.equal(forPlan(completed([run]),run.d,{kind:'run',role:'Longo'}).id,run.id);
  assert.equal(forPlan(completed([run]),'2026-11-10',{kind:'run',role:'Leve'}),null);
});
test('a manual copy and Hevy copy count once while a draft does not count',()=>{
  const manual={...gym,id:'local-1',source:'ATIVA',templateId:'B',status:'done'};
  const draft={...manual,id:'draft',templateId:'C',status:'partial'};
  assert.equal(completed([gym,manual,draft]).length,1);
  assert.equal(completed([gym,manual])[0].id,'local-1');
});
test('matching runs across sources count once, distinct runs remain separate',()=>{
  const manual={...run,id:'local-run',source:'ATIVA',status:'done',role:'Longo'};
  assert.equal(completed([run,manual]).length,1);
  assert.equal(completed([run,{...manual,id:'different',km:4,sec:1500}]).length,2);
  assert.equal(completed([run,{...run,id:'second-run'}]).length,2);
});
