import { backendConfig, apiError, isSameOriginRequest, isCreatorOrigin, readJsonRequest, proxyBackendJson, proxyFailure } from '../../../src/lib/backend.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    if (!isSameOriginRequest(request)) return apiError('This request must come from the studio.', 403, 'ORIGIN_MISMATCH');
    const body = await readJsonRequest(request);
    const generationMode = body.generationMode ?? 'demo';
    if (!['demo', 'live'].includes(generationMode)) return apiError('Choose guided demo or live AI.', 400, 'INVALID_GENERATION_MODE');
    const session = isCreatorOrigin(request);
    if (generationMode === 'live' && !session) return apiError('Live AI is available through creator access on the main studio.', 403, 'CREATOR_ORIGIN_REQUIRED');
    const config = backendConfig();
    if (!config) return apiError('The lesson service is not connected yet. You can still edit and save your canvas.', 503, 'NOT_CONFIGURED');
    return await proxyBackendJson(request, config, '/api/v1/generations', { body: { ...body, generationMode }, session });
  } catch (error) { return proxyFailure(error); }
}
