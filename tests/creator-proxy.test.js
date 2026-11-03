import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getAuth, POST as postAuth } from '../app/api/auth/[...path]/route.js';
import { GET as getCreator } from '../app/api/creator/route.js';
import { POST as setupCreator } from '../app/api/creator/setup/route.js';
import { POST as generate } from '../app/api/generate/route.js';
import { attemptAllowance } from '../src/lib/creator.js';

function configure(t, changes = {}) {
  const values = {
    BACKEND_API_URL: 'https://backend.test', BACKEND_SERVICE_TOKEN: 'server-only-test-credential',
    STUDIO_ORIGIN: 'https://studio.test', VERCEL: '1', VERCEL_ENV: 'production', ...changes,
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });
}

function request(path, { method = 'POST', body = {}, headers = {}, raw } = {}) {
  return new Request(`https://studio.test${path}`, {
    method,
    headers: { Host: 'studio.test', Origin: 'https://studio.test', Referer: 'https://studio.test/creator',
      'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty',
      'x-vercel-forwarded-for': '203.0.113.18', ...headers },
    ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}),
  });
}

const context = endpoint => ({ params: Promise.resolve({ path: endpoint.split('/') }) });

test('sign-in forwards the trusted request context and preserves every cookie without exposing a session token', async t => {
  configure(t);
  const cookies = [
    'canvas.session_token=opaque; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 05 Nov 2026 12:00:00 GMT',
    'canvas.session_data=; Path=/; HttpOnly; Secure; Max-Age=0',
  ];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://backend.test/api/auth/sign-in/email');
    assert.equal(options.headers.get('authorization'), 'Bearer server-only-test-credential');
    assert.equal(options.headers.get('cookie'), 'canvas.session_token=old');
    assert.equal(options.headers.get('x-canvas-client-ip'), '203.0.113.18');
    assert.equal(options.headers.get('origin'), 'https://studio.test');
    assert.equal(options.headers.get('referer'), 'https://studio.test/creator');
    assert.equal(options.headers.get('sec-fetch-site'), 'same-origin');
    assert.equal(options.headers.get('sec-fetch-mode'), 'cors');
    assert.equal(options.headers.get('sec-fetch-dest'), 'empty');
    assert.equal(options.headers.get('x-forwarded-for'), null);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    const headers = new Headers();
    for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    return Response.json({ token: 'never-expose-this-session-token', user: { name: 'Milan', email: 'owner@example.test' } }, { headers });
  });
  const response = await postAuth(request('/api/auth/sign-in/email', {
    body: { email: 'owner@example.test', password: 'an-example-password' },
    headers: { Authorization: 'Bearer attacker-controlled', Cookie: 'canvas.session_token=old', 'x-canvas-client-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' },
  }), context('sign-in/email'));
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers.getSetCookie(), cookies);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('registration, reset and wrong-method auth routes are unavailable before contacting the backend', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not contact backend'); });
  for (const endpoint of ['sign-up/email', 'request-password-reset', 'admin/create-user']) {
    assert.equal((await postAuth(request(`/api/auth/${endpoint}`), context(endpoint))).status, 404);
  }
  assert.equal((await getAuth(request('/api/auth/sign-out', { method: 'GET' }), context('sign-out'))).status, 404);
  assert.equal(mock.mock.callCount(), 0);
});

test('foreign origins and previews cannot use owner routes even with the service connection configured', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not contact backend'); });
  const foreign = request('/api/auth/sign-in/email', { headers: { Origin: 'https://foreign.test' } });
  assert.equal((await postAuth(foreign, context('sign-in/email'))).status, 403);
  process.env.VERCEL_ENV = 'preview';
  assert.equal((await postAuth(request('/api/auth/sign-in/email'), context('sign-in/email'))).status, 403);
  assert.equal((await setupCreator(request('/api/creator/setup'))).status, 403);
  const status = await getCreator(request('/api/creator', { method: 'GET', headers: { Cookie: 'canvas.session_token=opaque' } }));
  assert.deepEqual(await status.json(), { status: 'ok', auth: { configured: false, signedIn: false, setupAvailable: false }, ai: { available: false } });
  assert.equal(mock.mock.callCount(), 0);
});

test('a production request to a noncanonical host cannot access creator status', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not contact backend'); });
  const result = await getCreator(request('/api/creator', { method: 'GET', headers: { Host: 'preview.test', Origin: 'https://preview.test', 'X-Forwarded-Host': 'studio.test' } }));
  assert.equal((await result.json()).auth.configured, false);
  assert.equal(mock.mock.callCount(), 0);
});

test('non-Vercel hosts never trust a supplied Vercel or Canvas IP header', async t => {
  configure(t, { VERCEL: undefined, VERCEL_ENV: undefined });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.get('x-canvas-client-ip'), null);
    return Response.json({ status: 'ok' });
  });
  assert.equal((await postAuth(request('/api/auth/sign-out', { headers: { 'x-canvas-client-ip': '1.2.3.4' } }), context('sign-out'))).status, 200);
});

