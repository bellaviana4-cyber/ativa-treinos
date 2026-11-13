export function normalizeActivity(a) {
  if (!['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type || a.type)) return null;
  if (!Number.isSafeInteger(a.id) || a.id <= 0) return null;
  const local = String(a.start_date_local || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(local)) return null;
  if (!Number.isFinite(a.distance) || a.distance <= 0 || !Number.isFinite(a.moving_time) || a.moving_time <= 0) return null;
  // Deliberately omit GPS, maps, photos, descriptions and athlete profile fields.
  return {id: 'strava-api-' + a.id, stravaId: String(a.id), api: true,
    d: local.slice(0, 10), time: local.slice(11, 19),
    t: String(a.name || 'Corrida Strava').slice(0, 200), kind: 'run',
    km: Math.round(a.distance / 10) / 100, sec: Math.round(a.moving_time), source: 'Strava'};
}

export async function collectActivities(accessToken, request = fetch) {
  const activities = [];
  // A complete scan reconciles deletions, edits and visibility changes too.
  // Abort without replacing saved data if a very large account exceeds the cap.
  for (let page = 1; page <= 20; page++) {
    const response = await request('https://www.strava.com/api/v3/athlete/activities?per_page=200&page=' + page,
      {headers: {Authorization: 'Bearer ' + accessToken}, signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(response.status === 429 ? 'STRAVA_RATE_LIMIT' : response.status === 401 ? 'STRAVA_RECONNECT' : 'STRAVA_UNAVAILABLE');
    const list = await response.json();
    if (!Array.isArray(list)) throw new Error('STRAVA_UNAVAILABLE');
    for (const item of list) { const activity = normalizeActivity(item); if (activity) activities.push(activity); }
    if (list.length < 200) return [...new Map(activities.map(a => [a.id, a])).values()];
  }
  throw new Error('STRAVA_HISTORY_LIMIT');
}

export async function hashState(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
