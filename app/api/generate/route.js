import { backendConfig, backendHealth, apiError, isSameOriginRequest } from '../../../src/lib/backend.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    if (!isSameOriginRequest(request)) return apiError('This request must come from the studio.', 403, 'ORIGIN_MISMATCH');
    if (!request.headers.get('content-type')?.includes('application/json')) return apiError('Send a JSON lesson request.', 415, 'INVALID_CONTENT_TYPE');
    const config = backendConfig();
    if (!config) return apiError('The lesson service is not connected yet. You can still edit and save your canvas.', 503, 'NOT_CONFIGURED');
    const raw = await request.text();
    if (raw.length > 64000) return apiError('This lesson request is too large.', 413, 'REQUEST_TOO_LARGE');
    let body;
    try { body = JSON.parse(raw); } catch { return apiError('The request could not be read.', 400, 'INVALID_JSON'); }
    const health = await backendHealth(config, 15000);
    // This public test studio deliberately exposes only the cost-free guided demo.
    // Live generation needs an owner-access implementation in a later release.
    if (health.mode !== 'demo') return apiError('Live AI is not enabled in this testing studio. Your canvas is unchanged.', 503, 'LIVE_GENERATION_DISABLED');
    const response = await fetch(`${config.origin}/api/v1/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(35000),
    });
    const data = await response.json();
    return Response.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error.name === 'TimeoutError' ? 'The lesson service took too long. Please try again; your draft is safe.' : 'The lesson service could not respond. Please try again; your draft is safe.');
  }
}
