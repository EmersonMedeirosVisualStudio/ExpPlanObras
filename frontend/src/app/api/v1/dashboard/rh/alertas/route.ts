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

    const [cadastros]: any = await db.query(
      `
      SELECT
        'CADASTRO_PENDENTE' AS tipo,
        CONCAT('Cadastro pendente de endosso: ', f.nome_completo) AS titulo,
        CONCAT('Matrícula ', f.matricula, ' / admissão ', DATE_FORMAT(f.data_admissao, '%d/%m/%Y')) AS subtitulo,
        f.id_funcionario AS referenciaId,
        '/dashboard/rh/funcionarios' AS rota
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.status_cadastro_rh = 'PENDENTE_ENDOSSO'
        ${fLot.sql}
      ORDER BY f.created_at ASC
      LIMIT 5
      `,
      [current.tenantId, ...fLot.params]
    );

    const [presencas]: any = await db.query(
      `
      SELECT
        'PRESENCA_REJEITADA' AS tipo,
        CONCAT('Ficha rejeitada pelo RH #', p.id_presenca) AS titulo,
        CONCAT('Data ', DATE_FORMAT(p.data_referencia, '%d/%m/%Y'), ' / motivo: ', COALESCE(p.motivo_rejeicao_rh, '-')) AS subtitulo,
        p.id_presenca AS referenciaId,
        '/dashboard/rh/presencas' AS rota
      FROM presencas_cabecalho p
      WHERE p.tenant_id = ?
        AND p.status_presenca = 'REJEITADA_RH'
        ${fPres.sql}
      ORDER BY p.updated_at DESC
      LIMIT 5
      `,
      [current.tenantId, ...fPres.params]
    );

    const [he]: any = await db.query(
      `
      SELECT
        'HE_PENDENTE' AS tipo,
        CONCAT('Hora extra pendente: ', f.nome_completo) AS titulo,
        CONCAT(he.status_he, ' / ', DATE_FORMAT(he.data_referencia, '%d/%m/%Y')) AS subtitulo,
        he.id_hora_extra AS referenciaId,
        '/dashboard/rh/horas-extras' AS rota
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios f ON f.id_funcionario = he.id_funcionario
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
      WHERE he.tenant_id = ?
        AND he.status_he IN ('SOLICITADA', 'AUTORIZADA')
        ${fLot.sql}
      ORDER BY he.data_referencia ASC
      LIMIT 5
      `,
      [current.tenantId, ...fLot.params]
    );

    const [trein]: any = await db.query(
      `
      SELECT
        'TREINAMENTO_VENCIDO' AS tipo,
        CONCAT('Treinamento vencido: ', COALESCE(f.nome_completo, tt.nome_completo)) AS titulo,
        CONCAT(tm.nome_treinamento, ' / validade ', DATE_FORMAT(p.validade_ate, '%d/%m/%Y')) AS subtitulo,
        p.id_treinamento_participante AS referenciaId,
        '/dashboard/sst/treinamentos' AS rota
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      INNER JOIN sst_treinamentos_modelos tm ON tm.id_treinamento_modelo = t.id_treinamento_modelo
      LEFT JOIN funcionarios f ON f.id_funcionario = p.id_funcionario
      LEFT JOIN terceirizados_trabalhadores tt ON tt.id_terceirizado_trabalhador = p.id_terceirizado_trabalhador
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
        ${fTrein.sql}
      ORDER BY p.validade_ate ASC
      LIMIT 5
      `,
      [current.tenantId, ...fTrein.params]
    );

    return ok([...(cadastros as any[]), ...(presencas as any[]), ...(he as any[]), ...(trein as any[])].slice(0, 20));
  } catch (e) {
    return handleApiError(e);
  }
}

