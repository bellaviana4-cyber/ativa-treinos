/* A waiting worker only takes over when the user is ready to reload. */
if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'});
      let accepted = false;
      const banner = document.createElement('aside');
      banner.className = 'update-banner';
      banner.hidden = true;
      banner.setAttribute('aria-live', 'polite');
      banner.innerHTML = '<div><strong>Uma nova ATIVA chegou</strong>Salve seu treino antes de atualizar.</div><button class="btn" type="button">Atualizar</button>';
      document.body.append(banner);
      const offer = () => { if (registration.waiting) banner.hidden = false; };
      banner.querySelector('button').addEventListener('click', () => {
        if (typeof ui !== 'undefined' && ui.draft) { toast('Salve ou feche o registro antes de atualizar.'); return; }
        accepted = true;
        registration.waiting?.postMessage({type:'SKIP_WAITING'});
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (accepted) location.reload(); });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(); });
      });
      offer();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) registration.update().catch(()=>{}); });
      registration.update().catch(()=>{});
    } catch (_) { /* The app still works when offline registration is unavailable. */ }
  });
}
