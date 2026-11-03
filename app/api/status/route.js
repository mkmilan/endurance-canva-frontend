import { backendConfig, backendHealth, apiError } from '../../../src/lib/backend.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const config = backendConfig();
    if (!config) return apiError('The lesson service is not connected yet. You can still explore and edit the canvas.', 503, 'NOT_CONFIGURED');
    const health = await backendHealth(config, 50000);
    return Response.json({ status: 'ok', mode: health.mode, version: health.version, liveGenerationAvailable: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return apiError('The lesson service is waking up or unavailable. Your canvas and saved lessons are still here.');
  }
}
