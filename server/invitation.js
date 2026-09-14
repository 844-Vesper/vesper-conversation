// No request logging, IP collection or booking data. Locks use random browser credentials.
import { browserFingerprint, readBrowserToken } from './invite-locks.js';
const encoder = new TextEncoder();
export const SESSION_COOKIE = '__Host-vesper-session';
export const RETRY_COOKIE = '__Host-vesper-retry';
export const SESSION_SECONDS = 2 * 60 * 60;

export function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export async function configuration(env) {
  const values = JSON.parse(env.INVITE_CODES || 'null');
  if (!Array.isArray(values) || values.length > 10000 ||
      values.some(value => typeof value !== 'string' || !normalizeCode(value) || value.length > 128) ||
      typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32) {
    throw new Error('Invitation configuration unavailable');
  }
  const codes = [...new Set(values.map(normalizeCode))].sort();
  const adminCode = normalizeCode(env.ADMIN_INVITE_CODE);
  if (adminCode && (adminCode.length < 16 || adminCode.length > 128 || codes.includes(adminCode))) {
    throw new Error('Admin configuration unavailable');
  }
  // Changing the list also invalidates existing sessions, including for revoked invites.
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(['browser-lock-v1', env.SESSION_SECRET, codes, adminCode])));
  const key = await crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return { codes, key, adminCode };
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

export async function signToken(key, payload) {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

export async function readToken(request, name, key, kind) {
  try {
    const entry = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
    const token = entry?.slice(name.length + 1);
    if (!token || token.length > 1024) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    if (!await crypto.subtle.verify('HMAC', key, decode(parts[1]), encoder.encode(parts[0]))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    if (payload.kind !== kind || !Number.isInteger(payload.exp) || payload.exp <= now || payload.exp > now + SESSION_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookie(name, value, seconds) {
  return `${name}=${value}; Max-Age=${seconds}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function json(data, status = 200, cookies = [], extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders,
  });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(data), { status, headers });
}

export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  return (!origin || origin === new URL(request.url).origin) && (!site || site === 'same-origin' || site === 'none');
}

export async function hasSession(request, key, env) {
  const session = await readToken(request, SESSION_COOKIE, key, 'session');
  if (!session) return false;
  if (session.admin === true) return true;
  if (!/^[a-f0-9]{64}$/.test(session.invite || '') || !/^[a-f0-9]{64}$/.test(session.browser || '')) return false;
  try { return session.browser === await browserFingerprint(env, session.invite, readBrowserToken(request)); }
  catch { return false; }
}

// Fixed-length digest comparisons avoid exposing an early string-match position.
export async function matchesCode(code, codes) {
  const candidate = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(code)));
  let matched = 0;
  for (const approved of codes) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(approved)));
    let difference = 0;
    for (let i = 0; i < digest.length; i++) difference |= digest[i] ^ candidate[i];
    matched |= Number(difference === 0);
  }
  return matched === 1;
}

export async function readSmallJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('Invalid content type');
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 1024) {
      await reader.cancel();
      throw new Error('Body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
