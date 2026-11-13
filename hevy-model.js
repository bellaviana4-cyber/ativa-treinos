(function(root){
  'use strict';
  function mergeHistory(csv,api){
    const ids=new Set(),signatures=new Set(),out=[];
    for(const item of [...api,...csv]){
      const signature=[item.d,String(item.time||'').slice(0,5),item.t,item.kind].join('|');
      if(ids.has(item.id)||signatures.has(signature))continue;
      ids.add(item.id);signatures.add(signature);out.push(item);
    }
    return out.sort((a,b)=>(b.d+String(b.time||'')).localeCompare(a.d+String(a.time||'')));
  }
  const api={mergeHistory};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AtivaHevyModel=api;
})(typeof window==='object'?window:globalThis);
