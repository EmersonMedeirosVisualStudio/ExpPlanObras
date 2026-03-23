import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_CRUD);
    const idAcidente = Number(params.id);
    const body = await req.json();

    if (!body.tipoEnvolvido) return fail(422, 'Tipo do envolvido obrigatório');
    if (body.tipoEnvolvido === 'FUNCIONARIO' && !body.idFuncionario) return fail(422, 'Funcionário obrigatório');
    if (body.tipoEnvolvido === 'TERCEIRIZADO' && !body.idTerceirizadoTrabalhador) return fail(422, 'Terceirizado obrigatório');
    if (body.tipoEnvolvido === 'EXTERNO' && !body.nomeExterno) return fail(422, 'Nome externo obrigatório');

    const [rows]: any = await db.query(`SELECT id_acidente FROM sst_acidentes WHERE id_acidente = ? AND tenant_id = ?`, [idAcidente, current.tenantId]);
    if (!rows.length) return fail(404, 'Ocorrência não encontrada');

    const [result]: any = await db.query(
      `
      INSERT INTO sst_acidentes_envolvidos
      (id_acidente, tipo_envolvido, id_funcionario, id_terceirizado_trabalhador, nome_externo, empresa_externa,
       principal_envolvido, funcao_informada, tipo_lesao, parte_corpo, descricao_lesao,
       epi_em_uso, epi_adequado, atendimento_medico, nome_unidade_saude, afastamento_dias_previstos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        idAcidente,
        body.tipoEnvolvido,
        body.idFuncionario || null,
        body.idTerceirizadoTrabalhador || null,
        body.nomeExterno || null,
        body.empresaExterna || null,
        body.principalEnvolvido ? 1 : 0,
        body.funcaoInformada || null,
        body.tipoLesao || null,
        body.parteCorpo || null,
        body.descricaoLesao || null,
        body.epiEmUso ? 1 : 0,
        body.epiAdequado === null || body.epiAdequado === undefined ? null : body.epiAdequado ? 1 : 0,
        body.atendimentoMedico ? 1 : 0,
        body.nomeUnidadeSaude || null,
        body.afastamentoDiasPrevistos || null,
      ]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
