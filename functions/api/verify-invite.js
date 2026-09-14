import {
  configuration, normalizeCode, matchesCode, signToken, readToken, cookie, json,
  isSameOrigin, hasSession, readSmallJson, SESSION_COOKIE, RETRY_COOKIE, SESSION_SECONDS,
} from '../../server/invitation.js';

const delay = () => new Promise(resolve => setTimeout(resolve, 1000));

export async function onRequest({ request, env }) {
  if (!['GET', 'POST'].includes(request.method)) return json({ valid: false }, 405, [], { Allow: 'GET, POST' });
  if (!isSameOrigin(request)) return json({ valid: false }, 403);

  try {
    const { codes, key } = await configuration(env);
    if (request.method === 'GET') {
      const valid = await hasSession(request, key);
      return json({ valid }, 200, valid ? [] : [cookie(SESSION_COOKIE, '', 0)]);
    }

    const now = Math.floor(Date.now() / 1000);
    const retry = await readToken(request, RETRY_COOKIE, key, 'retry');
    if (retry?.until > now) {
      return json({ valid: false }, 429, [], { 'Retry-After': String(retry.until - now) });
    }

    let code;
    try {
      const body = await readSmallJson(request);
      code = normalizeCode(body?.code);
      if (!code || code.length > 128) throw new Error('Invalid code');
    } catch {
      await delay();
      return json({ valid: false }, 400);
    }

    if (await matchesCode(code, codes)) {
      const token = await signToken(key, { kind: 'session', exp: now + SESSION_SECONDS, nonce: crypto.randomUUID() });
      return json({ valid: true }, 200, [cookie(SESSION_COOKIE, token, SESSION_SECONDS), cookie(RETRY_COOKIE, '', 0)]);
    }

    await delay();
    const attempts = (retry?.attempts || 0) + 1;
    const coolingDown = attempts >= 5;
    const retryToken = await signToken(key, {
      kind: 'retry', attempts: coolingDown ? 0 : attempts,
      until: coolingDown ? now + 60 : 0, exp: now + 600,
    });
    return json({ valid: false }, coolingDown ? 429 : 200, [cookie(RETRY_COOKIE, retryToken, 600)],
      coolingDown ? { 'Retry-After': '60' } : {});
  } catch {
    // Deliberately exclude configuration, codes and request contents from responses/logs.
    return json({ valid: false }, 503);
  }
}
