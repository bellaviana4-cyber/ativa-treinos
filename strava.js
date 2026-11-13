'use strict';
const stravaUI = {connected:false, busy:false, message:'Entre na sincronização privada para conectar o Strava.', lastSync:null, user:null, nextCheck:0};
const STRAVA_PENDING = 'ativa_strava_pending_v1';
let stravaCallback = null;
// Remove authorization codes from the address bar before any interaction.
{
  const params = new URLSearchParams(location.search);
  if (params.get('ativa_strava') === '1') {
    stravaCallback = {code:params.get('code'), state:params.get('state'), scope:params.get('scope') || '', error:params.get('error')};
    for (const key of ['ativa_strava','code','state','scope','error']) params.delete(key);
    history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
  }
}
function stravaPanel() {
  const ready = !!cloud.user;
  return `<div class="card"><div class="sectionhead"><h2 class="sectiontitle">Strava automático</h2><span class="pill">${stravaUI.connected?'Conectado':'Opcional'}</span></div>
    <p class="small subtle">Conecte sua conta para trazer corridas, inclusive as privadas, sem importar CSV. O ATIVA busca atualizações ao abrir e a cada 15 minutos enquanto estiver em uso e online.</p>
    <p class="small subtle" style="margin-top:10px">São recebidos nome, data, distância e duração. O ATIVA não publica nem altera atividades no Strava.</p>
    <div id="strava-status" class="cloud-status" role="status">${esc(stravaUI.message)}</div>
    ${stravaUI.lastSync?`<p class="small subtle">Última busca: ${esc(new Date(stravaUI.lastSync).toLocaleString('pt-BR'))}</p>`:''}
    <div class="cloud-actions"><button class="btn" data-strava="connect" ${!ready||stravaUI.busy?'disabled':''}>${stravaUI.connected?'Reconectar ao Strava':'Conectar ao Strava'}</button>
    ${stravaUI.connected?`<button class="btn ghost" data-strava="sync" ${stravaUI.busy?'disabled':''}>Buscar corridas agora</button><button class="btn ghost" data-strava="disconnect" ${stravaUI.busy?'disabled':''}>Desconectar</button>`:''}</div>
    ${!ready?'<p class="sync-hint">Primeiro configure o Supabase e entre na sua conta em “Sincronização privada”.</p>':''}
    <p class="sync-hint">A primeira configuração do servidor é necessária. <a href="https://github.com/bellaviana4-cyber/ativa-treinos/blob/main/STRAVA.md" target="_blank" rel="noopener noreferrer">Como ativar a conexão</a> · Powered by Strava</p></div>`;
}
function paintStrava() { const panel=document.getElementById('strava-integration'); if(panel)panel.innerHTML=stravaPanel(); }
async function stravaCall(action, extra={}) {
  if (!cloud.client || !cloud.user) throw Error('Entre na conta da sincronização privada primeiro.');
  const {data,error}=await cloud.client.functions.invoke('strava',{body:{action,...extra}});
  if (error) {
    let message='A integração Strava ainda não respondeu. Confira a instalação do serviço no Supabase.';
    try { const body=await error.context.json(); if(body.error)message=body.error; } catch (_) {}
    throw Error(message);
  }
  if (!data || data.error) throw Error(data?.error || 'Resposta inválida do serviço Strava.');
  return data;
}
async function syncStrava() {
  if(stravaUI.busy || !stravaUI.connected || ui.draft || document.hidden || !navigator.onLine)return;
  stravaUI.busy=true;stravaUI.message='Buscando suas corridas no Strava…';paintStrava();
  const owner=cloud.user?.id;
  try {
    const data=await stravaCall('sync');
    if(cloud.user?.id!==owner || !Array.isArray(data.activities))return;
    const merged=AtivaStravaModel.mergeActivities(state.strava,data.activities,owner);
    const changed=JSON.stringify(merged)!==JSON.stringify(state.strava);
    if(changed){state.strava=merged;if(!persist())throw Error('Não foi possível salvar as corridas. Exporte um backup para liberar espaço.');}
    stravaUI.lastSync=data.lastSync;stravaUI.message=`${data.activities.length} corridas disponíveis. Busca automática ativada.`;
    if(changed && !ui.draft)render();
  } catch(e){stravaUI.message=e.message;}
  finally{stravaUI.busy=false;stravaUI.nextCheck=Date.now()+900000;paintStrava();}
}
async function connectStrava() {
  const data=await stravaCall('start');
  const url=new URL(data.url);
  if(url.origin!=='https://www.strava.com' || url.pathname!=='/oauth/authorize')throw Error('Endereço de autorização inválido.');
  sessionStorage.setItem(STRAVA_PENDING,JSON.stringify({state:data.state,user:cloud.user.id,created:Date.now()}));
  location.assign(data.url);
}
async function finishStrava() {
  const callback=stravaCallback;stravaCallback=null;
  let pending;try{pending=JSON.parse(sessionStorage.getItem(STRAVA_PENDING)||'null');}catch(_){}
  sessionStorage.removeItem(STRAVA_PENDING);
  if(callback.error)throw Error('Autorização cancelada no Strava. Você pode tentar novamente.');
  if(!pending || pending.user!==cloud.user.id || callback.state!==pending.state || Date.now()-pending.created>600000 || !callback.code)throw Error('A autorização venceu ou foi aberta em outro navegador. Conecte novamente neste aparelho.');
  if(!callback.scope.split(',').includes('activity:read_all'))throw Error('Autorize a leitura das atividades no Strava para concluir a conexão.');
  await stravaCall('exchange',{code:callback.code,state:callback.state});
  stravaUI.connected=true;stravaUI.message='Strava conectado. Buscando corridas…';
}
async function checkStrava() {
  if(document.hidden || !navigator.onLine || typeof cloud==='undefined' || !cloud.user || stravaUI.busy || ui.draft)return;
  const owner=cloud.user.id;
  if(stravaUI.user!==owner){
    stravaUI.user=owner;stravaUI.connected=false;stravaUI.nextCheck=0;stravaUI.lastSync=null;
    const filtered=state.strava.filter(a=>!a.api || a.apiUser===owner);
    if(filtered.length!==state.strava.length){state.strava=filtered;persist();render();}
  }
  if(Date.now()<stravaUI.nextCheck)return;
  stravaUI.busy=true;
  try {
    if(stravaCallback)await finishStrava();
    const status=await stravaCall('status');
    if(cloud.user?.id!==owner)return;
    stravaUI.connected=status.connected;stravaUI.lastSync=status.lastSync;
    if(!status.connected && state.strava.some(a=>a.api)){
      state.strava=state.strava.filter(a=>!a.api);persist();render();
    }
    stravaUI.message=status.connected?'Strava conectado. Busca automática ativada.':'Toque em Conectar ao Strava para autorizar a leitura das corridas.';
  }catch(e){stravaUI.message=e.message;stravaUI.nextCheck=Date.now()+900000;}
  finally{stravaUI.busy=false;paintStrava();}
  if(stravaUI.connected)await syncStrava();else stravaUI.nextCheck=Date.now()+900000;
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-strava]');if(!button || stravaUI.busy)return;
  try{
    if(button.dataset.strava==='sync'){await syncStrava();return;}
    if(button.dataset.strava==='disconnect'){
      if(!confirm('Desconectar o Strava e remover as cópias automáticas deste aparelho e do serviço? Seus registros manuais e CSV serão preservados.'))return;
      stravaUI.busy=true;paintStrava();await stravaCall('disconnect');
      state.strava=state.strava.filter(a=>!a.api);persist();stravaUI.connected=false;stravaUI.lastSync=null;stravaUI.message='Strava desconectado.';render();
    }else{stravaUI.busy=true;paintStrava();await connectStrava();}
  }catch(e){stravaUI.message=e.message;}
  finally{stravaUI.busy=false;paintStrava();}
});
document.addEventListener('DOMContentLoaded',()=>{
  if(stravaCallback){ui.page='settings';render();stravaUI.message='Entre na mesma conta do ATIVA para concluir a autorização.';paintStrava();}
  checkStrava();
  setInterval(()=>{
    if(!cloud.user && stravaUI.user){stravaUI.user=null;stravaUI.connected=false;stravaUI.lastSync=null;stravaUI.message='Entre na sincronização privada para conectar o Strava.';paintStrava();}
    checkStrava();
  },15000);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkStrava();});
window.addEventListener('online',()=>checkStrava());
