import { configuration, hasSession, isSameOrigin, json } from '../../server/invitation.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ available: false }, 405, [], { Allow: 'GET' });
  if (!isSameOrigin(request)) return json({ available: false }, 403);
  try {
    const { key } = await configuration(env);
    if (!await hasSession(request, key, env)) return json({ available: false }, 401);
    const url = new URL(env.CALCOM_EVENT_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'cal.com' || url.port ||
        url.username || url.password || url.search || url.hash || url.pathname.split('/').filter(Boolean).length < 2) {
      return json({ available: false }, 503);
    }
    return json({ url: url.href });
  } catch {
    return json({ available: false }, 503);
  }
}
