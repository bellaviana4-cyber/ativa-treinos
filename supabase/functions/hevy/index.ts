import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {getPage,collectWorkouts} from './core.mjs';
const ORIGIN='https://bellaviana4-cyber.github.io';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
const checked=(r:any)=>{if(r.error)throw Error('DATABASE');return r.data;};
const messages:Record<string,string>={DATABASE:'Não foi possível acessar o banco da integração Hevy.',HEVY_KEY:'Chave Hevy inválida ou sem acesso Pro. Confira a chave na sua conta Hevy.',HEVY_RATE:'O Hevy pediu uma pausa. Tente novamente em 15 minutos.',HEVY_UNAVAILABLE:'O Hevy não respondeu. Tente novamente mais tarde.',HEVY_FORMAT:'O formato de resposta do Hevy mudou. A cópia anterior foi preservada.',HEVY_LIMIT:'A conta excede o limite de 1.000 treinos desta integração. O CSV continua disponível.',HEVY_CHANGED:'O histórico mudou durante a leitura. Vamos tentar novamente sem substituir a cópia anterior.',BUSY:'Uma busca já está em andamento. Aguarde um minuto.',NOT_CONNECTED:'Conecte sua conta Hevy primeiro.'};
Deno.serve(async(req:Request)=>{
  if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply({error:'Origem não permitida.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply({error:'Método não permitido.'},405);
  try{
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const bearer=req.headers.get('authorization')||'';
    if(!bearer.startsWith('Bearer '))return reply({error:'Entre na conta ATIVA primeiro.'},401);
    const {data:auth,error}=await admin.auth.getUser(bearer.slice(7));
    if(error||!auth.user)return reply({error:'Sua sessão ATIVA venceu. Entre novamente.'},401);
    const userId=auth.user.id,{action,apiKey}=await req.json();
    let connection=checked(await admin.from('ativa_hevy_connections').select('*').eq('user_id',userId).maybeSingle());
    if(action==='status')return reply({connected:!!connection,lastSync:connection?.last_sync||null});
    if(!['connect','sync','disconnect'].includes(action))return reply({error:'Ação desconhecida.'},400);
    if(action==='connect'&&(typeof apiKey!=='string'||!/^\s*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\s*$/i.test(apiKey)))throw Error('HEVY_KEY');
    if(action!=='connect'&&!connection)throw Error('NOT_CONNECTED');
    if(action==='sync'&&connection.last_sync&&Date.now()-Date.parse(connection.last_sync)<900000)
      return reply({connected:true,cached:true,lastSync:connection.last_sync,activities:connection.activities});
    const lock=crypto.randomUUID();
    if(connection){
      const acquired=checked(await admin.from('ativa_hevy_connections').update({sync_lock:lock,locked_until:new Date(Date.now()+300000).toISOString()})
        .eq('user_id',userId).or('locked_until.is.null,locked_until.lt.'+new Date().toISOString()).select('*').maybeSingle());
      if(!acquired)throw Error('BUSY');connection=acquired;
    }
    try{
      if(action==='connect'){
        await getPage(apiKey.trim(),1);
        const values={user_id:userId,api_key:apiKey.trim(),activities:[],last_sync:null};
        if(connection)checked(await admin.from('ativa_hevy_connections').update(values).eq('user_id',userId).eq('sync_lock',lock));
        else checked(await admin.from('ativa_hevy_connections').insert(values));
        return reply({connected:true});
      }
      if(action==='disconnect'){
        checked(await admin.from('ativa_hevy_connections').delete().eq('user_id',userId).eq('sync_lock',lock));
        return reply({connected:false});
      }
      const activities=await collectWorkouts(connection.api_key);
      const lastSync=new Date().toISOString();
      const saved=checked(await admin.from('ativa_hevy_connections').update({activities,last_sync:lastSync,sync_lock:null,locked_until:null})
        .eq('user_id',userId).eq('sync_lock',lock).gt('locked_until',lastSync).select('user_id').maybeSingle());
      if(!saved)throw Error('BUSY');
      return reply({connected:true,lastSync,activities});
    }finally{
      if(connection)await admin.from('ativa_hevy_connections').update({sync_lock:null,locked_until:null}).eq('user_id',userId).eq('sync_lock',lock);
    }
  }catch(error){return reply({error:messages[(error as Error).message]||'Não foi possível concluir a conexão Hevy. Tente novamente.'},400);}
});
