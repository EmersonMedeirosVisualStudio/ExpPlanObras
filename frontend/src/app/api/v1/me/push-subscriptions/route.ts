import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { deactivatePushSubscription, listPushSubscriptions, upsertPushSubscription } from '@/lib/notifications/push/service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireAuthenticatedApiUser();
    const data = await listPushSubscriptions({ tenantId: user.tenantId, userId: user.id });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) return fail(422, 'Assinatura inválida');
    await upsertPushSubscription({
      tenantId: user.tenantId,
      userId: user.id,
      sub: {
        endpoint: String(body.endpoint),
        keys: { p256dh: String(body.keys.p256dh), auth: String(body.keys.auth) },
        userAgent: req.headers.get('user-agent'),
        idioma: req.headers.get('accept-language'),
        plataforma: body?.plataforma ? String(body.plataforma) : null,
      },
    });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    const endpoint = body?.endpoint ? String(body.endpoint) : '';
    if (!endpoint) return fail(422, 'endpoint obrigatório');
    await deactivatePushSubscription({ tenantId: user.tenantId, userId: user.id, endpoint });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

