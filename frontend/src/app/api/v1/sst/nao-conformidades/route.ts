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
    const current = await requireApiPermission(PERMISSIONS.SST_NC_VIEW);

    const [rows]: any = await db.query(
      `
      SELECT nc.id_nc AS id,
             nc.codigo_nc AS codigoNc,
             nc.tipo_local AS tipoLocal,
             nc.id_obra AS idObra,
             nc.id_unidade AS idUnidade,
             nc.origem_tipo AS origemTipo,
             nc.titulo,
             nc.descricao,
             nc.severidade,
             nc.risco_potencial AS riscoPotencial,
             nc.status_nc AS statusNc,
             nc.exige_interdicao AS exigeInterdicao,
             nc.interdicao_aplicada AS interdicaoAplicada,
             nc.envolve_terceirizada AS envolveTerceirizada,
             nc.id_empresa_parceira AS idEmpresaParceira,
             nc.data_identificacao AS dataIdentificacao,
             nc.prazo_correcao AS prazoCorrecao,
             nc.observacao
      FROM sst_nao_conformidades nc
      WHERE nc.tenant_id = ?
      ORDER BY nc.created_at DESC, nc.id_nc DESC
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
    const current = await requireApiPermission(PERMISSIONS.SST_NC_CRUD);
    const body = await req.json();

    const profissional = await obterProfissionalSstDoUsuario(current.tenantId, current.idFuncionario || null);
    if (!profissional) return fail(403, 'Usuário não é profissional SST ativo');

    if (!body.tipoLocal || !body.titulo || !body.descricao || !body.severidade || !body.dataIdentificacao) {
      return fail(422, 'Campos obrigatórios não informados');
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_nao_conformidades
      (tenant_id, codigo_nc, tipo_local, id_obra, id_unidade, origem_tipo,
       id_execucao_checklist_origem, id_execucao_item_origem, id_ocorrencia_origem,
       titulo, descricao, severidade, risco_potencial, status_nc,
       exige_interdicao, interdicao_aplicada, envolve_terceirizada, id_empresa_parceira,
       data_identificacao, prazo_correcao, id_sst_profissional_abertura, id_usuario_abertura, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        body.codigoNc || null,
        body.tipoLocal,
        body.idObra || null,
        body.idUnidade || null,
        body.origemTipo || 'AVULSA',
        body.idExecucaoChecklistOrigem || null,
        body.idExecucaoItemOrigem || null,
        body.idOcorrenciaOrigem || null,
        body.titulo,
        body.descricao,
        body.severidade,
        body.riscoPotencial || null,
        body.exigeInterdicao ? 1 : 0,
        body.interdicaoAplicada ? 1 : 0,
        body.envolveTerceirizada ? 1 : 0,
        body.idEmpresaParceira || null,
        body.dataIdentificacao,
        body.prazoCorrecao || null,
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

