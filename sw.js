const CACHE='ativa-rosa-v2';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(x=>x!==CACHE).map(x=>caches.delete(x))))])));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;if(event.request.mode==='navigate')event.respondWith(fetch(event.request).then(resp=>{if(resp.ok){let copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy))}return resp}).catch(()=>caches.match('./index.html')));else event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});
