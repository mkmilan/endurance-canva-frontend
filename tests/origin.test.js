import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../src/lib/backend.js';
import { POST } from '../app/api/generate/route.js';

function request(origin, host = '127.0.0.1:3000', url = 'http://0.0.0.0:3000/api/generate', extraHeaders = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { Host: host, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...extraHeaders },
    body: JSON.stringify({ requestId: 'origin-test', mode: 'create', prompt: 'Explain three training zones' }),
  });
}

test('a local browser Host is accepted when Next uses a wildcard bind address', () => {
  assert.equal(isSameOriginRequest(request('http://127.0.0.1:3000')), true);
  assert.equal(isSameOriginRequest(request('http://localhost:3000', 'localhost:3000')), true);
});

test('HTTPS deployments match the incoming host while preserving scheme and port checks', () => {
  assert.equal(isSameOriginRequest(request('https://studio.example', 'studio.example', 'https://internal.example/api/generate')), true);
  assert.equal(isSameOriginRequest(request('https://127.0.0.1:3000')), false);
  assert.equal(isSameOriginRequest(request('http://127.0.0.1:3001')), false);
});

test('foreign, opaque, and malformed origins cannot bypass the Host comparison', () => {
  assert.equal(isSameOriginRequest(request('https://foreign.example')), false);
  assert.equal(isSameOriginRequest(request('null')), false);
  assert.equal(isSameOriginRequest(request('http://127.0.0.1:3000/extra')), false);
  assert.equal(isSameOriginRequest(request('https://foreign.example', '127.0.0.1:3000', undefined, { 'X-Forwarded-Host': 'foreign.example' })), false);
  assert.equal(isSameOriginRequest(request('http://127.0.0.1:3000', '127.0.0.1:3000/extra')), false);
});

test('non-browser clients without Origin retain the existing API behavior', () => {
  assert.equal(isSameOriginRequest(request()), true);
});

test('the generation route forwards a valid local-origin request to the demo backend', async (t) => {
  const previousUrl = process.env.BACKEND_API_URL;
  process.env.BACKEND_API_URL = 'http://backend.test';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.BACKEND_API_URL;
    else process.env.BACKEND_API_URL = previousUrl;
  });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === 'http://backend.test/health') return Response.json({ status: 'ok', mode: 'demo' });
    assert.equal(url, 'http://backend.test/api/v1/generations');
    return Response.json({ status: 'ok', mode: 'demo', requestId: 'origin-test' });
  });
  const response = await POST(request('http://127.0.0.1:3000'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).requestId, 'origin-test');
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('the generation route rejects a foreign origin before making backend requests', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not call backend'); });
  const response = await POST(request('https://foreign.example'));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'ORIGIN_MISMATCH');
  assert.equal(fetchMock.mock.callCount(), 0);
});
