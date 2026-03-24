import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function buildMixedFilter(obras: number[] | null, unidades: number[] | null, obraAlias: string, unidadeAlias: string) {
  if (obras === null && unidades === null) return { sql: '', params: [] as number[] };

  const parts: string[] = [];
  const params: number[] = [];

  if (obras && obras.length) {
    const c = inClause(obras);
    parts.push(`${obraAlias} IN ${c.sql}`);
    params.push(...c.params);
  }
  if (unidades && unidades.length) {
    const c = inClause(unidades);
    parts.push(`${unidadeAlias} IN ${c.sql}`);
    params.push(...c.params);
  }

  if (!parts.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  return { sql: ` AND (${parts.join(' OR ')})`, params };
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_RH_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const unidadesSelecionadas = idUnidade ? [idUnidade] : scope.empresaTotal && !idObra ? null : scope.unidades;

    const fLot = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'fl.id_obra', 'fl.id_unidade');

    const [admissoes]: any = await db.query(
      `
      SELECT DATE_FORMAT(f.data_admissao, '%Y-%m') AS periodo, COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.data_admissao >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ${fLot.sql}
      GROUP BY DATE_FORMAT(f.data_admissao, '%Y-%m')
      ORDER BY periodo
      `,
      [current.tenantId, ...fLot.params]
    );

    const [desligamentos]: any = await db.query(
      `
      SELECT DATE_FORMAT(f.data_desligamento, '%Y-%m') AS periodo, COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.data_desligamento IS NOT NULL
        AND f.data_desligamento >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ${fLot.sql}
      GROUP BY DATE_FORMAT(f.data_desligamento, '%Y-%m')
      ORDER BY periodo
      `,
      [current.tenantId, ...fLot.params]
    );

    const [heSolicitadas]: any = await db.query(
      `
      SELECT DATE_FORMAT(he.data_referencia, '%Y-%m') AS periodo, COUNT(*) AS total
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
      WHERE he.tenant_id = ?
        AND he.status_he = 'SOLICITADA'
        AND he.data_referencia >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ${fLot.sql}
      GROUP BY DATE_FORMAT(he.data_referencia, '%Y-%m')
      ORDER BY periodo
      `,
      [current.tenantId, ...fLot.params]
    );

    return ok({ admissoes, desligamentos, heSolicitadas });
  } catch (e) {
    return handleApiError(e);
  }
}

