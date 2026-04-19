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

    const [porObra]: any = await db.query(
      `
      SELECT
        fl.id_obra AS id,
        COALESCE(o.nome_obra, o.nome, CONCAT('Obra #', fl.id_obra)) AS nome,
        COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      LEFT JOIN obras o ON o.id_obra = fl.id_obra
      WHERE f.tenant_id = ?
        AND f.ativo = 1
        AND fl.id_obra IS NOT NULL
        ${fLot.sql}
      GROUP BY fl.id_obra, COALESCE(o.nome_obra, o.nome, CONCAT('Obra #', fl.id_obra))
      ORDER BY total DESC, nome ASC
      LIMIT 20
      `,
      [current.tenantId, ...fLot.params]
    );

    const [porUnidade]: any = await db.query(
      `
      SELECT
        fl.id_unidade AS id,
        COALESCE(u.nome_unidade, u.nome, CONCAT('Unidade #', fl.id_unidade)) AS nome,
        COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      LEFT JOIN unidades u ON u.id_unidade = fl.id_unidade
      WHERE f.tenant_id = ?
        AND f.ativo = 1
        AND fl.id_unidade IS NOT NULL
        ${fLot.sql}
      GROUP BY fl.id_unidade, COALESCE(u.nome_unidade, u.nome, CONCAT('Unidade #', fl.id_unidade))
      ORDER BY total DESC, nome ASC
      LIMIT 20
      `,
      [current.tenantId, ...fLot.params]
    );

    return ok({
      porObra: (porObra as any[]).map((r) => ({ id: Number(r.id), nome: String(r.nome), total: Number(r.total || 0) })),
      porUnidade: (porUnidade as any[]).map((r) => ({ id: Number(r.id), nome: String(r.nome), total: Number(r.total || 0) })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

