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
    const fPres = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'p.id_obra', 'p.id_unidade');
    const fTrein = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 't.id_obra', 't.id_unidade');

    const [[funcionariosAtivos]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.ativo = 1
        AND f.status_funcional = 'ATIVO'
        ${fLot.sql}
      `,
      [current.tenantId, ...fLot.params]
    );

    const [[cadastrosPendentes]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.status_cadastro_rh = 'PENDENTE_ENDOSSO'
        ${fLot.sql}
      `,
      [current.tenantId, ...fLot.params]
    );

    const [[admissoesMes]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND DATE_FORMAT(f.data_admissao, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fLot.sql}
      `,
      [current.tenantId, ...fLot.params]
    );

    const [[desligamentosMes]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.data_desligamento IS NOT NULL
        AND DATE_FORMAT(f.data_desligamento, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fLot.sql}
      `,
      [current.tenantId, ...fLot.params]
    );

    const [[presencasEnviadasRh]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas_cabecalho p
      WHERE p.tenant_id = ?
        AND p.status_presenca = 'ENVIADA_RH'
        ${fPres.sql}
      `,
      [current.tenantId, ...fPres.params]
    );

    const [[presencasRejeitadasRh]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas_cabecalho p
      WHERE p.tenant_id = ?
        AND p.status_presenca = 'REJEITADA_RH'
        ${fPres.sql}
      `,
      [current.tenantId, ...fPres.params]
    );

    const [[assinaturasPendentes]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas_itens pi
      INNER JOIN presencas_cabecalho p ON p.id_presenca = pi.id_presenca
      WHERE p.tenant_id = ?
        AND p.status_presenca IN ('EM_PREENCHIMENTO', 'FECHADA', 'REJEITADA_RH')
        AND pi.requer_assinatura_funcionario = 1
        AND pi.assinado_funcionario = 0
        ${fPres.sql}
      `,
      [current.tenantId, ...fPres.params]
    );

    const [[heSolicitadas]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT he.id_hora_extra) AS total
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
      WHERE he.tenant_id = ?
        AND he.status_he = 'SOLICITADA'
        ${fLot.sql}
      `,
      [current.tenantId, ...fLot.params]
    );

    const [[heAutorizadas]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT he.id_hora_extra) AS total
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
      WHERE he.tenant_id = ?
        AND he.status_he = 'AUTORIZADA'
        ${fLot.sql}
      `,
      [current.tenantId, ...fLot.params]
    );

    const [[heLancadasRh]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT he.id_hora_extra) AS total
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
      WHERE he.tenant_id = ?
        AND he.status_he = 'LANCADA_RH'
        ${fLot.sql}
      `,
      [current.tenantId, ...fLot.params]
    );

    const [[treinamentosVencidos]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
        ${fTrein.sql}
      `,
      [current.tenantId, ...fTrein.params]
    );

    const [[treinamentosAlerta]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate >= CURDATE()
        AND p.data_alerta_reciclagem IS NOT NULL
        AND p.data_alerta_reciclagem <= CURDATE()
        ${fTrein.sql}
      `,
      [current.tenantId, ...fTrein.params]
    );

    return ok({
      funcionariosAtivos: Number(funcionariosAtivos.total || 0),
      cadastrosPendentesEndosso: Number(cadastrosPendentes.total || 0),
      admissoesMes: Number(admissoesMes.total || 0),
      desligamentosMes: Number(desligamentosMes.total || 0),
      presencasEnviadasRh: Number(presencasEnviadasRh.total || 0),
      presencasRejeitadasRh: Number(presencasRejeitadasRh.total || 0),
      assinaturasPendentes: Number(assinaturasPendentes.total || 0),
      heSolicitadas: Number(heSolicitadas.total || 0),
      heAutorizadas: Number(heAutorizadas.total || 0),
      heLancadasRh: Number(heLancadasRh.total || 0),
      treinamentosVencidos: Number(treinamentosVencidos.total || 0),
      treinamentosAlerta: Number(treinamentosAlerta.total || 0),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

