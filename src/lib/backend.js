import { isIP } from 'node:net';

export function backendConfig() {
  const value = process.env.BACKEND_API_URL;
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid backend configuration');
  return { origin: url.origin, token: process.env.BACKEND_SERVICE_TOKEN || '' };
}

export function apiError(message, status = 503, code = 'BACKEND_UNAVAILABLE') {
  return Response.json({ status: 'error', error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get('origin');
  // Non-browser clients may omit Origin. Browser-originated requests must match
  // the host actually requested, not the server's wildcard listening address.
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') || requestUrl.host;
    const incomingUrl = new URL(`${requestUrl.protocol}//${host}`);
    if (incomingUrl.username || incomingUrl.password || incomingUrl.pathname !== '/' || incomingUrl.search || incomingUrl.hash) return false;
    // Do not trust arbitrary forwarded-host headers as an alternative allowlist.
    return origin === incomingUrl.origin;
  } catch {
    return false;
  }
}

export async function backendHealth(config, timeout = 12000) {
  const response = await fetch(`${config.origin}/health`, { cache: 'no-store', signal: AbortSignal.timeout(timeout), redirect: 'error' });
  if (!response.ok) throw new Error('Backend health unavailable');
  const data = await response.json();
  if (data.status !== 'ok' || !['demo', 'live'].includes(data.mode)) throw new Error('Unexpected backend health response');
  return data;
}

export function requestOrigin(request) {
  try {
    const url = new URL(request.url);
    const host = request.headers.get('host') || url.host;
    const incoming = new URL(`${url.protocol}//${host}`);
    if (incoming.username || incoming.password || incoming.pathname !== '/' || incoming.search || incoming.hash) return null;
    return incoming.origin;
  } catch { return null; }
}

// Owner sessions belong to the canonical studio. Preview deployments keep the
// public demo, even when they share the backend's service credential.
export function isCreatorOrigin(request) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return false;
  const configured = process.env.STUDIO_ORIGIN;
  if (!configured) return false;
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== configured) return false;
    return requestOrigin(request) === configured && isSameOriginRequest(request);
  } catch { return false; }
}

export class ProxyRequestError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readBoundedText(message, maxBytes, requestBody = false) {
  const tooLarge = () => new ProxyRequestError(
    requestBody ? 'This request is too large.' : 'The lesson service returned an unexpected response.',
    requestBody ? 413 : 502,
    requestBody ? 'REQUEST_TOO_LARGE' : 'INVALID_BACKEND_RESPONSE'
  );
  const length = Number(message.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw tooLarge();
  if (!message.body) return '';
  const reader = message.body.getReader();
  const signal = requestBody ? AbortSignal.any([message.signal, AbortSignal.timeout(10000)]) : null;
  const cancel = () => { reader.cancel().catch(() => {}); };
  const checkDeadline = () => {
    if (signal?.aborted) throw new ProxyRequestError('The request took too long to arrive. Please try again.', 408, 'REQUEST_TIMEOUT');
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      checkDeadline();
      const { done, value } = await reader.read();
      checkDeadline();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function readJsonRequest(request, maxBytes = 32768) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ProxyRequestError('Send a JSON request.', 415, 'INVALID_CONTENT_TYPE');
  }
  const raw = await readBoundedText(request, maxBytes, true);
  let body;
  try { body = JSON.parse(raw); } catch {
    throw new ProxyRequestError('The request could not be read.', 400, 'INVALID_JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProxyRequestError('Send a JSON object.', 400, 'INVALID_JSON');
  }
  return body;
}

export function backendHeaders(request, config, { session = false, json = false } = {}) {
  const headers = new Headers({ Authorization: `Bearer ${config.token}` });
  if (json) headers.set('Content-Type', 'application/json');
  for (const name of ['origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (session && request.headers.has('cookie')) headers.set('Cookie', request.headers.get('cookie'));
  // Vercel supplies this header. Never accept a browser's x-canvas-client-ip,
  // generic forwarded-for, or these headers on a non-Vercel server.
  if (process.env.VERCEL === '1') {
    const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
    if (ip && isIP(ip)) headers.set('x-canvas-client-ip', ip);
  }
  return headers;
}

export async function proxyBackendJson(request, config, path, { body, session = false, timeout = 35000, transform } = {}) {
  const response = await fetch(`${config.origin}${path}`, {
    method: request.method,
    headers: backendHeaders(request, config, { session, json: body !== undefined }),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]),
  });
  if (response.status >= 300 && response.status < 400) throw new ProxyRequestError('The lesson service returned an unexpected response.', 502, 'INVALID_BACKEND_RESPONSE');
  let data;
  try { data = JSON.parse(await readBoundedText(response, 256000)); } catch (error) {
    if (error instanceof ProxyRequestError) throw error;
    throw new ProxyRequestError('The lesson service returned an unexpected response.', 502, 'INVALID_BACKEND_RESPONSE');
  }
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Cookie' });
  if (response.headers.has('retry-after')) headers.set('Retry-After', response.headers.get('retry-after'));
  if (session) {
    // Commas in Expires attributes are not cookie separators.
    for (const cookie of response.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
  }
  return Response.json(response.ok && transform ? transform(data) : data, { status: response.status, headers });
}

export function proxyFailure(error, message = 'The lesson service could not respond. Please try again; your draft is safe.') {
  if (error instanceof ProxyRequestError) return apiError(error.message, error.status, error.code);
  return apiError(error?.name === 'TimeoutError' ? 'The lesson service took too long. Please try again; your draft is safe.' : message);
}
