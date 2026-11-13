'use strict';
const hevyUI={connected:false,busy:false,message:'Entre na sincronização privada para conectar o Hevy.',lastSync:null,user:null,nextCheck:0};
function hevyPanel(){
  const ready=!!cloud.user;
  return `<div class="card"><div class="sectionhead"><h2 class="sectiontitle">Hevy automático</h2><span class="pill">${hevyUI.connected?'Conectado':'Hevy Pro'}</span></div>
    <p class="small subtle">Traga seus treinos, exercícios, cargas, repetições e aquecimentos. A busca acontece ao abrir e a cada 15 minutos com o ATIVA aberto, visível e online.</p>
    <div class="cloud-status" role="status">${esc(hevyUI.message)}</div>
    ${hevyUI.lastSync?`<p class="small subtle">Última busca: ${esc(new Date(hevyUI.lastSync).toLocaleString('pt-BR'))}</p>`:''}
    <div class="field" style="margin-top:12px"><label for="hevy-api-key">Chave de API do Hevy Pro</label><input class="input" id="hevy-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Cole a chave apenas para conectar ou atualizar" ${!ready||hevyUI.busy?'disabled':''}></div>
    <div class="cloud-actions"><button class="btn" data-hevy="connect" ${!ready||hevyUI.busy?'disabled':''}>${hevyUI.connected?'Atualizar chave Hevy':'Conectar ao Hevy'}</button>
    ${hevyUI.connected?`<button class="btn ghost" data-hevy="sync" ${hevyUI.busy?'disabled':''}>Buscar treinos agora</button><button class="btn ghost" data-hevy="disconnect" ${hevyUI.busy?'disabled':''}>Desconectar Hevy</button>`:''}</div>
    <p class="sync-hint">${!ready?'Primeiro entre na sua conta em “Sincronização privada”. ':''}A chave fica no servidor privado; não entra no backup ou no armazenamento deste navegador. A integração só lê o Hevy, sem modificar seus treinos.</p></div>`;
}
function paintHevy(){const panel=document.getElementById('hevy-integration');if(panel)panel.innerHTML=hevyPanel();}
async function hevyCall(action,extra={}){
  if(!cloud.client||!cloud.user)throw Error('Entre na conta ATIVA primeiro.');
  const {data,error}=await cloud.client.functions.invoke('hevy',{body:{action,...extra}});
  if(error){let message='O serviço Hevy não respondeu. Confira a instalação no Supabase.';try{const body=await error.context.json();if(body.error)message=body.error;}catch(_){}throw Error(message);}
  if(!data||data.error)throw Error(data?.error||'Resposta inválida do serviço Hevy.');return data;
}
async function syncHevy(){
  if(hevyUI.busy||!hevyUI.connected||ui.draft||document.hidden||!navigator.onLine)return;
  hevyUI.busy=true;hevyUI.message='Buscando seus treinos no Hevy…';paintHevy();
  const owner=cloud.user?.id;
  try{
    const data=await hevyCall('sync');if(cloud.user?.id!==owner)return;
    if(!Array.isArray(data.activities)||data.activities.some(a=>typeof a.id!=='string'||!a.id.startsWith('hevy-api-')||!['strength','run','walk'].includes(a.kind)))throw Error('Resposta de treinos inválida.');
    const activities=data.activities.map(a=>({...a,apiUser:owner}));
    const changed=JSON.stringify(state.hevyApi||[])!==JSON.stringify(activities);
    if(changed){state.hevyApi=activities;if(!persist())throw Error('Não foi possível salvar os treinos. Exporte um backup para liberar espaço.');}
    hevyUI.lastSync=data.lastSync;hevyUI.message=`${new Set(activities.map(a=>a.hevyId)).size} treinos do Hevy disponíveis. Busca automática ativada.`;
    if(changed&&!ui.draft)render();
  }catch(e){hevyUI.message=e.message;}
  finally{hevyUI.busy=false;hevyUI.nextCheck=Date.now()+900000;paintHevy();}
}
async function checkHevy(){
  if(document.hidden||!navigator.onLine||!cloud.user||hevyUI.busy||ui.draft)return;
  const owner=cloud.user.id;
  if(hevyUI.user!==owner){
    hevyUI.user=owner;hevyUI.connected=false;hevyUI.lastSync=null;hevyUI.nextCheck=0;
    const filtered=(state.hevyApi||[]).filter(a=>a.apiUser===owner);
    if(filtered.length!==(state.hevyApi||[]).length){state.hevyApi=filtered;persist();render();}
  }
  if(Date.now()<hevyUI.nextCheck)return;
  hevyUI.busy=true;
  try{
    const status=await hevyCall('status');if(cloud.user?.id!==owner)return;
    hevyUI.connected=status.connected;hevyUI.lastSync=status.lastSync;
    hevyUI.message=status.connected?'Hevy conectado. Busca automática ativada.':'Cole a chave do Hevy Pro e toque em Conectar ao Hevy.';
    if(!status.connected&&state.hevyApi?.length){state.hevyApi=[];persist();render();}
  }catch(e){hevyUI.message=e.message;hevyUI.nextCheck=Date.now()+900000;}
  finally{hevyUI.busy=false;paintHevy();}
  if(hevyUI.connected)await syncHevy();else hevyUI.nextCheck=Date.now()+900000;
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-hevy]');if(!button||hevyUI.busy)return;
  const owner=cloud.user?.id;
  try{
    if(button.dataset.hevy==='sync'){await syncHevy();return;}
    if(button.dataset.hevy==='disconnect'){
      if(!confirm('Desconectar o Hevy e remover a chave e as cópias automáticas? Seus registros manuais e CSV serão preservados.'))return;
      hevyUI.busy=true;paintHevy();await hevyCall('disconnect');
      if(cloud.user?.id!==owner)return;
      state.hevyApi=[];persist();hevyUI.connected=false;hevyUI.lastSync=null;hevyUI.message='Hevy desconectado. A chave não está mais salva no serviço.';render();
    }else{
      const input=document.getElementById('hevy-api-key');let key=input?.value.trim()||'';
      if(!key)throw Error('Cole a chave de API do Hevy Pro.');if(input)input.value='';
      hevyUI.busy=true;hevyUI.message='Validando sua conexão Hevy…';paintHevy();
      try{await hevyCall('connect',{apiKey:key});}finally{key='';}
      if(cloud.user?.id!==owner)return;
      hevyUI.connected=true;hevyUI.busy=false;hevyUI.message='Hevy conectado.';await syncHevy();
    }
  }catch(e){hevyUI.message=e.message;}
  finally{hevyUI.busy=false;paintHevy();}
});
document.addEventListener('DOMContentLoaded',()=>{
  checkHevy();
  setInterval(()=>{
    if(!cloud.user&&hevyUI.user){hevyUI.user=null;hevyUI.connected=false;hevyUI.lastSync=null;hevyUI.message='Entre na sincronização privada para conectar o Hevy.';paintHevy();}
    checkHevy();
  },17000);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkHevy();});
window.addEventListener('online',()=>checkHevy());
