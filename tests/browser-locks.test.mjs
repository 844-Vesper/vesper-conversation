import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { onRequest as verify } from '../functions/api/verify-invite.js';
import { onRequest as scheduling } from '../functions/api/scheduling.js';
import { claimInvitation, BROWSER_COOKIE } from '../server/invite-locks.js';
import { SESSION_COOKIE } from '../server/invitation.js';
const LOCK_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
import { lockNamespace } from './helpers/lock-namespace.mjs';

function fixture() {
  const code = randomBytes(12).toString('hex').toUpperCase();
  const env = {
    INVITE_CODES: JSON.stringify([code]), SESSION_SECRET: randomBytes(32).toString('hex'),
    INVITE_LOCK_SECRET: randomBytes(32).toString('hex'), ADMIN_INVITE_CODE: randomBytes(16).toString('hex'),
    INVITE_LOCKS: lockNamespace(), CALCOM_EVENT_URL: 'https://cal.com/example/conversation',
  };
  return { code, env };
}
function request(browser, code, cookie) {
  return new Request('https://conversation.example/api/verify-invite', {
    method: code === undefined ? 'GET' : 'POST',
    headers: { Origin: 'https://conversation.example', 'Content-Type': 'application/json',
      Cookie: [browser ? `${BROWSER_COOKIE}=${browser}` : '', cookie || ''].filter(Boolean).join('; ') },
    ...(code === undefined ? {} : { body: JSON.stringify({ code }) }),
  });
}
const browserA = randomBytes(32).toString('hex');
const browserB = randomBytes(32).toString('hex');
const browserC = randomBytes(32).toString('hex');
const cookieFrom = response => response.headers.getSetCookie().find(value => value.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0];

test('first browser reserves a code for exactly 30 days; same-browser reuse does not extend the expiry', async t => {
  const { code, env } = fixture();
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  const first = await claimInvitation(request(browserA), env, code);
  assert.equal(first.expires, now + LOCK_DURATION_MS);
  now += 10 * 86400000;
  assert.deepEqual(await claimInvitation(request(browserA), env, code), first);
  assert.equal(await claimInvitation(request(browserB), env, code), null);
  now = first.expires;
  const replacement = await claimInvitation(request(browserB), env, code);
  assert.equal(replacement.expires, now + LOCK_DURATION_MS);
  assert.equal(await claimInvitation(request(browserA), env, code), null);
});

test('simultaneous first claims from different browsers cannot both succeed', async () => {
  const { code, env } = fixture();
  const results = await Promise.all([browserA, browserB].map(browser => claimInvitation(request(browser), env, code)));
  assert.equal(results.filter(Boolean).length, 1);
});

test('the public verification response does not distinguish a locked code', async () => {
  const { code, env } = fixture();
  assert.deepEqual(await (await verify({ request: request(browserA, code), env })).json(), { valid: true });
  const denied = await verify({ request: request(browserB, code.toLowerCase()), env });
  assert.deepEqual(await denied.json(), { valid: false });
  assert.equal(cookieFrom(denied), undefined);
  assert.deepEqual(await (await verify({ request: request(browserA, ` ${code} `), env })).json(), { valid: true });
});

test('a copied session cannot restore access or retrieve scheduling from a different browser', async () => {
  const { code, env } = fixture();
  const accepted = await verify({ request: request(browserA, code), env });
  const cookie = cookieFrom(accepted);
  assert.deepEqual(await (await verify({ request: request(browserB, undefined, cookie), env })).json(), { valid: false });
  assert.equal((await scheduling({ request: request(browserB, undefined, cookie), env })).status, 401);
  assert.equal((await scheduling({ request: request(browserA, undefined, cookie), env })).status, 200);
});

test('admin bypass works across browsers, does not claim or overwrite reservations, and rotates cleanly', async () => {
  const { code, env } = fixture();
  const ordinary = await claimInvitation(request(browserA), env, code);
  const before = env.INVITE_LOCKS.objects.size;
  const accepted = await verify({ request: request(browserB, env.ADMIN_INVITE_CODE), env });
  assert.deepEqual(await accepted.json(), { valid: true });
  const cookie = cookieFrom(accepted);
  assert.equal((await scheduling({ request: request(browserC, undefined, cookie), env })).status, 200);
  assert.equal(env.INVITE_LOCKS.objects.size, before);
  assert.deepEqual(await claimInvitation(request(browserA), env, code), ordinary);
  assert.equal(await claimInvitation(request(browserB), env, code), null);
  const rotated = { ...env, ADMIN_INVITE_CODE: randomBytes(16).toString('hex') };
  assert.equal((await scheduling({ request: request(browserB, undefined, cookie), env: rotated })).status, 401);
});

