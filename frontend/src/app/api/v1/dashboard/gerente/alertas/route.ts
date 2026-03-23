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

    const fSolic = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 's.id_obra_origem', 's.id_unidade_origem');
    const fNc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'nc.id_obra', 'nc.id_unidade');
    const fAc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'a.id_obra', 'a.id_unidade');
    const fTrein = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 't.id_obra', 't.id_unidade');

    const [solicitacoes]: any = await db.query(
      `SELECT
          'SOLICITACAO_URGENTE' AS tipo,
          CONCAT('Solicitação urgente #', s.id_solicitacao_material) AS titulo,
          CONCAT('Status ', s.status_solicitacao, ' / ', s.regime_urgencia) AS subtitulo,
          s.id_solicitacao_material AS referenciaId,
          '/dashboard/suprimentos/solicitacoes' AS rota
       FROM solicitacao_material s
       WHERE s.tenant_id = ?
         AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
         AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
         ${fSolic.sql}
       ORDER BY s.created_at DESC
       LIMIT 5`,
      [current.tenantId, ...fSolic.params]
    );

    const [ncs]: any = await db.query(
      `SELECT
          'NC_ABERTA' AS tipo,
          CONCAT('NC: ', nc.titulo) AS titulo,
          CONCAT('Severidade ', nc.severidade, ' / prazo ', COALESCE(DATE_FORMAT(nc.prazo_correcao, '%d/%m/%Y'), '-')) AS subtitulo,
          nc.id_nc AS referenciaId,
          '/dashboard/sst/nao-conformidades' AS rota
       FROM sst_nao_conformidades nc
       WHERE nc.tenant_id = ?
         AND nc.status_nc IN ('ABERTA', 'EM_TRATAMENTO', 'AGUARDANDO_VALIDACAO')
         ${fNc.sql}
       ORDER BY nc.severidade DESC, nc.created_at DESC
       LIMIT 5`,
      [current.tenantId, ...fNc.params]
    );

    const [acidentes]: any = await db.query(
      `SELECT
          'ACIDENTE_ABERTO' AS tipo,
          CONCAT('Ocorrência SST: ', a.tipo_ocorrencia) AS titulo,
          CONCAT('Status ', a.status_acidente, ' / ', DATE_FORMAT(a.data_hora_ocorrencia, '%d/%m/%Y %H:%i')) AS subtitulo,
          a.id_acidente AS referenciaId,
          '/dashboard/sst/acidentes' AS rota
       FROM sst_acidentes a
       WHERE a.tenant_id = ?
         AND a.status_acidente IN ('ABERTO', 'EM_INVESTIGACAO', 'AGUARDANDO_VALIDACAO')
         ${fAc.sql}
       ORDER BY a.data_hora_ocorrencia DESC
       LIMIT 5`,
      [current.tenantId, ...fAc.params]
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

    return ok([...(solicitacoes as any[]), ...(ncs as any[]), ...(acidentes as any[]), ...(trein as any[])].slice(0, 20));
  } catch (e) {
    return handleApiError(e);
  }
}
