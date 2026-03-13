export async function verifyHCaptcha(input: { token: string; ip?: string }) {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) return { ok: true as const, skipped: true as const };

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', input.token);
  if (input.ip) body.set('remoteip', input.ip);

  const res = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data: any = await res.json().catch(() => null);
  const ok = Boolean(data?.success);
  return { ok: ok as boolean, skipped: false as const, data };
}

