import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { onRequest as verify } from '../functions/api/verify-invite.js';
import { onRequest as scheduling } from '../functions/api/scheduling.js';
import { configuration, signToken, SESSION_COOKIE, RETRY_COOKIE } from '../server/invitation.js';

// All accepted credentials are generated at runtime, never stored in source.
function fixture() {
  const code = randomBytes(16).toString('hex').toUpperCase();
  return { code, env: { INVITE_CODES: JSON.stringify([code]), SESSION_SECRET: randomBytes(32).toString('hex'), CALCOM_EVENT_URL: 'https://cal.com/example/conversation' } };
}
function request(method = 'GET', body, cookie, extra = {}) {
  return new Request('https://conversation.example/api/verify-invite', {
    method, headers: { Origin: 'https://conversation.example', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function getCookie(response, name) {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
}

test('normalizes codes, returns only validity, and sets secure session attributes', async () => {
  const { code, env } = fixture();
  const response = await verify({ request: request('POST', { code: `  ${code.toLowerCase()}  ` }), env });
  assert.deepEqual(await response.json(), { valid: true });
  const session = response.headers.getSetCookie().find(value => value.startsWith(SESSION_COOKIE));
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=7200']) assert.ok(session.includes(attribute));
  assert.ok(!session.includes(code));
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  const restored = await verify({ request: request('GET', undefined, getCookie(response, SESSION_COOKIE)), env });
  assert.deepEqual(await restored.json(), { valid: true });
});

test('uninvited visitors cannot retrieve the calendar URL', async () => {
  const { env } = fixture();
  const response = await scheduling({ request: request(), env });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { available: false });
});

test('only a valid session can retrieve configured scheduling', async () => {
  const { code, env } = fixture();
  const accepted = await verify({ request: request('POST', { code }), env });
  const cookie = getCookie(accepted, SESSION_COOKIE);
  const response = await scheduling({ request: request('GET', undefined, cookie), env });
  assert.deepEqual(await response.json(), { url: env.CALCOM_EVENT_URL });
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
});

test('changing approved codes immediately rejects existing sessions', async () => {
  const { code, env } = fixture();
  const accepted = await verify({ request: request('POST', { code }), env });
  const revoked = { ...env, INVITE_CODES: '[]' };
  const response = await verify({ request: request('GET', undefined, getCookie(accepted, SESSION_COOKIE)), env: revoked });
  assert.deepEqual(await response.json(), { valid: false });
});

test('expired, modified and retry cookies cannot authenticate', async () => {
  const { env } = fixture();
  const { key } = await configuration(env);
  const now = Math.floor(Date.now() / 1000);
  const expired = await signToken(key, { kind: 'session', exp: now - 1 });
  const retry = await signToken(key, { kind: 'retry', exp: now + 60 });
  const valid = await signToken(key, { kind: 'session', exp: now + 60 });
  for (const token of [expired, retry, `x${valid}`, 'malformed']) {
    const response = await verify({ request: request('GET', undefined, `${SESSION_COOKIE}=${token}`), env });
    assert.deepEqual(await response.json(), { valid: false });
  }
});

test('invalid attempts are delayed and trigger a signed cooldown after five tries', async () => {
  const { env } = fixture();
  let cookie;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const started = performance.now();
    const response = await verify({ request: request('POST', { code: randomBytes(8).toString('hex') }, cookie), env });
    assert.ok(performance.now() - started >= 950);
    assert.equal(response.status, attempt === 5 ? 429 : 200);
    assert.deepEqual(await response.json(), { valid: false });
    cookie = getCookie(response, RETRY_COOKIE);
  }
  const response = await verify({ request: request('POST', { code: 'unused' }, cookie), env });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
});

test('malformed JSON and oversized requests fail closed', async () => {
  const { env } = fixture();
  for (const body of ['{', JSON.stringify({ code: 'x'.repeat(2000) })]) {
    const req = new Request('https://conversation.example/api/verify-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const response = await verify({ request: req, env });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { valid: false });
  }
});

test('configuration errors never expose secrets', async () => {
  const { code, env } = fixture();
  for (const invalid of [{ ...env, INVITE_CODES: '{' }, { ...env, SESSION_SECRET: '' }, { ...env, INVITE_CODES: '{}' }]) {
    const response = await verify({ request: request('POST', { code }), env: invalid });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { valid: false });
  }
});

test('cross-origin requests and unsupported methods are rejected', async () => {
  const { env } = fixture();
  for (const handler of [verify, scheduling]) {
    assert.equal((await handler({ request: request('GET', undefined, undefined, { Origin: 'https://elsewhere.example' }), env })).status, 403);
    assert.equal((await handler({ request: request('DELETE'), env })).status, 405);
  }
});

test('unsafe or unfinished Cal.com configuration is never returned', async () => {
  const { code, env } = fixture();
  const accepted = await verify({ request: request('POST', { code }), env });
  const cookie = getCookie(accepted, SESSION_COOKIE);
  for (const url of ['CALCOM_EVENT_URL_HERE', 'https://elsewhere.example/event', 'http://cal.com/example/event', 'https://cal.com/example/event?email=someone', 'https://cal.com/']) {
    const response = await scheduling({ request: request('GET', undefined, cookie), env: { ...env, CALCOM_EVENT_URL: url } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { available: false });
  }
});
