const encoder = new TextEncoder();
export const BROWSER_COOKIE = '__Host-vesper-browser';
export const BROWSER_SECONDS = 30 * 24 * 60 * 60;

async function fingerprint(secret, value) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Lock configuration unavailable');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readBrowserToken(request) {
  const entry = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${BROWSER_COOKIE}=`));
  const value = entry?.slice(BROWSER_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

export async function codeFingerprint(env, code) {
  return fingerprint(env.INVITE_LOCK_SECRET, `invite:v1:${code}`);
}

export async function browserFingerprint(env, codeHash, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('Browser token unavailable');
  // Scope fingerprints to each invitation. The stored record cannot identify a person.
  return fingerprint(env.INVITE_LOCK_SECRET, `browser:v1:${codeHash}:${token}`);
}

export async function claimInvitation(request, env, code) {
  if (!env.INVITE_LOCKS) throw new Error('Lock storage unavailable');
  const invite = await codeFingerprint(env, code);
  const token = readBrowserToken(request) || Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  const browser = await browserFingerprint(env, invite, token);
  const object = env.INVITE_LOCKS.get(env.INVITE_LOCKS.idFromName(invite));
  const response = await object.fetch('https://invite-lock.internal/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browser }),
  });
  if (!response.ok) throw new Error('Lock storage unavailable');
  const result = await response.json();
  if (result.allowed === false) return null;
  if (result.allowed !== true || !Number.isSafeInteger(result.expires) || result.expires <= Date.now()) {
    throw new Error('Invalid lock response');
  }
  return { invite, browser, token, expires: result.expires };
}
