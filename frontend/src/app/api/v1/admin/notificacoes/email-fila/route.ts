import { NextRequest } from 'next/server';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.NOTIFICACOES_EMAIL_FILA_VIEW);
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 50)));
    const status = req.nextUrl.searchParams.get('status');

    const params: any[] = [current.tenantId];
    let where = `WHERE tenant_id = ?`;
    if (status) {
      where += ` AND status_envio = ?`;
      params.push(status);
    }

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          id_notificacao_email AS id,
          template_key AS templateKey,
          assunto,
          email_destino AS emailDestino,
          status_envio AS statusEnvio,
          tentativas,
          proxima_tentativa_em AS proximaTentativaEm,
          enviado_em AS enviadoEm,
          ultimo_erro AS ultimoErro
        FROM notificacoes_email_fila
        ${where}
        ORDER BY atualizado_em DESC
        LIMIT ?
        `,
        [...params, limit]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

