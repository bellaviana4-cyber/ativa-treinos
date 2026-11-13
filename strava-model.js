(function (root) {
  'use strict';
  function mergeActivities(existing, remote, userId) {
    const byId = new Map();
    for (const a of remote) {
      if (!/^strava-api-\d+$/.test(a.id) || a.kind !== 'run' || !/^\d{4}-\d{2}-\d{2}$/.test(a.d)
        || !Number.isFinite(a.km) || a.km <= 0 || !Number.isFinite(a.sec) || a.sec <= 0) throw Error('Resposta de atividades inválida.');
      byId.set(a.id, {...a, api:true, apiUser:userId, source:'Strava'});
    }
    return [...byId.values(), ...existing.filter(a => !a.api)];
  }
  const api = {mergeActivities};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AtivaStravaModel = api;
})(typeof window === 'object' ? window : globalThis);
