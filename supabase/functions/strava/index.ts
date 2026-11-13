import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {collectActivities, hashState} from './core.mjs';

const APP_URL = 'https://bellaviana4-cyber.github.io/ativa-treinos/';
const ORIGIN = new URL(APP_URL).origin;
const cors = {'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store'};
const reply = (data: unknown, status = 200) => Response.json(data, {status, headers: cors});
const checked = (result: any) => { if (result.error) throw new Error('DATABASE_ERROR'); return result.data; };
const messages: Record<string,string> = {
  DATABASE_ERROR:'O banco da integração ainda não está preparado. Execute a migração Strava no Supabase.',
  STRAVA_RATE_LIMIT:'O Strava pediu uma pausa. Tente novamente em 15 minutos.',
  STRAVA_RECONNECT:'A autorização expirou ou foi revogada. Reconecte sua conta Strava.',
  STRAVA_UNAVAILABLE:'O Strava não respondeu. Tente novamente mais tarde.',
  STRAVA_HISTORY_LIMIT:'Seu histórico excede o limite desta integração (menos de 4.000 atividades). O CSV continua disponível.',
  OAUTH_EXPIRED:'A autorização venceu ou já foi usada. Toque em Conectar ao Strava novamente.',
  STRAVA_CONFIG:'Falta configurar STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no servidor.',
  BUSY:'Uma sincronização já está em andamento. Aguarde um minuto.',
  NOT_CONNECTED:'Conecte sua conta Strava primeiro.',
  TOKEN_ERROR:'Não foi possível autorizar o Strava. Tente conectar novamente.'
};

