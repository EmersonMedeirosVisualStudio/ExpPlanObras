import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

async function obterProfissionalSstDoUsuario(tenantId: number, idFuncionario: number | null) {
  if (!idFuncionario) return null;
  const [rows]: any = await db.query(
    `SELECT id_sst_profissional FROM sst_profissionais WHERE tenant_id = ? AND id_funcionario = ? AND ativo = 1`,
    [tenantId, idFuncionario]
  );
  return rows[0] || null;
}

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_VIEW);

    const [rows]: any = await db.query(
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
        a.status_acidente statusAcidente,
        a.cat_aplicavel catAplicavel,
        a.cat_registrada catRegistrada,
        a.gerou_nc gerouNc,
        a.id_nc_gerada idNcGerada
      FROM sst_acidentes a
      WHERE a.tenant_id = ?
      ORDER BY a.data_hora_ocorrencia DESC, a.id_acidente DESC
      `,
      [current.tenantId]
    );

    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_CRUD);
    const body = await req.json();

    const profissional = await obterProfissionalSstDoUsuario(current.tenantId, current.idFuncionario || null);
    if (!profissional) return fail(403, 'Usuário não é profissional SST ativo');

    if (!body.tipoLocal || !body.tipoOcorrencia || !body.severidade || !body.dataHoraOcorrencia || !body.descricaoOcorrencia) {
      return fail(422, 'Campos obrigatórios não informados');
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_acidentes
      (tenant_id, codigo_ocorrencia, tipo_local, id_obra, id_unidade,
       tipo_ocorrencia, severidade, data_hora_ocorrencia, local_detalhado,
       descricao_ocorrencia, atendimento_imediato,
       houve_remocao_medica, houve_internacao, houve_afastamento, fatalidade,
       cat_aplicavel, cat_registrada, justificativa_sem_cat, status_acidente,
       id_sst_profissional_abertura, id_usuario_abertura, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTO', ?, ?, ?)
      `,
      [
        current.tenantId,
        body.codigoOcorrencia || null,
        body.tipoLocal,
        body.idObra || null,
        body.idUnidade || null,
        body.tipoOcorrencia,
        body.severidade,
        body.dataHoraOcorrencia,
        body.localDetalhado || null,
        body.descricaoOcorrencia,
        body.atendimentoImediato || null,
        body.houveRemocaoMedica ? 1 : 0,
        body.houveInternacao ? 1 : 0,
        body.houveAfastamento ? 1 : 0,
        body.fatalidade ? 1 : 0,
        body.catAplicavel === false ? 0 : 1,
        0,
        body.justificativaSemCat || null,
        profissional.id_sst_profissional,
        current.id,
        body.observacao || null,
      ]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
