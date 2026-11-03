import { backendConfig, apiError, isCreatorOrigin, readJsonRequest, proxyBackendJson, proxyFailure } from '../../../../src/lib/backend.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const allowed = { GET: new Set(['get-session']), POST: new Set(['sign-in/email', 'sign-out', 'change-password']) };

async function handle(request, context) {
  const { path = [] } = await context.params;
  const endpoint = path.join('/');
  if (!allowed[request.method]?.has(endpoint)) return apiError('This account action is not available.', 404, 'AUTH_ROUTE_NOT_FOUND');
  if (!isCreatorOrigin(request)) return apiError('Creator access is available on the main studio.', 403, 'CREATOR_ORIGIN_REQUIRED');
  try {
    const config = backendConfig();
    if (!config) return apiError('Creator access is not connected yet. The guided demo is still available.', 503, 'NOT_CONFIGURED');
    const body = request.method === 'POST' ? await readJsonRequest(request, 8192) : undefined;
    return await proxyBackendJson(request, config, `/api/auth/${endpoint}`, {
      body, session: true,
      // The browser uses HttpOnly cookies, not a JavaScript-readable session token.
      transform: data => endpoint === 'get-session'
        ? (data?.user ? { user: { name: data.user.name, email: data.user.email }, session: { expiresAt: data.session?.expiresAt } } : null)
        : { status: 'ok' },
    });
  } catch (error) { return proxyFailure(error, 'Creator access could not respond. Please try again.'); }
}

export const GET = handle;
export const POST = handle;
