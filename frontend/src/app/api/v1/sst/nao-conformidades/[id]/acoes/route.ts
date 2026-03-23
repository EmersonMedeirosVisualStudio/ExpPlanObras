import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_NC_TRATAR);
    const { id } = await params;
    const idNc = Number(id);
    const body = await req.json();

    if (!body.descricaoAcao || !body.tipoResponsavel) {
      return fail(422, 'Descrição e responsável são obrigatórios');
    }

    const [ncRows]: any = await db.query(`SELECT * FROM sst_nao_conformidades WHERE id_nc = ? AND tenant_id = ?`, [idNc, current.tenantId]);
    if (!ncRows.length) return fail(404, 'NC não encontrada');
    if (['CONCLUIDA', 'CANCELADA'].includes(ncRows[0].status_nc)) {
      return fail(422, 'NC encerrada/cancelada não aceita novas ações');
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_nao_conformidades_acoes
      (id_nc, ordem_acao, descricao_acao, tipo_responsavel,
       id_responsavel_funcionario, id_empresa_parceira, id_terceirizado_trabalhador,
       prazo_acao, status_acao, id_usuario_cadastro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?)
      `,
      [
        idNc,
        body.ordemAcao || 0,
        body.descricaoAcao,
        body.tipoResponsavel,
        body.idResponsavelFuncionario || null,
        body.idEmpresaParceira || null,
        body.idTerceirizadoTrabalhador || null,
        body.prazoAcao || null,
        current.id,
      ]
    );

    await db.query(`UPDATE sst_nao_conformidades SET status_nc = 'EM_TRATAMENTO' WHERE id_nc = ? AND tenant_id = ? AND status_nc = 'ABERTA'`, [
      idNc,
      current.tenantId,
    ]);

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
