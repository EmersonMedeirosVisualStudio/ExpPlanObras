const buckets = new Map();
export function getClientIp(headers, fallback) {
    const xf = headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim().length > 0) {
        return xf.split(',')[0].trim();
    }
    return fallback || '0.0.0.0';
}
export function checkRateLimit(input) {
    const now = input.now ?? Date.now();
    const existing = buckets.get(input.key);
    if (!existing || existing.resetAt <= now) {
        buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
        return { ok: true, remaining: input.limit - 1, resetAt: now + input.windowMs };
    }
    if (existing.count >= input.limit) {
        return { ok: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count += 1;
    return { ok: true, remaining: input.limit - existing.count, resetAt: existing.resetAt };
}
export function peekRateLimit(input) {
    const now = input.now ?? Date.now();
    const existing = buckets.get(input.key);
    if (!existing || existing.resetAt <= now) {
        return { ok: true, remaining: input.limit, resetAt: now + input.windowMs };
    }
    if (existing.count >= input.limit) {
        return { ok: false, remaining: 0, resetAt: existing.resetAt };
    }
    return { ok: true, remaining: input.limit - existing.count, resetAt: existing.resetAt };
}
export function addRateLimitHit(input) {
    const now = input.now ?? Date.now();
    const existing = buckets.get(input.key);
    if (!existing || existing.resetAt <= now) {
        buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
        return { count: 1, resetAt: now + input.windowMs };
    }
    existing.count += 1;
    return { count: existing.count, resetAt: existing.resetAt };
}
