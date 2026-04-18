import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);
    const _idAlmoxarifado = Number(req.nextUrl.searchParams.get('idAlmoxarifado') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obraFilter = idObra ? ' AND s.id_obra_origem = ? ' : '';
    const obraParams = idObra ? [idObra] : [];

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          COALESCE(o.id_obra, s.id_obra_origem, 0) AS idObra,
          COALESCE(o.nome, CONCAT('Obra #', s.id_obra_origem)) AS nomeObra,
          COUNT(*) AS solicitacoes
        FROM solicitacao_material s
        LEFT JOIN obras o ON o.id_obra = s.id_obra_origem
        WHERE s.tenant_id = ?
          AND s.data_solicitacao >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          ${obraFilter}
        GROUP BY COALESCE(o.id_obra, s.id_obra_origem, 0), COALESCE(o.nome, CONCAT('Obra #', s.id_obra_origem))
        ORDER BY solicitacoes DESC
        LIMIT 12
        `,
        [current.tenantId, ...obraParams]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

