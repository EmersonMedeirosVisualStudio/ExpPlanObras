import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idNc = Number(params.id);
    const body = await req.json();
    if (!body.acao) return fail(422, 'Ação obrigatória');

    if (body.acao === 'ENVIAR_VALIDACAO') {
      const current = await requireApiPermission(PERMISSIONS.SST_NC_TRATAR);

      const [pend]: any = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM sst_nao_conformidades_acoes
        WHERE id_nc = ? AND status_acao <> 'CONCLUIDA'
        `,
        [idNc]
      );

      if (pend[0].total > 0) return fail(422, 'Ainda existem ações pendentes');

      await db.query(`UPDATE sst_nao_conformidades SET status_nc = 'AGUARDANDO_VALIDACAO' WHERE id_nc = ? AND tenant_id = ?`, [
        idNc,
        current.tenantId,
      ]);

      return ok({ id: idNc, statusNc: 'AGUARDANDO_VALIDACAO' });
    }

    if (body.acao === 'VALIDAR_CONCLUSAO') {
      const current = await requireApiPermission(PERMISSIONS.SST_NC_VALIDAR);

      await db.query(
        `
        UPDATE sst_nao_conformidades
        SET status_nc = 'CONCLUIDA',
            data_validacao = NOW(),
            id_usuario_validacao = ?,
            parecer_validacao = ?,
            data_encerramento = NOW(),
            id_usuario_encerramento = ?
        WHERE id_nc = ? AND tenant_id = ?
        `,
        [current.id, body.parecerValidacao || null, current.id, idNc, current.tenantId]
      );

      return ok({ id: idNc, statusNc: 'CONCLUIDA' });
    }

    if (body.acao === 'REABRIR_TRATAMENTO') {
      const current = await requireApiPermission(PERMISSIONS.SST_NC_VALIDAR);

      await db.query(
        `
        UPDATE sst_nao_conformidades
        SET status_nc = 'EM_TRATAMENTO',
            parecer_validacao = ?
        WHERE id_nc = ? AND tenant_id = ?
        `,
        [body.parecerValidacao || 'Retornada para correção', idNc, current.tenantId]
      );

      return ok({ id: idNc, statusNc: 'EM_TRATAMENTO' });
    }

    if (body.acao === 'CANCELAR') {
      const current = await requireApiPermission(PERMISSIONS.SST_NC_ENCERRAR);

      await db.query(
        `
        UPDATE sst_nao_conformidades
        SET status_nc = 'CANCELADA',
            data_encerramento = NOW(),
            id_usuario_encerramento = ?,
            observacao = CONCAT(COALESCE(observacao, ''), '\nCancelamento: ', ?)
        WHERE id_nc = ? AND tenant_id = ?
        `,
        [current.id, body.motivo || 'Sem motivo informado', idNc, current.tenantId]
      );

      return ok({ id: idNc, statusNc: 'CANCELADA' });
    }

    return fail(422, 'Ação inválida');
  } catch (e) {
    return handleApiError(e);
  }
}
