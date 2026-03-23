import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_VIEW);
    const id = Number(params.id);

    const [headRows]: any = await db.query(
      `
      SELECT
        a.id_acidente id,
        a.codigo_ocorrencia codigoOcorrencia,
        a.tipo_local tipoLocal,
        a.id_obra idObra,
        a.id_unidade idUnidade,
        a.tipo_ocorrencia tipoOcorrencia,
        a.severidade,
        a.data_hora_ocorrencia dataHoraOcorrencia,
        a.local_detalhado localDetalhado,
        a.descricao_ocorrencia descricaoOcorrencia,
        a.atendimento_imediato atendimentoImediato,
        a.houve_remocao_medica houveRemocaoMedica,
        a.houve_internacao houveInternacao,
        a.houve_afastamento houveAfastamento,
        a.fatalidade fatalidade,
        a.cat_aplicavel catAplicavel,
        a.cat_registrada catRegistrada,
        a.justificativa_sem_cat justificativaSemCat,
        a.status_acidente statusAcidente,
        a.data_inicio_investigacao dataInicioInvestigacao,
        a.data_conclusao_investigacao dataConclusaoInvestigacao,
        a.data_validacao dataValidacao,
        a.parecer_validacao parecerValidacao,
        a.gerou_nc gerouNc,
        a.id_nc_gerada idNcGerada,
        a.observacao
      FROM sst_acidentes a
      WHERE a.id_acidente = ? AND a.tenant_id = ?
      `,
      [id, current.tenantId]
    );
    if (!headRows.length) return fail(404, 'Ocorrência não encontrada');

    const [envolvidos]: any = await db.query(
      `
      SELECT
        e.id_acidente_envolvido id,
        e.tipo_envolvido tipoEnvolvido,
        e.id_funcionario idFuncionario,
        e.id_terceirizado_trabalhador idTerceirizadoTrabalhador,
        COALESCE(f.nome_completo, t.nome_completo, e.nome_externo) nomeEnvolvido,
        e.nome_externo nomeExterno,
        e.empresa_externa empresaExterna,
        e.principal_envolvido principalEnvolvido,
        e.funcao_informada funcaoInformada,
        e.tipo_lesao tipoLesao,
        e.parte_corpo parteCorpo,
        e.descricao_lesao descricaoLesao,
        e.epi_em_uso epiEmUso,
        e.epi_adequado epiAdequado,
        e.atendimento_medico atendimentoMedico,
        e.nome_unidade_saude nomeUnidadeSaude,
        e.afastamento_dias_previstos afastamentoDiasPrevistos
      FROM sst_acidentes_envolvidos e
      LEFT JOIN funcionarios f
        ON f.id_funcionario = e.id_funcionario
       AND f.tenant_id = ?
      LEFT JOIN terceirizados_trabalhadores t
        ON t.id_terceirizado_trabalhador = e.id_terceirizado_trabalhador
       AND t.tenant_id = ?
      WHERE e.id_acidente = ?
      ORDER BY e.principal_envolvido DESC, nomeEnvolvido
      `,
      [current.tenantId, current.tenantId, id]
    );

    const [testemunhas]: any = await db.query(
      `
      SELECT
        t.id_testemunha id,
        t.tipo_testemunha tipoTestemunha,
        t.id_funcionario idFuncionario,
        t.id_terceirizado_trabalhador idTerceirizadoTrabalhador,
        t.nome_externo nomeExterno,
        t.contato,
        t.relato_resumido relatoResumido
      FROM sst_acidentes_testemunhas t
      WHERE t.id_acidente = ?
      ORDER BY t.id_testemunha
      `,
      [id]
    );

    const [investigacoes]: any = await db.query(
      `
      SELECT
        id_investigacao id,
        metodologia,
        causas_imediatas causasImediatas,
        causas_raiz causasRaiz,
        fatores_contribuintes fatoresContribuintes,
        medidas_imediatas medidasImediatas,
        recomendacoes,
        conclusao,
        data_inicio dataInicio,
        data_conclusao dataConclusao
      FROM sst_acidentes_investigacoes
      WHERE id_acidente = ?
      LIMIT 1
      `,
      [id]
    );

    const [cats]: any = await db.query(
      `
      SELECT
        id_cat id,
        tipo_cat tipoCat,
        numero_cat numeroCat,
        data_emissao dataEmissao,
        emitida_por_tipo emitidaPorTipo,
        id_empresa_parceira idEmpresaParceira,
        protocolo,
        arquivo_pdf_url arquivoPdfUrl,
        observacao,
        status_cat statusCat
      FROM sst_acidentes_cat
      WHERE id_acidente = ?
      ORDER BY id_cat DESC
      `,
      [id]
    );

    const investigacao = investigacoes.length ? investigacoes[0] : null;
    return ok({ ...headRows[0], envolvidos, testemunhas, investigacao, cats });
  } catch (e) {
    return handleApiError(e);
  }
}
