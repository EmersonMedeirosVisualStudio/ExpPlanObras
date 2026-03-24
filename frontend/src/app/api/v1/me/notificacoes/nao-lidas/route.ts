import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { syncNotificationsForUser } from '@/lib/notifications/service';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
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

    try {
      const [rows]: any = await db.query(
        `
        SELECT e.modulo, COUNT(*) AS total
        FROM notificacoes_destinatarios d
        INNER JOIN notificacoes_eventos e ON e.id_notificacao_evento = d.id_notificacao_evento
        WHERE d.tenant_id = ?
          AND d.id_usuario = ?
          AND d.status_leitura = 'NAO_LIDA'
          AND e.resolvida_em IS NULL
          AND (e.expira_em IS NULL OR e.expira_em > NOW())
        GROUP BY e.modulo
        `,
        [user.tenantId, user.id]
      );

      const porModulo: Record<string, number> = {};
      let total = 0;
      for (const r of rows as any[]) {
        const v = Number(r.total || 0);
        porModulo[String(r.modulo)] = v;
        total += v;
      }
      return ok({ total, porModulo });
    } catch {
      return ok({ total: 0, porModulo: {} });
    }
  } catch (e) {
    return handleApiError(e);
  }
}

