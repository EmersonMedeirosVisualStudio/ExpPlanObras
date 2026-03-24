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

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          s.id_item AS idItem,
          COALESCE(i.codigo, '') AS codigo,
          COALESCE(i.descricao, '') AS descricao,
          i.unidade_medida AS unidadeMedida,
          COALESCE(s.saldo_atual, 0) AS saldoAtual,
          COALESCE(s.estoque_minimo, 0) AS estoqueMinimo,
          (COALESCE(s.estoque_minimo, 0) - COALESCE(s.saldo_atual, 0)) AS deficit,
          COALESCE(s.tipo_local, 'ALMOXARIFADO') AS tipoLocal,
          COALESCE(a.nome, u.nome, CONCAT('Obra #', o.id_obra), '-') AS localNome
        FROM estoque_saldos s
        INNER JOIN estoque_itens i ON i.id_item = s.id_item
        LEFT JOIN almoxarifados a ON a.id_almoxarifado = s.id_almoxarifado
        LEFT JOIN unidades u ON u.id_unidade = s.id_unidade
        LEFT JOIN obras o ON o.id_obra = s.id_obra
        WHERE s.tenant_id = ?
          AND s.estoque_minimo IS NOT NULL
          AND s.saldo_atual < s.estoque_minimo
        ORDER BY deficit DESC
        LIMIT 50
        `,
        [current.tenantId]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

