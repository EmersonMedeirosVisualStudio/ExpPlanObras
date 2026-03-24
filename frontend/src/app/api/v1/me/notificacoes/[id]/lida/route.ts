import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { db } from '@/lib/db';
import { publishMenuRefreshForUser, publishNotificationReadForUser } from '@/lib/realtime/publish';

export const runtime = 'nodejs';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedApiUser();
    const { id } = await context.params;
    const eventId = Number(id);
    if (!Number.isFinite(eventId)) return ok(null);

    try {
      await db.execute(
        `
        UPDATE notificacoes_destinatarios
        SET status_leitura = 'LIDA', lida_em = NOW()
        WHERE tenant_id = ? AND id_usuario = ? AND id_notificacao_evento = ?
        `,
        [user.tenantId, user.id, eventId]
      );
      await publishNotificationReadForUser(user.tenantId, user.id, eventId);
      await publishMenuRefreshForUser(user.tenantId, user.id);
    } catch {}

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}