test('auth limits apply to streamed UTF-8 bytes, not only characters or advertised length', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not contact backend'); });
  const response = await setupCreator(request('/api/creator/setup', { body: { token: 'test', password: 'é'.repeat(5000) } }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'REQUEST_TOO_LARGE');
  assert.equal(mock.mock.callCount(), 0);
});

test('non-JSON auth requests are rejected and native auth errors retain their status and retry information', async t => {
  configure(t);
  assert.equal((await postAuth(request('/api/auth/sign-in/email', { headers: { 'Content-Type': 'text/plain' } }), context('sign-in/email'))).status, 415);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'TOO_MANY_REQUESTS', message: 'Try again later.' }, { status: 429, headers: { 'Retry-After': '60', 'Set-Cookie': 'canvas.session_token=; Max-Age=0; Path=/' } }));
  const response = await postAuth(request('/api/auth/sign-in/email'), context('sign-in/email'));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.getSetCookie().length, 1);
  assert.equal((await response.json()).code, 'TOO_MANY_REQUESTS');
});

test('the session endpoint omits JavaScript-readable tokens while retaining the signed-in identity', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ user: { name: 'Milan', email: 'owner@example.test', id: 'private-id' }, session: { token: 'secret-session', expiresAt: '2026-12-01' } }));
  const response = await getAuth(request('/api/auth/get-session', { method: 'GET' }), context('get-session'));
  assert.deepEqual(await response.json(), { user: { name: 'Milan', email: 'owner@example.test' }, session: { expiresAt: '2026-12-01' } });
});

test('signed-out creator status never exposes owner identity or usage metadata', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'ok', auth: { configured: true, signedIn: false, setupAvailable: false, user: { name: 'Milan', email: 'private@example.test' } }, ai: { available: true, modelId: 'private-model', limits: { daily: { used: 1, limit: 3 } } } }));
  const response = await getCreator(request('/api/creator', { method: 'GET' }));
  const result = await response.json();
  assert.equal(result.auth.user, undefined);
  assert.equal(result.ai.modelId, undefined);
  assert.equal(result.ai.limits, undefined);
});

test('upstream redirects, oversized output and internal errors cannot leak redirects or service credentials', async t => {
  configure(t);
  let reply = new Response(null, { status: 302, headers: { Location: 'https://foreign.test/' } });
  t.mock.method(globalThis, 'fetch', async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  let response = await postAuth(request('/api/auth/sign-out'), context('sign-out'));
  assert.equal(response.status, 502); assert.equal(response.headers.get('location'), null);
  reply = Response.json({ padding: 'x'.repeat(260000) });
  response = await postAuth(request('/api/auth/sign-out'), context('sign-out'));
  assert.equal(response.status, 502);
  reply = new Error('server-only-test-credential should not reach a browser');
  response = await postAuth(request('/api/auth/sign-out'), context('sign-out'));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('server-only-test-credential'));
});

test('live generation forwards the owner cookie without a health-mode gate and retains backend authorization failures', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://backend.test/api/v1/generations');
    assert.equal(options.headers.get('cookie'), 'canvas.session_token=expired');
    assert.equal(JSON.parse(options.body).generationMode, 'live');
    return Response.json({ status: 'error', error: { code: 'OWNER_REQUIRED', message: 'Sign in to use live AI.' } }, { status: 401 });
  });
  const response = await generate(request('/api/generate', { body: { generationMode: 'live', prompt: 'Explain three training zones' }, headers: { Cookie: 'canvas.session_token=expired' } }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'OWNER_REQUIRED');
  assert.equal(mock.mock.callCount(), 1);
});

test('preview generation defaults to demo and drops cookies; explicit live calls are rejected before reaching the backend', async t => {
  configure(t, { VERCEL_ENV: 'preview' });
  const mock = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.get('cookie'), null);
    assert.equal(JSON.parse(options.body).generationMode, 'demo');
    return Response.json({ status: 'ok', mode: 'demo' });
  });
  assert.equal((await generate(request('/api/generate', { headers: { Cookie: 'canvas.session_token=opaque' } }))).status, 200);
  assert.equal((await generate(request('/api/generate', { body: { generationMode: 'live' } }))).status, 403);
  assert.equal((await generate(request('/api/generate', { body: { generationMode: 'automatic' } }))).status, 400);
  assert.equal(mock.mock.callCount(), 1);
});

test('allowances include failed attempts, cannot go negative, and stop at either period limit', () => {
  const result = attemptAllowance({ daily: { used: 2, limit: 3 }, monthly: { used: 9, limit: 10 } });
  assert.equal(result.exhausted, false);
  assert.equal(result.description, '1 of 3 attempts left today · 1 of 10 attempts left this month');
  assert.equal(attemptAllowance({ daily: { used: 4, limit: 3 } }).description, '0 of 3 attempts left today');
  assert.equal(attemptAllowance({ monthly: { used: 10, limit: 10 } }).exhausted, true);
  assert.deepEqual(attemptAllowance(undefined), { exhausted: false, description: '' });
});
