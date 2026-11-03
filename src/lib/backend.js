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

export async function backendHealth(config, timeout = 12000) {
  const response = await fetch(`${config.origin}/health`, { cache: 'no-store', signal: AbortSignal.timeout(timeout), redirect: 'error' });
  if (!response.ok) throw new Error('Backend health unavailable');
  const data = await response.json();
  if (data.status !== 'ok' || !['demo', 'live'].includes(data.mode)) throw new Error('Unexpected backend health response');
  return data;
}
