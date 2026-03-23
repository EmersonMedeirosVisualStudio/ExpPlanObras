import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_GERENTE_VIEW);
    const scope = await getDashboardScope(current);

    let obras: any[] = [];
    let unidades: any[] = [];

    if (scope.empresaTotal) {
      const [obrasRows]: any = await db.query(
        `
        SELECT o.id_obra AS id, CONCAT('Obra #', o.id_obra) AS nome
        FROM obras o
        INNER JOIN contratos c ON c.id_contrato = o.id_contrato
        WHERE c.tenant_id = ?
        ORDER BY o.id_obra DESC
        `,
        [current.tenantId]
      );

      const [unidadesRows]: any = await db.query(
        `
        SELECT id_unidade AS id, nome
        FROM unidades
        WHERE tenant_id = ? AND ativo = 1
        ORDER BY nome
        `,
        [current.tenantId]
      );

      obras = obrasRows as any[];
      unidades = unidadesRows as any[];
    } else {
      if (scope.obras.length) {
        const ids = inClause(scope.obras);
        const [obrasRows]: any = await db.query(
          `
          SELECT o.id_obra AS id, CONCAT('Obra #', o.id_obra) AS nome
          FROM obras o
          INNER JOIN contratos c ON c.id_contrato = o.id_contrato
          WHERE c.tenant_id = ?
            AND o.id_obra IN ${ids.sql}
          ORDER BY o.id_obra DESC
          `,
          [current.tenantId, ...ids.params]
        );
        obras = obrasRows as any[];
      }

      if (scope.unidades.length) {
        const ids = inClause(scope.unidades);
        const [unidadesRows]: any = await db.query(
          `
          SELECT id_unidade AS id, nome
          FROM unidades
          WHERE tenant_id = ?
            AND id_unidade IN ${ids.sql}
            AND ativo = 1
          ORDER BY nome
          `,
          [current.tenantId, ...ids.params]
        );
        unidades = unidadesRows as any[];
      }
    }

    return ok({
      empresaTotal: scope.empresaTotal,
      obras,
      unidades,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

