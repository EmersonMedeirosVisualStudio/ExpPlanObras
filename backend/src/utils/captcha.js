export async function verifyHCaptcha(input) {
    const secret = process.env.HCAPTCHA_SECRET;
    if (!secret)
        return { ok: true, skipped: true };
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', input.token);
    if (input.ip)
        body.set('remoteip', input.ip);
    const res = await fetch('https://hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const data = await res.json().catch(() => null);
    const ok = Boolean(data?.success);
    return { ok: ok, skipped: false, data };
}