Deno.serve(async (req: Request) => {
  if (req.headers.get('origin') && req.headers.get('origin') !== ORIGIN) return reply({error:'Origem não permitida.'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method !== 'POST') return reply({error:'Método não permitido.'},405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
    const bearer = req.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return reply({error:'Entre na conta do ATIVA primeiro.'},401);
    const {data:auth,error:authError} = await admin.auth.getUser(bearer.slice(7));
    if (authError || !auth.user) return reply({error:'Sua sessão do ATIVA venceu. Entre novamente.'},401);
    const userId = auth.user.id;
    const body = await req.json();
    const action = body.action;
    let connection = checked(await admin.from('ativa_strava_connections').select('*').eq('user_id',userId).maybeSingle());
    const readActivities = async () => {
      const all=[];
      for(let offset=0;offset<4000;offset+=500){
        const rows=checked(await admin.from('ativa_strava_activities').select('activity').eq('user_id',userId).order('activity_id').range(offset,offset+499));
        all.push(...rows.map((r:any)=>r.activity));if(rows.length<500)break;
      }
      return all;
    };
    if (action === 'status') return reply({connected:!!connection,lastSync:connection?.last_sync || null});
    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('STRAVA_CONFIG');
    const tokenRequest = async (fields: Record<string,string>) => {
      const response = await fetch('https://www.strava.com/oauth/token', {method:'POST',
        body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...fields}),signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(response.status===429?'STRAVA_RATE_LIMIT':'TOKEN_ERROR');
      const token = await response.json();
      if (typeof token.access_token!=='string' || typeof token.refresh_token!=='string' || !Number.isFinite(token.expires_at)) throw new Error('TOKEN_ERROR');
      return token;
    };
    if (action === 'start') {
      const state = crypto.randomUUID() + crypto.randomUUID();
      checked(await admin.from('ativa_strava_oauth').upsert({user_id:userId,state_hash:await hashState(state),expires_at:new Date(Date.now()+600000).toISOString()}));
      const authorize = new URL('https://www.strava.com/oauth/authorize');
      authorize.search = new URLSearchParams({client_id:clientId,redirect_uri:APP_URL+'?ativa_strava=1',response_type:'code',approval_prompt:'force',scope:'activity:read_all',state}).toString();
      return reply({url:authorize.toString(),state});
    }
    if (action === 'exchange') {
      if (typeof body.state!=='string' || body.state.length>200 || typeof body.code!=='string' || body.code.length>300) throw new Error('OAUTH_EXPIRED');
      // DELETE ... RETURNING makes the ten-minute state single-use and user-bound.
      const pending = checked(await admin.from('ativa_strava_oauth').delete().eq('user_id',userId).eq('state_hash',await hashState(body.state)).gt('expires_at',new Date().toISOString()).select('user_id'));
      if (!pending.length) throw new Error('OAUTH_EXPIRED');
      const exchangeLock=crypto.randomUUID();
      if(connection){
        const acquired=checked(await admin.from('ativa_strava_connections').update({sync_lock:exchangeLock,locked_until:new Date(Date.now()+600000).toISOString()})
          .eq('user_id',userId).or('locked_until.is.null,locked_until.lt.'+new Date().toISOString()).select('user_id').maybeSingle());
        if(!acquired)throw new Error('BUSY');
      }
      try {
        const token = await tokenRequest({grant_type:'authorization_code',code:body.code});
        if (!Number.isSafeInteger(token.athlete?.id)) throw new Error('TOKEN_ERROR');
        const values={user_id:userId,athlete_id:token.athlete.id,access_token:token.access_token,refresh_token:token.refresh_token,
          expires_at:token.expires_at,last_sync:null,sync_lock:exchangeLock,locked_until:new Date(Date.now()+600000).toISOString()};
        if(connection)checked(await admin.from('ativa_strava_connections').update(values).eq('user_id',userId).eq('sync_lock',exchangeLock));
        else checked(await admin.from('ativa_strava_connections').insert(values));
        checked(await admin.from('ativa_strava_activities').delete().eq('user_id',userId));
        return reply({connected:true});
      } finally {
        await admin.from('ativa_strava_connections').update({sync_lock:null,locked_until:null}).eq('user_id',userId).eq('sync_lock',exchangeLock);
      }
    }
    if (!connection) throw new Error('NOT_CONNECTED');
    if (action === 'sync' || action === 'disconnect') {
      if (action === 'sync' && connection.last_sync && Date.now()-Date.parse(connection.last_sync)<900000) {
        return reply({connected:true,cached:true,lastSync:connection.last_sync,activities:await readActivities()});
      }
      const lock = crypto.randomUUID();
      const acquired = checked(await admin.from('ativa_strava_connections').update({sync_lock:lock,locked_until:new Date(Date.now()+600000).toISOString()})
        .eq('user_id',userId).or('locked_until.is.null,locked_until.lt.'+new Date().toISOString()).select('*').maybeSingle());
      if (!acquired) throw new Error('BUSY');
      connection = acquired;
      try {
        if (connection.expires_at < Date.now()/1000+120) {
          const token = await tokenRequest({grant_type:'refresh_token',refresh_token:connection.refresh_token});
          checked(await admin.from('ativa_strava_connections').update({access_token:token.access_token,refresh_token:token.refresh_token,expires_at:token.expires_at}).eq('user_id',userId).eq('sync_lock',lock));
          connection.access_token=token.access_token;
        }
        if (action === 'disconnect') {
          const response = await fetch('https://www.strava.com/oauth/deauthorize',{method:'POST',body:new URLSearchParams({access_token:connection.access_token}),signal:AbortSignal.timeout(15000)});
          if (!response.ok && response.status!==401) throw new Error('STRAVA_UNAVAILABLE');
          checked(await admin.from('ativa_strava_activities').delete().eq('user_id',userId));
          checked(await admin.from('ativa_strava_connections').delete().eq('user_id',userId).eq('sync_lock',lock));
          checked(await admin.from('ativa_strava_oauth').delete().eq('user_id',userId));
          return reply({connected:false});
        }
        let activities;
        try{activities=await collectActivities(connection.access_token);}catch(error){
          if((error as Error).message==='STRAVA_RECONNECT'){
            checked(await admin.from('ativa_strava_activities').delete().eq('user_id',userId));
            checked(await admin.from('ativa_strava_connections').delete().eq('user_id',userId).eq('sync_lock',lock));
          }
          throw error;
        }
        checked(await admin.rpc('ativa_replace_strava',{p_user:userId,p_lock:lock,p_activities:activities}));
        return reply({connected:true,lastSync:new Date().toISOString(),activities});
      } finally {
        await admin.from('ativa_strava_connections').update({sync_lock:null,locked_until:null}).eq('user_id',userId).eq('sync_lock',lock);
      }
    }
    return reply({error:'Ação desconhecida.'},400);
  } catch (error) {
    // Never echo provider payloads, request bodies or credentials into logs/errors.
    return reply({error:messages[(error as Error).message] || 'Não foi possível concluir. Confira a configuração do serviço e tente novamente.'},400);
  }
});
