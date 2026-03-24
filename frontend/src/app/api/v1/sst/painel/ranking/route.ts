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
    const current = await requireApiPermission(PERMISSIONS.SST_PAINEL_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const unidadesSelecionadas = idUnidade ? [idUnidade] : scope.empresaTotal && !idObra ? null : scope.unidades;

    const fObraNc = buildOnlyFilter(obrasSelecionadas, 'nc.id_obra');
    const fUnNc = buildOnlyFilter(unidadesSelecionadas, 'nc.id_unidade');
    const fObraAc = buildOnlyFilter(obrasSelecionadas, 'a.id_obra');
    const fUnAc = buildOnlyFilter(unidadesSelecionadas, 'a.id_unidade');
    const fObraProg = buildOnlyFilter(obrasSelecionadas, 'p.id_obra');
    const fUnProg = buildOnlyFilter(unidadesSelecionadas, 'p.id_unidade');
    const fObraTurma = buildOnlyFilter(obrasSelecionadas, 't.id_obra');
    const fUnTurma = buildOnlyFilter(unidadesSelecionadas, 't.id_unidade');
    const fObraEpi = buildOnlyFilter(obrasSelecionadas, 'f.id_obra');
    const fUnEpi = buildOnlyFilter(unidadesSelecionadas, 'f.id_unidade');

    const [obraRank]: any = await db.query(
      `
      SELECT
        'OBRA' AS tipoLocal,
        o.id_obra AS referenciaId,
        CONCAT('Obra #', o.id_obra) AS nome,
        COALESCE(nc_abertas.total, 0) AS ncsAbertas,
        COALESCE(nc_criticas.total, 0) AS ncsCriticas,
        COALESCE(acidentes.total, 0) AS acidentes90d,
        COALESCE(check_atras.total, 0) AS checklistsAtrasados,
        COALESCE(trein_venc.total, 0) AS treinamentosVencidos,
        COALESCE(epis_venc.total, 0) AS episTrocaVencida
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      LEFT JOIN (
        SELECT id_obra, COUNT(*) AS total
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          ${fObraNc.sql}
        GROUP BY id_obra
      ) nc_abertas ON nc_abertas.id_obra = o.id_obra
      LEFT JOIN (
        SELECT id_obra, COUNT(*) AS total
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          AND nc.severidade IN ('ALTA','CRITICA')
          ${fObraNc.sql}
        GROUP BY id_obra
      ) nc_criticas ON nc_criticas.id_obra = o.id_obra
      LEFT JOIN (
        SELECT id_obra, COUNT(*) AS total
        FROM sst_acidentes a
        WHERE a.tenant_id = ?
          AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          ${fObraAc.sql}
        GROUP BY id_obra
      ) acidentes ON acidentes.id_obra = o.id_obra
      LEFT JOIN (
        SELECT COALESCE(p.id_obra, 0) AS id_obra, COUNT(*) AS total
        FROM sst_checklists_programacoes p
        INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
        LEFT JOIN (
          SELECT
            e.id_modelo_checklist,
            e.tipo_local,
            COALESCE(e.id_obra, 0) AS id_obra_ref,
            COALESCE(e.id_unidade, 0) AS id_unidade_ref,
            MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
          FROM sst_checklists_execucoes e
          WHERE e.tenant_id = ?
          GROUP BY e.id_modelo_checklist, e.tipo_local, COALESCE(e.id_obra, 0), COALESCE(e.id_unidade, 0)
        ) u
          ON u.id_modelo_checklist = p.id_modelo_checklist
         AND u.tipo_local = p.tipo_local
         AND u.id_obra_ref = COALESCE(p.id_obra, 0)
         AND u.id_unidade_ref = COALESCE(p.id_unidade, 0)
        WHERE p.tenant_id = ?
          ${fObraProg.sql}
          AND (
            (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_execucao, '1900-01-01') < CURDATE())
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
          )
        GROUP BY COALESCE(p.id_obra, 0)
      ) check_atras ON check_atras.id_obra = o.id_obra
      LEFT JOIN (
        SELECT COALESCE(t.id_obra, 0) AS id_obra, COUNT(*) AS total
        FROM sst_treinamentos_participantes p
        INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
        WHERE t.tenant_id = ?
          AND p.validade_ate IS NOT NULL
          AND p.validade_ate < CURDATE()
          ${fObraTurma.sql}
        GROUP BY COALESCE(t.id_obra, 0)
      ) trein_venc ON trein_venc.id_obra = o.id_obra
      LEFT JOIN (
        SELECT COALESCE(f.id_obra, 0) AS id_obra, COUNT(*) AS total
        FROM sst_epi_fichas_itens i
        INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
        WHERE f.tenant_id = ?
          AND i.status_item = 'ENTREGUE'
          AND i.data_prevista_troca IS NOT NULL
          AND i.data_prevista_troca < CURDATE()
          ${fObraEpi.sql}
        GROUP BY COALESCE(f.id_obra, 0)
      ) epis_venc ON epis_venc.id_obra = o.id_obra
      WHERE c.tenant_id = ?
      ORDER BY (COALESCE(nc_criticas.total,0) + COALESCE(acidentes.total,0) + COALESCE(check_atras.total,0) + COALESCE(trein_venc.total,0) + COALESCE(epis_venc.total,0)) DESC
      LIMIT 10
      `,
      [current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId]
    );

    const [unRank]: any = await db.query(
      `
      SELECT
        'UNIDADE' AS tipoLocal,
        u.id_unidade AS referenciaId,
        u.nome AS nome,
        COALESCE(nc_abertas.total, 0) AS ncsAbertas,
        COALESCE(nc_criticas.total, 0) AS ncsCriticas,
        COALESCE(acidentes.total, 0) AS acidentes90d,
        COALESCE(check_atras.total, 0) AS checklistsAtrasados,
        COALESCE(trein_venc.total, 0) AS treinamentosVencidos,
        COALESCE(epis_venc.total, 0) AS episTrocaVencida
      FROM unidades u
      LEFT JOIN (
        SELECT id_unidade, COUNT(*) AS total
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          ${fUnNc.sql}
        GROUP BY id_unidade
      ) nc_abertas ON nc_abertas.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT id_unidade, COUNT(*) AS total
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          AND nc.severidade IN ('ALTA','CRITICA')
          ${fUnNc.sql}
        GROUP BY id_unidade
      ) nc_criticas ON nc_criticas.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT id_unidade, COUNT(*) AS total
        FROM sst_acidentes a
        WHERE a.tenant_id = ?
          AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          ${fUnAc.sql}
        GROUP BY id_unidade
      ) acidentes ON acidentes.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT COALESCE(p.id_unidade, 0) AS id_unidade, COUNT(*) AS total
        FROM sst_checklists_programacoes p
        INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
        LEFT JOIN (
          SELECT
            e.id_modelo_checklist,
            e.tipo_local,
            COALESCE(e.id_obra, 0) AS id_obra_ref,
            COALESCE(e.id_unidade, 0) AS id_unidade_ref,
            MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
          FROM sst_checklists_execucoes e
          WHERE e.tenant_id = ?
          GROUP BY e.id_modelo_checklist, e.tipo_local, COALESCE(e.id_obra, 0), COALESCE(e.id_unidade, 0)
        ) u2
          ON u2.id_modelo_checklist = p.id_modelo_checklist
         AND u2.tipo_local = p.tipo_local
         AND u2.id_unidade_ref = COALESCE(p.id_unidade, 0)
        WHERE p.tenant_id = ?
          ${fUnProg.sql}
          AND (
            (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u2.ultima_execucao, '1900-01-01') < CURDATE())
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u2.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u2.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
          )
        GROUP BY COALESCE(p.id_unidade, 0)
      ) check_atras ON check_atras.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT COALESCE(t.id_unidade, 0) AS id_unidade, COUNT(*) AS total
        FROM sst_treinamentos_participantes p
        INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
        WHERE t.tenant_id = ?
          AND p.validade_ate IS NOT NULL
          AND p.validade_ate < CURDATE()
          ${fUnTurma.sql}
        GROUP BY COALESCE(t.id_unidade, 0)
      ) trein_venc ON trein_venc.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT COALESCE(f.id_unidade, 0) AS id_unidade, COUNT(*) AS total
        FROM sst_epi_fichas_itens i
        INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
        WHERE f.tenant_id = ?
          AND i.status_item = 'ENTREGUE'
          AND i.data_prevista_troca IS NOT NULL
          AND i.data_prevista_troca < CURDATE()
          ${fUnEpi.sql}
        GROUP BY COALESCE(f.id_unidade, 0)
      ) epis_venc ON epis_venc.id_unidade = u.id_unidade
      WHERE u.tenant_id = ?
      ORDER BY (COALESCE(nc_criticas.total,0) + COALESCE(acidentes.total,0) + COALESCE(check_atras.total,0) + COALESCE(trein_venc.total,0) + COALESCE(epis_venc.total,0)) DESC
      LIMIT 10
      `,
      [current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId, current.tenantId]
    );

    return ok([...(obraRank as any[]), ...(unRank as any[])].slice(0, 20));
  } catch (e) {
    return handleApiError(e);
  }
}
