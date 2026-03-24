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

async function safeTotal(sql: string, params: any[]): Promise<number> {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

async function safeScalar(sql: string, params: any[], field = 'valor'): Promise<number> {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.[field] || 0);
  } catch {
    return 0;
  }
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

    const solicitacoesAbertas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM solicitacao_material s
      WHERE s.tenant_id = ?
        AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
        ${fSolic.sql}
      `,
      [current.tenantId, ...fSolic.params]
    );

    const solicitacoesUrgentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM solicitacao_material s
      WHERE s.tenant_id = ?
        AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
        AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
        ${fSolic.sql}
      `,
      [current.tenantId, ...fSolic.params]
    );

    const aprovacoesPendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM solicitacao_material s
      WHERE s.tenant_id = ?
        AND s.status_solicitacao IN ('AGUARDANDO_APROVACAO', 'PENDENTE_APROVACAO', 'EM_APROVACAO')
        ${fSolic.sql}
      `,
      [current.tenantId, ...fSolic.params]
    );

    const valorComprasMes = await safeScalar(
      `
      SELECT COALESCE(SUM(valor_total), 0) AS valor
      FROM compras_pedidos
      WHERE tenant_id = ?
        AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
      `,
      [current.tenantId]
    );

    const valorRecebidoMes = await safeScalar(
      `
      SELECT COALESCE(SUM(valor_total), 0) AS valor
      FROM suprimentos_recebimentos
      WHERE tenant_id = ?
        AND DATE_FORMAT(data_recebimento, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
      `,
      [current.tenantId]
    );

    return ok({
      solicitacoesAbertas,
      solicitacoesUrgentes,
      aprovacoesPendentes,
      ordensCompraAbertas: await safeTotal(`SELECT COUNT(*) AS total FROM compras_pedidos WHERE tenant_id = ? AND status IN ('ABERTO','EM_ANDAMENTO')`, [
        current.tenantId,
      ]),
      entregasAtrasadas: await safeTotal(
        `SELECT COUNT(*) AS total FROM compras_pedidos WHERE tenant_id = ? AND data_prevista_entrega IS NOT NULL AND data_prevista_entrega < CURDATE() AND status NOT IN ('RECEBIDO','CANCELADO')`,
        [current.tenantId]
      ),
      itensAbaixoMinimo: await safeTotal(`SELECT COUNT(*) AS total FROM estoque_saldos WHERE tenant_id = ? AND saldo_atual < estoque_minimo`, [current.tenantId]),
      itensSemGiro60d: await safeTotal(
        `SELECT COUNT(*) AS total FROM estoque_saldos WHERE tenant_id = ? AND (ultima_movimentacao IS NULL OR ultima_movimentacao < DATE_SUB(CURDATE(), INTERVAL 60 DAY))`,
        [current.tenantId]
      ),
      recebimentosPendentes: await safeTotal(`SELECT COUNT(*) AS total FROM suprimentos_recebimentos WHERE tenant_id = ? AND status IN ('PENDENTE','EM_CONFERENCIA')`, [
        current.tenantId,
      ]),
      divergenciasRecebimento: await safeTotal(`SELECT COUNT(*) AS total FROM suprimentos_recebimentos WHERE tenant_id = ? AND status = 'DIVERGENCIA'`, [current.tenantId]),
      valorComprasMes,
      valorRecebidoMes,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

