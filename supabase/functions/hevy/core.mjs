const setType={normal:'n',warmup:'w',dropset:'d',failure:'f'};
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function normalizeWorkout(workout) {
  if(typeof workout.id!=='string'||!workout.id||!Array.isArray(workout.exercises))throw Error('HEVY_FORMAT');
  const start=new Date(workout.start_time),end=new Date(workout.end_time);
  if(!Number.isFinite(start.getTime()))throw Error('HEVY_FORMAT');
  // Dates are grouped in the app owner's timezone, not the Edge server's UTC.
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(start).map(p=>[p.type,p.value]));
  const base={hevyId:workout.id,api:true,d:`${parts.year}-${parts.month}-${parts.day}`,
    time:`${parts.hour}:${parts.minute}:${parts.second}`,t:String(workout.title||'Treino Hevy').slice(0,200),
    m:Number.isFinite(end.getTime())?Math.max(0,Math.round((end-start)/60000)):0,source:'Hevy'};
  const strength=[],runs=[],walks=[];
  for(const exercise of workout.exercises){
    if(typeof exercise.title!=='string'||!Array.isArray(exercise.sets))throw Error('HEVY_FORMAT');
    const name=exercise.title.trim(),sets=exercise.sets.map(s=>({kg:typeof s.weight_kg==='number'&&Number.isFinite(s.weight_kg)?s.weight_kg:null,r:numeric(s.reps),t:setType[s.type]||'n',rpe:numeric(s.rpe),sec:numeric(s.duration_seconds)}));
    const type=name.toLowerCase();
    if(['running','corrida','treadmill','esteira'].includes(type))runs.push(...exercise.sets);
    else if(['walking','caminhada'].includes(type))walks.push(...exercise.sets);
    else if(!['elliptical trainer','cycling','bicicleta','elíptico'].includes(type))strength.push({n:name.slice(0,200),s:sets});
  }
  const result=[];
  if(strength.length)result.push({...base,id:'hevy-api-'+workout.id+'-strength',kind:'strength',ex:strength});
  for(const [kind,sets] of [['run',runs],['walk',walks]]){
    const distance=sets.reduce((n,s)=>n+(numeric(s.distance_meters)||0),0),sec=sets.reduce((n,s)=>n+(numeric(s.duration_seconds)||0),0);
    if(distance>0&&sec>0)result.push({...base,id:'hevy-api-'+workout.id+'-'+kind,kind,km:Math.round(distance/10)/100,sec});
  }
  return result;
}
export async function getPage(key,page,request=fetch){
  const response=await request('https://api.hevyapp.com/v1/workouts?page='+page+'&pageSize=10',{
    method:'GET',headers:{'api-key':key,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error([401,403].includes(response.status)?'HEVY_KEY':response.status===429?'HEVY_RATE':'HEVY_UNAVAILABLE');
  const data=await response.json();
  if(!Array.isArray(data.workouts)||!Number.isInteger(data.page_count)||data.page_count<0)throw Error('HEVY_FORMAT');
  return data;
}
export async function collectWorkouts(key,request=fetch){
  const first=await getPage(key,1,request);
  if(first.page_count>100)throw Error('HEVY_LIMIT');
  const workouts=new Map();let total=first.workouts.length;
  for(const workout of first.workouts)workouts.set(workout.id,workout);
  for(let page=2;page<=first.page_count;page++){
    const data=await getPage(key,page,request);
    if(data.page_count!==first.page_count||!data.workouts.length)throw Error('HEVY_CHANGED');
    total+=data.workouts.length;
    for(const workout of data.workouts)workouts.set(workout.id,workout);
  }
  // Reject a shifting page boundary rather than deleting an older cached workout.
  if(workouts.size!==total||(first.page_count>1&&workouts.size<10*(first.page_count-1)))throw Error('HEVY_CHANGED');
  return [...workouts.values()].flatMap(normalizeWorkout).sort((a,b)=>(b.d+b.time).localeCompare(a.d+a.time));
}
