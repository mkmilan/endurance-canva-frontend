import { backendConfig, apiError, isCreatorOrigin, proxyBackendJson, proxyFailure } from '../../../src/lib/backend.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  if (!isCreatorOrigin(request)) return Response.json({
    status: 'ok', auth: { configured: false, signedIn: false, setupAvailable: false }, ai: { available: false },
  }, { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
  try {
    const config = backendConfig();
    if (!config) return apiError('Creator access is not connected yet. The guided demo is still available.', 503, 'NOT_CONFIGURED');
    return await proxyBackendJson(request, config, '/api/v1/creator', {
      session: true, timeout: 50000,
      transform: data => ({
        status: data.status,
        auth: {
          configured: Boolean(data.auth?.configured), signedIn: Boolean(data.auth?.signedIn), setupAvailable: Boolean(data.auth?.setupAvailable),
          ...(data.auth?.signedIn && data.auth?.user ? { user: { name: data.auth.user.name, email: data.auth.user.email } } : {}),
        },
        ai: {
          available: Boolean(data.ai?.available),
          ...(data.auth?.signedIn && data.ai?.modelId ? { modelId: data.ai.modelId } : {}),
          ...(data.auth?.signedIn && data.ai?.limits ? { limits: data.ai.limits } : {}),
        },
      }),
    });
  } catch (error) { return proxyFailure(error, 'Creator access is waking up or unavailable. The guided demo is still available.'); }
}
