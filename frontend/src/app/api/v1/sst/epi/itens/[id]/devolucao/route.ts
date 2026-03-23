import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_DEVOLUCAO);
    const body = await req.json();
    const { id } = await params;
    const idItem = Number(id);

    if (!body.dataDevolucao) return fail(422, 'Data de devolução obrigatória');

    const [[item]]: any = await db.query(
      `
      SELECT i.id_ficha_epi_item, f.tenant_id
      FROM sst_epi_fichas_itens i
      INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
      WHERE i.id_ficha_epi_item = ?
      LIMIT 1
      `,
      [idItem]
    );
    if (!item) return fail(404, 'Item não encontrado');
    if (Number(item.tenant_id) !== Number(current.tenantId)) return fail(403, 'Acesso negado');

    await db.query(
      `
      UPDATE sst_epi_fichas_itens
      SET status_item = 'DEVOLVIDO',
          data_devolucao = ?,
          quantidade_devolvida = ?,
          condicao_devolucao = ?,
          higienizado = ?,
          motivo_movimentacao = ?,
          observacao = ?
      WHERE id_ficha_epi_item = ?
      `,
      [
        body.dataDevolucao,
        body.quantidadeDevolvida || null,
        body.condicaoDevolucao || null,
        body.higienizado ? 1 : 0,
        body.motivoMovimentacao || null,
        body.observacao || null,
        idItem,
      ]
    );

    return ok({ id: idItem, status: 'DEVOLVIDO' });
  } catch (e) {
    return handleApiError(e);
  }
}
