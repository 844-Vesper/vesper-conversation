import {
  configuration, normalizeCode, matchesCode, signToken, readToken, cookie, json,
  isSameOrigin, hasSession, readSmallJson, SESSION_COOKIE, RETRY_COOKIE, SESSION_SECONDS,
} from '../../server/invitation.js';
import { claimInvitation, BROWSER_COOKIE, BROWSER_SECONDS } from '../../server/invite-locks.js';

const delay = () => new Promise(resolve => setTimeout(resolve, 1000));

export async function onRequest({ request, env }) {
  if (!['GET', 'POST'].includes(request.method)) return json({ valid: false }, 405, [], { Allow: 'GET, POST' });
  if (!isSameOrigin(request)) return json({ valid: false }, 403);

  try {
    const { codes, key, adminCode } = await configuration(env);
    if (request.method === 'GET') {
      const valid = await hasSession(request, key, env);
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

    // The admin code bypasses browser reservations; it never resets or transfers other codes.
    const admin = adminCode ? await matchesCode(code, [adminCode]) : false;
    const lock = !admin && await matchesCode(code, codes) ? await claimInvitation(request, env, code) : null;
    if (admin || lock) {
      const exp = admin ? now + SESSION_SECONDS : Math.min(now + SESSION_SECONDS, Math.floor(lock.expires / 1000));
      const token = await signToken(key, {
        kind: 'session', exp, nonce: crypto.randomUUID(),
        ...(admin ? { admin: true } : { invite: lock.invite, browser: lock.browser }),
      });
      return json({ valid: true }, 200, [
        cookie(SESSION_COOKIE, token, exp - now), cookie(RETRY_COOKIE, '', 0),
        ...(lock ? [cookie(BROWSER_COOKIE, lock.token, BROWSER_SECONDS)] : []),
      ]);
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
