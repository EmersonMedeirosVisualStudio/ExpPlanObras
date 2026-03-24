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

function buildOnlyFilter(ids: number[] | null, alias: string) {
  if (ids === null) return { sql: '', params: [] as number[] };
  if (!ids.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  const c = inClause(ids);
  return { sql: ` AND ${alias} IN ${c.sql}`, params: c.params };
}

async function safeQueryTotal(sql: string, params: any[]) {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

async function safeQueryScalar(sql: string, params: any[], field: string) {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.[field] || 0);
  } catch {
    return 0;
  }
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
    const unidadesSelecionadas = idUnidade ? [idUnidade] : scope.empresaTotal && !idObra ? null : scope.unidades;

    const fObra = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');
    const fMedObra = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');
    const fSolic = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 's.id_obra_origem', 's.id_unidade_origem');
    const fNc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'nc.id_obra', 'nc.id_unidade');
    const fAc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'a.id_obra', 'a.id_unidade');
    const fProg = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'p.id_obra', 'p.id_unidade');

    const obrasAtivas = await safeQueryTotal(
      `
      SELECT COUNT(*) AS total
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
        AND o.status_obra = 'ATIVA'
        ${fObra.sql}
      `,
      [current.tenantId, ...fObra.params]
    );

    const obrasParalisadas = await safeQueryTotal(
      `
      SELECT COUNT(*) AS total
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
        AND o.status_obra = 'PARALISADA'
        ${fObra.sql}
      `,
      [current.tenantId, ...fObra.params]
    );

    const obrasConcluidasMes = await safeQueryTotal(
      `
      SELECT COUNT(*) AS total
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
        AND o.status_obra = 'CONCLUIDA'
        AND DATE_FORMAT(o.data_conclusao, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fObra.sql}
      `,
      [current.tenantId, ...fObra.params]
    );

    const medicoesPendentes = await safeQueryTotal(
      `
      SELECT COUNT(DISTINCT m.id_medicao) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
        ${fMedObra.sql}
      `,
      [current.tenantId, ...fMedObra.params]
    );

    const medicoesAtrasadas = await safeQueryTotal(
      `
      SELECT COUNT(DISTINCT m.id_medicao) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
        AND m.data_prevista_envio IS NOT NULL
        AND m.data_prevista_envio < CURDATE()
        ${fMedObra.sql}
      `,
      [current.tenantId, ...fMedObra.params]
    );

    const contratosVencendo30d = await safeQueryTotal(
      `
      SELECT COUNT(*) AS total
      FROM contratos c
      WHERE c.tenant_id = ?
        AND c.data_fim_previsto IS NOT NULL
        AND c.data_fim_previsto BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      `,
      [current.tenantId]
    );

    const solicitacoesUrgentesObra = await safeQueryTotal(
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

    const ncsCriticasObra = await safeQueryTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_nao_conformidades nc
      WHERE nc.tenant_id = ?
        AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
        AND nc.severidade IN ('ALTA','CRITICA')
        ${fNc.sql}
      `,
      [current.tenantId, ...fNc.params]
    );

    const acidentesMes = await safeQueryTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes a
      WHERE a.tenant_id = ?
        AND DATE_FORMAT(a.data_hora_ocorrencia, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fAc.sql}
      `,
      [current.tenantId, ...fAc.params]
    );

    const checklistsAtrasados = await safeQueryTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_checklists_programacoes p
      INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
      LEFT JOIN (
        SELECT
          e.tenant_id,
          e.id_modelo_checklist,
          e.tipo_local,
          e.id_obra,
          e.id_unidade,
          MAX(e.data_referencia) AS ultima_data
        FROM sst_checklists_execucoes e
        WHERE e.tenant_id = ?
        GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, e.id_obra, e.id_unidade
      ) u
        ON u.tenant_id = p.tenant_id
       AND u.id_modelo_checklist = p.id_modelo_checklist
       AND u.tipo_local = p.tipo_local
       AND COALESCE(u.id_obra, 0) = COALESCE(p.id_obra, 0)
       AND COALESCE(u.id_unidade, 0) = COALESCE(p.id_unidade, 0)
      WHERE p.tenant_id = ?
        AND p.ativo = 1
        AND p.data_inicio_vigencia <= CURDATE()
        AND (p.data_fim_vigencia IS NULL OR p.data_fim_vigencia >= CURDATE())
        ${fProg.sql}
        AND (
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 1 DAY))
          OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
          OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
          OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'PONTUAL' AND u.ultima_data IS NULL AND p.data_inicio_vigencia < CURDATE())
        )
      `,
      [current.tenantId, current.tenantId, ...fProg.params]
    );

    const valorMedidoMes = await safeQueryScalar(
      `
      SELECT COALESCE(SUM(m.valor_medido), 0) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND DATE_FORMAT(m.created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fMedObra.sql}
      `,
      [current.tenantId, ...fMedObra.params],
      'total'
    );

    const valorExecutadoMes = await safeQueryScalar(
      `
      SELECT COALESCE(SUM(m.valor_executado), 0) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND DATE_FORMAT(m.created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fMedObra.sql}
      `,
      [current.tenantId, ...fMedObra.params],
      'total'
    );

    return ok({
      obrasAtivas,
      obrasParalisadas,
      obrasConcluidasMes,
      medicoesPendentes,
      medicoesAtrasadas,
      contratosVencendo30d,
      solicitacoesUrgentesObra,
      ncsCriticasObra,
      acidentesMes,
      checklistsAtrasados,
      valorExecutadoMes,
      valorMedidoMes,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

