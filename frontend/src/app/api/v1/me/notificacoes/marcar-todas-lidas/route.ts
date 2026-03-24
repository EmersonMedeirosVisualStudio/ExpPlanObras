import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    const modulo = body?.modulo ? String(body.modulo) : null;

    try {
      if (modulo) {
        await db.execute(
          `
          UPDATE notificacoes_destinatarios d
          INNER JOIN notificacoes_eventos e ON e.id_notificacao_evento = d.id_notificacao_evento
          SET d.status_leitura = 'LIDA', d.lida_em = NOW()
          WHERE d.tenant_id = ? AND d.id_usuario = ? AND d.status_leitura = 'NAO_LIDA' AND e.modulo = ?
          `,
          [user.tenantId, user.id, modulo]
        );
      } else {
        await db.execute(
          `
          UPDATE notificacoes_destinatarios
          SET status_leitura = 'LIDA', lida_em = NOW()
          WHERE tenant_id = ? AND id_usuario = ? AND status_leitura = 'NAO_LIDA'
          `,
          [user.tenantId, user.id]
        );
      }
    } catch {}

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

