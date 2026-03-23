import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_EXECUTAR);
    const { id } = await params;
    const idExecucao = Number(id);
    const body = await req.json();
    if (!Array.isArray(body.itens)) return fail(422, 'Lista de itens obrigatória');

    const [execRows]: any = await conn.query(`SELECT * FROM sst_checklists_execucoes WHERE id_execucao_checklist = ? AND tenant_id = ?`, [
      idExecucao,
      current.tenantId,
    ]);
    if (!execRows.length) return fail(404, 'Execução não encontrada');
    if (execRows[0].status_execucao !== 'EM_PREENCHIMENTO') {
      return fail(422, 'Execução não pode ser alterada');
    }

    await conn.beginTransaction();

    for (const item of body.itens) {
      const geraNc = item.conformeFlag === 0 && item.geraNcQuandoReprovado ? 1 : 0;

      await conn.query(
        `
        INSERT INTO sst_checklists_execucoes_itens
        (id_execucao_checklist, id_modelo_item, resposta_valor, conforme_flag, observacao, gera_nc)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          resposta_valor = VALUES(resposta_valor),
          conforme_flag = VALUES(conforme_flag),
          observacao = VALUES(observacao),
          gera_nc = VALUES(gera_nc)
        `,
        [idExecucao, item.idModeloItem, item.respostaValor || null, item.conformeFlag ?? null, item.observacao || null, geraNc]
      );
    }

    await conn.commit();
    return ok({ id: idExecucao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
