type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

export function getClientIp(headers: Record<string, unknown>, fallback: string) {
  const xf = headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim().length > 0) {
    return xf.split(',')[0].trim();
  }
  return fallback || '0.0.0.0';
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const existing = buckets.get(input.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { ok: true as const, remaining: input.limit - 1, resetAt: now + input.windowMs };
  }
  if (existing.count >= input.limit) {
    return { ok: false as const, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { ok: true as const, remaining: input.limit - existing.count, resetAt: existing.resetAt };
}

export function peekRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const existing = buckets.get(input.key);
  if (!existing || existing.resetAt <= now) {
    return { ok: true as const, remaining: input.limit, resetAt: now + input.windowMs };
  }
  if (existing.count >= input.limit) {
    return { ok: false as const, remaining: 0, resetAt: existing.resetAt };
  }
  return { ok: true as const, remaining: input.limit - existing.count, resetAt: existing.resetAt };
}

export function addRateLimitHit(input: { key: string; windowMs: number; now?: number }) {
  const now = input.now ?? Date.now();
  const existing = buckets.get(input.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { count: 1, resetAt: now + input.windowMs };
  }
  existing.count += 1;
  return { count: existing.count, resetAt: existing.resetAt };
}