test('code-list and session-secret changes do not erase reservations', async () => {
  const { code, env } = fixture();
  await claimInvitation(request(browserA), env, code);
  const changed = { ...env, INVITE_CODES: JSON.stringify([code, randomBytes(12).toString('hex')]), SESSION_SECRET: randomBytes(32).toString('hex') };
  assert.equal(await claimInvitation(request(browserB), changed, code), null);
});

test('session expiry never exceeds the remaining reservation time', async t => {
  const { code, env } = fixture();
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  await claimInvitation(request(browserA), env, code);
  now += LOCK_DURATION_MS - 60000;
  const accepted = await verify({ request: request(browserA, code), env });
  const cookie = cookieFrom(accepted);
  assert.match(accepted.headers.getSetCookie().find(value => value.startsWith(SESSION_COOKIE)), /Max-Age=60;/);
  now += 60000;
  assert.deepEqual(await (await verify({ request: request(browserA, undefined, cookie), env })).json(), { valid: false });
});

test('storage holds only a keyed fingerprint and expiry; alarm cleans expired records safely', async t => {
  const { code, env } = fixture();
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  const claim = await claimInvitation(request(browserA), env, code);
  const [name, object] = [...env.INVITE_LOCKS.objects][0];
  assert.match(name, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(object.entries.get('lock')).sort(), ['browser', 'expires']);
  assert.equal(object.storage.alarm, claim.expires);
  const stored = JSON.stringify([...object.entries]);
  assert.ok(!stored.includes(code) && !stored.includes(browserA));
  await object.handler.alarm();
  assert.equal(object.entries.size, 1);
  now = claim.expires;
  await object.handler.alarm();
  assert.equal(object.entries.size, 0);
  assert.equal(object.storage.alarm, null);
});

test('missing secret, missing binding and storage failures all fail closed', async () => {
  const { code, env } = fixture();
  const broken = { idFromName() { throw new Error('Unavailable'); } };
  for (const [browser, config] of [[browserA, { ...env, INVITE_LOCK_SECRET: '' }], [browserA, { ...env, INVITE_LOCKS: undefined }], [browserA, { ...env, INVITE_LOCKS: broken }]]) {
    const response = await verify({ request: request(browser, code), env: config });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { valid: false });
  }
});

test('network changes do not invalidate the browser, and copied session alone is insufficient', async () => {
  const { code, env } = fixture();
  const first = request(browserA, code);
  first.headers.set('CF-Connecting-IP', '192.0.2.1');
  const accepted = await verify({ request: first, env });
  const session = cookieFrom(accepted);
  const moved = request(browserA, undefined, session);
  moved.headers.set('CF-Connecting-IP', '192.0.2.2');
  assert.equal((await scheduling({ request: moved, env })).status, 200);
  assert.equal((await scheduling({ request: request(undefined, undefined, session), env })).status, 401);
});

test('first use issues a secure random browser cookie, and clearing it cannot unlock a reserved code', async () => {
  const { code, env } = fixture();
  const accepted = await verify({ request: request(undefined, code), env });
  const browserCookie = accepted.headers.getSetCookie().find(value => value.startsWith(`${BROWSER_COOKIE}=`));
  assert.match(browserCookie, /^__Host-vesper-browser=[a-f0-9]{64};/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=2592000']) assert.ok(browserCookie.includes(flag));
  const denied = await verify({ request: request(undefined, code), env });
  assert.deepEqual(await denied.json(), { valid: false });
  assert.equal(cookieFrom(denied), undefined);
  const token = browserCookie.split(';')[0].split('=')[1];
  const returning = await verify({ request: request(token, code), env });
  assert.deepEqual(await returning.json(), { valid: true });
});

test('an ordinary code cannot also be configured as the admin code', async () => {
  const { code, env } = fixture();
  const response = await verify({ request: request(browserA, code), env: { ...env, ADMIN_INVITE_CODE: code } });
  assert.equal(response.status, 503);
});
