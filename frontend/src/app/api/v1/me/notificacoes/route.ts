import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { syncNotificationsForUser } from '@/lib/notifications/service';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const permissions = await getCurrentUserPermissions(user.id);
    const scope = await getDashboardScope(user);

    await syncNotificationsForUser({
      tenantId: user.tenantId,
      userId: user.id,
      permissions,
      scope: {
        empresaTotal: !!scope.empresaTotal,
        diretorias: scope.diretorias ?? [],
        obras: scope.obras ?? [],
        unidades: scope.unidades ?? [],
      },
    });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const modulo = searchParams.get('modulo');
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));

    const params: any[] = [user.tenantId, user.id];
    let where = `WHERE d.tenant_id = ? AND d.id_usuario = ? AND (e.expira_em IS NULL OR e.expira_em > NOW())`;
    if (status === 'NAO_LIDA') where += ` AND d.status_leitura = 'NAO_LIDA'`;
    if (status === 'LIDA') where += ` AND d.status_leitura = 'LIDA'`;
    if (modulo) {
      where += ` AND e.modulo = ?`;
      params.push(modulo);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        e.id_notificacao_evento AS id,
        e.modulo,
        e.severidade,
        e.titulo,
        e.mensagem,
        e.rota,
        e.entidade_tipo AS entidadeTipo,
        e.entidade_id AS entidadeId,
        e.criado_em AS criadaEm,
        (d.status_leitura = 'LIDA') AS lida
      FROM notificacoes_destinatarios d
      INNER JOIN notificacoes_eventos e ON e.id_notificacao_evento = d.id_notificacao_evento
      ${where}
      ORDER BY (d.status_leitura = 'NAO_LIDA') DESC, e.atualizado_em DESC
      LIMIT ?
      `,
      [...params, limit]
    );

    return ok(rows as any[]);
  } catch (e) {
    return handleApiError(e);
  }
}

