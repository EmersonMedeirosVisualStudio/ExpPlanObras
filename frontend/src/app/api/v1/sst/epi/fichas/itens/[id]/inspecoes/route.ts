import { db } from '@/lib/db';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_INSPECAO);
    const { id } = await context.params;
    const idItem = Number(id);
    if (!Number.isFinite(idItem)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();
    const dataInspecao = String(body?.dataInspecao || '').trim();
    const resultado = String(body?.resultado || '').trim().toUpperCase();
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!dataInspecao) throw new ApiError(422, 'dataInspecao é obrigatória');
    if (!['APROVADO', 'REPROVADO'].includes(resultado)) throw new ApiError(422, 'resultado inválido');

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

    const [result]: any = await db.query(
      `
      INSERT INTO sst_epi_inspecoes
        (id_ficha_epi_item, data_inspecao, resultado, observacao, id_usuario_responsavel)
      VALUES
        (?, ?, ?, ?, ?)
      `,
      [idItem, dataInspecao, resultado, observacao, current.id]
    );

    return ok({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}

