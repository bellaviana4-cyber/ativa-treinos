(function(root){
  'use strict';
  function templateId(activity){
    if(activity.templateId)return activity.templateId;
    const match=String(activity.t||activity.title||'').trim().match(/^(?:treino\s+)?([a-d])\b/i);
    return match?match[1].toUpperCase():null;
  }
  function completed(activities){
    const result=[],ids=new Set();
    // Prefer an explicit ATIVA record when the same activity exists in two sources.
    const ordered=activities.filter(a=>['strength','run'].includes(a.kind)&&(a.source!=='ATIVA'||a.status==='done'))
      .sort((a,b)=>Number(b.source==='ATIVA')-Number(a.source==='ATIVA'));
    for(const a of ordered){
      const id=a.source+'|'+a.id;if(ids.has(id))continue;ids.add(id);
      if(a.kind==='run'&&!(Number(a.km)>0))continue;
      const duplicate=result.some(b=>{
        if(a.source===b.source||a.kind!==b.kind||a.d!==b.d)return false;
        if(a.kind==='run')return Number(a.sec)>0&&Number(b.sec)>0&&Math.abs(Number(a.km)-Number(b.km))<.05&&Math.abs(Number(a.sec)-Number(b.sec))<=30;
        const aTemplate=templateId(a),bTemplate=templateId(b);
        if(aTemplate&&bTemplate&&aTemplate===bTemplate&&[a.source,b.source].includes('ATIVA'))return true;
        return a.time&&b.time&&a.time.slice(0,5)===b.time.slice(0,5)&&a.t===b.t;
      });
      if(!duplicate)result.push(a);
    }
    return result;
  }
  function forPlan(activities,date,plan){
    return activities.find(a=>a.d===date&&a.kind===plan.kind&&(plan.kind==='strength'
      ?templateId(a)===plan.id:(a.source!=='ATIVA'||a.role===plan.role)))||null;
  }
  const api={templateId,completed,forPlan};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AtivaActivities=api;
})(typeof window==='object'?window:globalThis);
