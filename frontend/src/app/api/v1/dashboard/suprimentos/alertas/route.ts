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

    const alertas: any[] = [];

    try {
      const [solicitacoes]: any = await db.query(
        `
        SELECT
          'SOLICITACAO_URGENTE' AS tipo,
          CONCAT('Solicitação urgente #', s.id_solicitacao_material) AS titulo,
          CONCAT('Status ', s.status_solicitacao, ' / ', s.regime_urgencia) AS subtitulo,
          s.id_solicitacao_material AS referenciaId,
          '/dashboard/suprimentos/solicitacoes' AS rota,
          CASE WHEN s.regime_urgencia = 'EMERGENCIAL' THEN 'CRITICA' ELSE 'ALTA' END AS criticidade
        FROM solicitacao_material s
        WHERE s.tenant_id = ?
          AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
          AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
          ${fSolic.sql}
        ORDER BY s.created_at DESC
        LIMIT 10
        `,
        [current.tenantId, ...fSolic.params]
      );
      alertas.push(...(solicitacoes as any[]));
    } catch {}

    try {
      const [estoqueMinimo]: any = await db.query(
        `
        SELECT
          'ESTOQUE_MINIMO' AS tipo,
          CONCAT('Estoque abaixo do mínimo: ', COALESCE(i.descricao, i.codigo)) AS titulo,
          CONCAT('Saldo ', s.saldo_atual, ' / mínimo ', s.estoque_minimo) AS subtitulo,
          s.id_item AS referenciaId,
          '/dashboard/suprimentos/estoque' AS rota,
          'ALTA' AS criticidade
        FROM estoque_saldos s
        INNER JOIN estoque_itens i ON i.id_item = s.id_item
        WHERE s.tenant_id = ?
          AND s.estoque_minimo IS NOT NULL
          AND s.saldo_atual < s.estoque_minimo
        ORDER BY (s.estoque_minimo - s.saldo_atual) DESC
        LIMIT 5
        `,
        [current.tenantId]
      );
      alertas.push(...(estoqueMinimo as any[]));
    } catch {}

    try {
      const [entregas]: any = await db.query(
        `
        SELECT
          'ENTREGA_ATRASADA' AS tipo,
          CONCAT('Entrega atrasada: ', p.numero_pedido) AS titulo,
          CONCAT('Prevista ', DATE_FORMAT(p.data_prevista_entrega, '%d/%m/%Y'), ' / status ', p.status) AS subtitulo,
          p.id_pedido AS referenciaId,
          '/dashboard/suprimentos/compras' AS rota,
          'ALTA' AS criticidade
        FROM compras_pedidos p
        WHERE p.tenant_id = ?
          AND p.data_prevista_entrega IS NOT NULL
          AND p.data_prevista_entrega < CURDATE()
          AND p.status NOT IN ('RECEBIDO', 'CANCELADO')
        ORDER BY p.data_prevista_entrega ASC
        LIMIT 5
        `,
        [current.tenantId]
      );
      alertas.push(...(entregas as any[]));
    } catch {}

    return ok((alertas as any[]).slice(0, 20));
  } catch (e) {
    return handleApiError(e);
  }
}

