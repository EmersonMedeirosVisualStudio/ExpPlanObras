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
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_GERENTE_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const unidadesSelecionadas = idUnidade ? [idUnidade] : scope.empresaTotal && !idObra ? null : scope.unidades;

    const filtroObra = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');
    const filtroMistoSolic = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 's.id_obra_origem', 's.id_unidade_origem');
    const filtroMistoLot = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'fl.id_obra', 'fl.id_unidade');
    const filtroMistoPres = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'p.id_obra', 'p.id_unidade');
    const filtroMistoNc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'nc.id_obra', 'nc.id_unidade');
    const filtroMistoAc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'a.id_obra', 'a.id_unidade');
    const filtroMistoTrein = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 't.id_obra', 't.id_unidade');
    const filtroMistoProg = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'p.id_obra', 'p.id_unidade');

    const [[obrasSobGestao]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
        ${filtroObra.sql}
      `,
      [current.tenantId, ...filtroObra.params]
    );

    const [[medicoesPendentes]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT m.id_medicao) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
        ${filtroObra.sql}
      `,
      [current.tenantId, ...filtroObra.params]
    );

    const [[solicitacoesUrgentes]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM solicitacao_material s
      WHERE s.tenant_id = ?
        AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
        AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
        ${filtroMistoSolic.sql}
      `,
      [current.tenantId, ...filtroMistoSolic.params]
    );

    const [[funcionariosAtivos]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.ativo = 1
        AND f.status_funcional = 'ATIVO'
        ${filtroMistoLot.sql}
      `,
      [current.tenantId, ...filtroMistoLot.params]
    );

    const [[presencasPendentes]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas_cabecalho p
      WHERE p.tenant_id = ?
        AND p.status_presenca IN ('EM_PREENCHIMENTO', 'FECHADA', 'REJEITADA_RH')
        ${filtroMistoPres.sql}
      `,
      [current.tenantId, ...filtroMistoPres.params]
    );

    const [[horasExtrasPendentes]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT he.id_hora_extra) AS total
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
      WHERE he.tenant_id = ?
        AND he.status_he IN ('SOLICITADA', 'AUTORIZADA')
        ${filtroMistoLot.sql}
      `,
      [current.tenantId, ...filtroMistoLot.params]
    );

    const [[ncsAbertas]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_nao_conformidades nc
      WHERE nc.tenant_id = ?
        AND nc.status_nc IN ('ABERTA', 'EM_TRATAMENTO', 'AGUARDANDO_VALIDACAO')
        ${filtroMistoNc.sql}
      `,
      [current.tenantId, ...filtroMistoNc.params]
    );

    const [[acidentesMes]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes a
      WHERE a.tenant_id = ?
        AND DATE_FORMAT(a.data_hora_ocorrencia, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${filtroMistoAc.sql}
      `,
      [current.tenantId, ...filtroMistoAc.params]
    );

    const [[checklistsAtrasados]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
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
        AND p.ativo = 1
        ${filtroMistoProg.sql}
        AND (
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO'
            AND (u.ultima_execucao IS NULL OR u.ultima_execucao < CURDATE() - INTERVAL 1 DAY))
          OR
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL'
            AND (u.ultima_execucao IS NULL OR YEARWEEK(u.ultima_execucao, 1) < YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1)))
          OR
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL'
            AND (u.ultima_execucao IS NULL OR DATE_FORMAT(u.ultima_execucao, '%Y-%m') < DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m')))
        )
      `,
      [current.tenantId, current.tenantId, ...filtroMistoProg.params]
    );

    const [[treinamentosVencidos]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
        ${filtroMistoTrein.sql}
      `,
      [current.tenantId, ...filtroMistoTrein.params]
    );

    let valorContratado = 0;
    let valorExecutado = 0;
    let valorPago = 0;

    if (obrasSelecionadas === null || (obrasSelecionadas && obrasSelecionadas.length)) {
      const filtroFinanceiro = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');
      const [[finRows]]: any = await db.query(
        `
        SELECT
          COALESCE(SUM(x.valor_atualizado), 0) AS valorContratado,
          COALESCE(SUM(x.valor_executado), 0) AS valorExecutado,
          COALESCE(SUM(x.valor_pago), 0) AS valorPago
        FROM (
          SELECT DISTINCT c.id_contrato, c.valor_atualizado, c.valor_executado, c.valor_pago
          FROM contratos c
          INNER JOIN obras o ON o.id_contrato = c.id_contrato
          WHERE c.tenant_id = ?
            ${filtroFinanceiro.sql}
        ) x
        `,
        [current.tenantId, ...filtroFinanceiro.params]
      );

      valorContratado = Number(finRows.valorContratado || 0);
      valorExecutado = Number(finRows.valorExecutado || 0);
      valorPago = Number(finRows.valorPago || 0);
    }

    return ok({
      obrasSobGestao: Number(obrasSobGestao.total || 0),
      medicoesPendentes: Number(medicoesPendentes.total || 0),
      solicitacoesUrgentes: Number(solicitacoesUrgentes.total || 0),
      funcionariosAtivos: Number(funcionariosAtivos.total || 0),
      presencasPendentes: Number(presencasPendentes.total || 0),
      horasExtrasPendentes: Number(horasExtrasPendentes.total || 0),
      ncsAbertas: Number(ncsAbertas.total || 0),
      acidentesMes: Number(acidentesMes.total || 0),
      checklistsAtrasados: Number(checklistsAtrasados.total || 0),
      treinamentosVencidos: Number(treinamentosVencidos.total || 0),
      valorContratado,
      valorExecutado,
      valorPago,
      saldoContrato: valorContratado - valorPago,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

