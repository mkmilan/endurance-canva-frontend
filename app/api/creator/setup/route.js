import { backendConfig, apiError, isCreatorOrigin, readJsonRequest, proxyBackendJson, proxyFailure } from '../../../../src/lib/backend.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  if (!isCreatorOrigin(request)) return apiError('Creator setup is available on the main studio.', 403, 'CREATOR_ORIGIN_REQUIRED');
  try {
    const config = backendConfig();
    if (!config) return apiError('Creator access is not connected yet. The guided demo is still available.', 503, 'NOT_CONFIGURED');
    const body = await readJsonRequest(request, 8192);
    return await proxyBackendJson(request, config, '/api/v1/creator/setup', { body, session: true });
  } catch (error) { return proxyFailure(error, 'Creator setup could not respond. Please try again.'); }
}
