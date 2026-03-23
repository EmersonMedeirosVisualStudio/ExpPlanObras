import { db } from '@/lib/db';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_DEVOLUCAO);
    const { id } = await context.params;
    const idItem = Number(id);
    if (!Number.isFinite(idItem)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();
    const dataDevolucao = String(body?.dataDevolucao || '').trim();
    const quantidadeDevolvida = body?.quantidadeDevolvida === null || body?.quantidadeDevolvida === undefined ? null : Number(body.quantidadeDevolvida);
    const condicaoDevolucao = body?.condicaoDevolucao ? String(body.condicaoDevolucao).trim() : null;
    const higienizado = body?.higienizado ? 1 : 0;
    const statusItem = body?.statusItem ? String(body.statusItem).trim().toUpperCase() : 'DEVOLVIDO';
    const motivoMovimentacao = body?.motivoMovimentacao ? String(body.motivoMovimentacao).trim() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!dataDevolucao) throw new ApiError(422, 'dataDevolucao é obrigatória');

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
    if (!item) throw new ApiError(404, 'Item não encontrado');
    if (Number(item.tenant_id) !== Number(current.tenantId)) throw new ApiError(403, 'Acesso negado');

    await db.query(
      `
      UPDATE sst_epi_fichas_itens
      SET
        status_item = ?,
        data_devolucao = ?,
        quantidade_devolvida = ?,
        condicao_devolucao = ?,
        higienizado = ?,
        motivo_movimentacao = ?,
        observacao = ?
      WHERE id_ficha_epi_item = ?
      `,
      [statusItem, dataDevolucao, quantidadeDevolvida, condicaoDevolucao, higienizado, motivoMovimentacao, observacao, idItem]
    );

    return ok({ id: idItem });
  } catch (e) {
    return handleApiError(e);
  }
}

