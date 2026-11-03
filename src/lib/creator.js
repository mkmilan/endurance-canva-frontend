export const signedOutCreator = { auth: { configured: false, signedIn: false, setupAvailable: false }, ai: { available: false } };

export async function creatorRequest(path = '/api/creator', { body, signal } = {}) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Creator access could not respond. Please try again.'); }
  if (!response.ok) {
    const error = new Error(data.error?.message || data.message || 'This account action could not be completed.');
    error.status = response.status;
    error.code = data.error?.code || data.code;
    throw error;
  }
  return data;
}

export function attemptAllowance(limits) {
  const periods = ['daily', 'monthly'].map(key => {
    const value = limits?.[key];
    if (!value || !Number.isInteger(value.used) || !Number.isInteger(value.limit) || value.limit < 0 || value.used < 0) return null;
    return { ...value, key, remaining: Math.max(0, value.limit - value.used) };
  }).filter(Boolean);
  return {
    exhausted: periods.some(period => period.remaining === 0),
    description: periods.map(period => `${period.remaining} of ${period.limit} attempts left ${period.key === 'daily' ? 'today' : 'this month'}`).join(' · '),
  };
}
