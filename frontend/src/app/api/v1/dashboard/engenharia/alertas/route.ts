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
    const fSolic = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 's.id_obra_origem', 's.id_unidade_origem');
    const fNc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'nc.id_obra', 'nc.id_unidade');
    const fAc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'a.id_obra', 'a.id_unidade');
    const fProg = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'p.id_obra', 'p.id_unidade');

    const alertas: any[] = [];

    try {
      const [contratos]: any = await db.query(
        `
        SELECT
          'CONTRATO_VENCENDO' AS tipo,
          CONCAT('Contrato vencendo: ', numero_contrato) AS titulo,
          CONCAT('Fim previsto em ', DATE_FORMAT(data_fim_previsto, '%d/%m/%Y')) AS subtitulo,
          id_contrato AS referenciaId,
          '/dashboard/contratos' AS rota,
          'ALTA' AS criticidade
        FROM contratos
        WHERE tenant_id = ?
          AND data_fim_previsto IS NOT NULL
          AND data_fim_previsto BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ORDER BY data_fim_previsto
        LIMIT 5
        `,
        [current.tenantId]
      );
      alertas.push(...(contratos as any[]));
    } catch {}

    try {
      const [medicoes]: any = await db.query(
        `
        SELECT
          'MEDICAO_PENDENTE' AS tipo,
          CONCAT('Medição pendente do contrato ', c.numero_contrato) AS titulo,
          CONCAT('Status ', m.status_medicao) AS subtitulo,
          m.id_medicao AS referenciaId,
          '/dashboard/execucao/medicoes' AS rota,
          'MEDIA' AS criticidade
        FROM contratos_medicoes m
        INNER JOIN contratos c ON c.id_contrato = m.id_contrato
        INNER JOIN obras o ON o.id_contrato = c.id_contrato
        WHERE c.tenant_id = ?
          AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
          ${fObra.sql}
        ORDER BY m.id_medicao DESC
        LIMIT 5
        `,
        [current.tenantId, ...fObra.params]
      );
      alertas.push(...(medicoes as any[]));
    } catch {}

    try {
      const [medicoesAtraso]: any = await db.query(
        `
        SELECT
          'MEDICAO_ATRASADA' AS tipo,
          CONCAT('Medição atrasada do contrato ', c.numero_contrato) AS titulo,
          CONCAT('Prevista ', DATE_FORMAT(m.data_prevista_envio, '%d/%m/%Y'), ' / status ', m.status_medicao) AS subtitulo,
          m.id_medicao AS referenciaId,
          '/dashboard/execucao/medicoes' AS rota,
          'ALTA' AS criticidade
        FROM contratos_medicoes m
        INNER JOIN contratos c ON c.id_contrato = m.id_contrato
        INNER JOIN obras o ON o.id_contrato = c.id_contrato
        WHERE c.tenant_id = ?
          AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
          AND m.data_prevista_envio IS NOT NULL
          AND m.data_prevista_envio < CURDATE()
          ${fObra.sql}
        ORDER BY m.data_prevista_envio ASC
        LIMIT 5
        `,
        [current.tenantId, ...fObra.params]
      );
      alertas.push(...(medicoesAtraso as any[]));
    } catch {}

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
        LIMIT 5
        `,
        [current.tenantId, ...fSolic.params]
      );
      alertas.push(...(solicitacoes as any[]));
    } catch {}

    try {
      const [ncs]: any = await db.query(
        `
        SELECT
          'NC_CRITICA' AS tipo,
          CONCAT('NC crítica #', nc.id_nc) AS titulo,
          CONCAT('Status ', nc.status_nc, ' / prazo ', COALESCE(DATE_FORMAT(nc.prazo_correcao, '%d/%m/%Y'), '-')) AS subtitulo,
          nc.id_nc AS referenciaId,
          '/dashboard/sst/nao-conformidades' AS rota,
          'CRITICA' AS criticidade
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          AND nc.severidade IN ('ALTA','CRITICA')
          ${fNc.sql}
        ORDER BY COALESCE(nc.prazo_correcao, '2999-12-31') ASC, nc.id_nc DESC
        LIMIT 5
        `,
        [current.tenantId, ...fNc.params]
      );
      alertas.push(...(ncs as any[]));
    } catch {}

    try {
      const [acidentes]: any = await db.query(
        `
        SELECT
          'ACIDENTE' AS tipo,
          CONCAT('Acidente #', a.id_acidente) AS titulo,
          CONCAT('Data ', DATE_FORMAT(a.data_hora_ocorrencia, '%d/%m/%Y'), ' / ', a.severidade) AS subtitulo,
          a.id_acidente AS referenciaId,
          '/dashboard/sst/acidentes' AS rota,
          'ALTA' AS criticidade
        FROM sst_acidentes a
        WHERE a.tenant_id = ?
          AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          ${fAc.sql}
        ORDER BY a.data_hora_ocorrencia DESC
        LIMIT 5
        `,
        [current.tenantId, ...fAc.params]
      );
      alertas.push(...(acidentes as any[]));
    } catch {}

    try {
      const [checklists]: any = await db.query(
        `
        SELECT
          'CHECKLIST_ATRASADO' AS tipo,
          CONCAT('Checklist atrasado: ', m.nome_modelo) AS titulo,
          CONCAT('Periodicidade ', COALESCE(p.periodicidade_override, m.periodicidade)) AS subtitulo,
          p.id_programacao_checklist AS referenciaId,
          '/dashboard/sst/checklists' AS rota,
          'MEDIA' AS criticidade
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
          ${fProg.sql}
          AND (
            (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 1 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
          )
        ORDER BY p.id_programacao_checklist DESC
        LIMIT 5
        `,
        [current.tenantId, current.tenantId, ...fProg.params]
      );
      alertas.push(...(checklists as any[]));
    } catch {}

    return ok((alertas as any[]).slice(0, 20));
  } catch (e) {
    return handleApiError(e);
  }
}

