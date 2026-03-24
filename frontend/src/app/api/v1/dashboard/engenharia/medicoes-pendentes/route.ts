import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function buildOnlyFilter(ids: number[] | null, alias: string) {
  if (ids === null) return { sql: '', params: [] as number[] };
  if (!ids.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  const c = inClause(ids);
  return { sql: ` AND ${alias} IN ${c.sql}`, params: c.params };
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const fObra = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          m.id_medicao AS idMedicao,
          c.numero_contrato AS contratoNumero,
          CONCAT('Obra #', o.id_obra) AS obraNome,
          m.competencia AS competencia,
          m.status_medicao AS status,
          m.data_prevista_envio AS dataPrevistaEnvio,
          m.data_prevista_aprovacao AS dataPrevistaAprovacao,
          COALESCE(m.valor_medido, 0) AS valorMedido,
          CASE
            WHEN m.data_prevista_envio IS NULL THEN 0
            WHEN m.data_prevista_envio >= CURDATE() THEN 0
            ELSE DATEDIFF(CURDATE(), m.data_prevista_envio)
          END AS atrasoDias
        FROM contratos_medicoes m
        INNER JOIN contratos c ON c.id_contrato = m.id_contrato
        INNER JOIN obras o ON o.id_contrato = c.id_contrato
        WHERE c.tenant_id = ?
          AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
          ${fObra.sql}
        ORDER BY atrasoDias DESC, m.id_medicao DESC
        LIMIT 30
        `,
        [current.tenantId, ...fObra.params]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

