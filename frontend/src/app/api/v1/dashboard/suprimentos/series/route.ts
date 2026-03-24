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
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);
    const _idAlmoxarifado = Number(req.nextUrl.searchParams.get('idAlmoxarifado') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const unidadesSelecionadas = idUnidade ? [idUnidade] : scope.empresaTotal && !idObra ? null : scope.unidades;
    const fSolic = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 's.id_obra_origem', 's.id_unidade_origem');

    let solicitacoes: any[] = [];
    try {
      const [rows]: any = await db.query(
        `
        SELECT DATE_FORMAT(s.created_at, '%Y-%m') AS referencia, COUNT(*) AS total
        FROM solicitacao_material s
        WHERE s.tenant_id = ?
          AND s.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
          ${fSolic.sql}
        GROUP BY DATE_FORMAT(s.created_at, '%Y-%m')
        ORDER BY referencia
        `,
        [current.tenantId, ...fSolic.params]
      );
      solicitacoes = rows as any[];
    } catch {
      solicitacoes = [];
    }

    const map = new Map<string, number>();
    for (const r of solicitacoes) map.set(String(r.referencia), Number(r.total || 0));

    const series: any[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const referencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      series.push({
        referencia,
        solicitacoes: map.get(referencia) || 0,
        comprasAprovadas: 0,
        recebimentos: 0,
        rupturas: 0,
      });
    }

    return ok(series);
  } catch (e) {
    return handleApiError(e);
  }
}
