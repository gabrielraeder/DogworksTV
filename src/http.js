// Small HTTP helpers shared by the Worker routes.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Mutations must be same-origin JSON requests (blocks cross-site form posts / CSRF).
export async function readJsonBody(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Origem não permitida');
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    throw new HttpError(415, 'Envie JSON');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

// Wraps a JSON GET handler with the Workers Cache API (no-op on workers.dev, works on custom domains).
export async function cached(request, ctx, ttlSeconds, produce) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const body = await produce();
  const res = json(body, 200, { 'Cache-Control': `public, max-age=${ttlSeconds}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
