import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function obterProfissionalSstDoUsuario(tenantId: number, idFuncionario: number | null) {
  if (!idFuncionario) return null;
  const [rows]: any = await db.query(
    `
    SELECT id_sst_profissional
    FROM sst_profissionais
    WHERE tenant_id = ? AND id_funcionario = ? AND ativo = 1
    `,
    [tenantId, idFuncionario]
  );
  return rows[0] || null;
}

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_VIEW);

    const [rows]: any = await db.query(
      `
      SELECT
        e.id_execucao_checklist id,
        e.id_modelo_checklist idModeloChecklist,
        m.nome_modelo nomeModelo,
        e.tipo_local tipoLocal,
        e.id_obra idObra,
        e.id_unidade idUnidade,
        e.data_referencia dataReferencia,
        e.status_execucao statusExecucao,
        f.nome_completo executorNome,
        e.abrange_terceirizados abrangeTerceirizados
      FROM sst_checklists_execucoes e
      INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = e.id_modelo_checklist
      INNER JOIN sst_profissionais sp ON sp.id_sst_profissional = e.id_sst_profissional_executor
      INNER JOIN funcionarios f ON f.id_funcionario = sp.id_funcionario
      WHERE e.tenant_id = ?
      ORDER BY e.data_referencia DESC, e.id_execucao_checklist DESC
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
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_EXECUTAR);
    const body = await req.json();

    if (!body.idModeloChecklist || !body.tipoLocal || !body.dataReferencia) {
      return fail(422, 'Modelo, local e data são obrigatórios');
    }

    const profissional = await obterProfissionalSstDoUsuario(current.tenantId, current.idFuncionario || null);
    if (!profissional) return fail(403, 'Usuário não é profissional SST ativo');

    const [aloc]: any = await db.query(
      `
      SELECT id_sst_alocacao
      FROM sst_profissionais_alocacoes
      WHERE id_sst_profissional = ?
        AND atual = 1
        AND (
          (? = 'OBRA' AND tipo_local = 'OBRA' AND id_obra = ?)
          OR
          (? = 'UNIDADE' AND tipo_local = 'UNIDADE' AND id_unidade = ?)
        )
      `,
      [profissional.id_sst_profissional, body.tipoLocal, body.idObra || 0, body.tipoLocal, body.idUnidade || 0]
    );
    if (!aloc.length) return fail(403, 'Profissional SST não está alocado neste local');

    const [modeloRows]: any = await db.query(
      `
      SELECT *
      FROM sst_checklists_modelos
      WHERE id_modelo_checklist = ? AND tenant_id = ? AND ativo = 1
      `,
      [body.idModeloChecklist, current.tenantId]
    );
    if (!modeloRows.length) return fail(404, 'Modelo não encontrado');

    const modelo = modeloRows[0];
    if (modelo.tipo_local_permitido !== 'AMBOS' && modelo.tipo_local_permitido !== body.tipoLocal) {
      return fail(422, 'Modelo não permitido para este tipo de local');
    }

    const abrangeTerceirizados =
      body.abrangeTerceirizados === null || body.abrangeTerceirizados === undefined
        ? modelo.abrange_terceirizados
          ? 1
          : 0
        : body.abrangeTerceirizados
          ? 1
          : 0;

    const [result]: any = await db.query(
      `
      INSERT INTO sst_checklists_execucoes
      (tenant_id, id_modelo_checklist, tipo_local, id_obra, id_unidade,
       data_referencia, status_execucao, id_sst_profissional_executor, id_usuario_executor,
       abrange_terceirizados, id_funcionario_responsavel_ciencia, observacao)
      VALUES (?, ?, ?, ?, ?, ?, 'EM_PREENCHIMENTO', ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        body.idModeloChecklist,
        body.tipoLocal,
        body.idObra || null,
        body.idUnidade || null,
        body.dataReferencia,
        profissional.id_sst_profissional,
        current.id,
        abrangeTerceirizados,
        body.idFuncionarioResponsavelCiencia || null,
        body.observacao || null,
      ]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
