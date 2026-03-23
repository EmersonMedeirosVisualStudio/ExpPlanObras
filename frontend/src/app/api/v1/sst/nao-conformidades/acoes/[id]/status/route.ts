import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_NC_TRATAR);
    const { id } = await params;
    const idAcao = Number(id);
    const body = await req.json();

    if (!body.statusAcao) return fail(422, 'Status da ação obrigatório');

    const [acaoRows]: any = await db.query(
      `
      SELECT a.id_nc_acao, nc.tenant_id
      FROM sst_nao_conformidades_acoes a
      INNER JOIN sst_nao_conformidades nc ON nc.id_nc = a.id_nc
      WHERE a.id_nc_acao = ?
      LIMIT 1
      `,
      [idAcao]
    );
    if (!acaoRows.length) return fail(404, 'Ação não encontrada');
    if (Number(acaoRows[0].tenant_id) !== Number(current.tenantId)) return fail(403, 'Acesso negado');

    await db.query(
      `
      UPDATE sst_nao_conformidades_acoes
      SET status_acao = ?,
          data_conclusao = CASE WHEN ? = 'CONCLUIDA' THEN NOW() ELSE NULL END,
          observacao_execucao = ?
      WHERE id_nc_acao = ?
      `,
      [body.statusAcao, body.statusAcao, body.observacaoExecucao || null, idAcao]
    );

    return ok({ id: idAcao, statusAcao: body.statusAcao });
  } catch (e) {
    return handleApiError(e);
  }
}
