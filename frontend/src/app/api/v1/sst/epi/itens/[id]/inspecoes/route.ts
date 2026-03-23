import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_INSPECAO);
    const body = await req.json();
    const idItem = Number(params.id);

    if (!body.dataInspecao) return fail(422, 'dataInspecao é obrigatória');
    const resultado = String(body.resultado || '').trim().toUpperCase();
    if (!['APROVADO', 'REPROVADO'].includes(resultado)) return fail(422, 'resultado inválido');

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

    const [result]: any = await db.query(
      `
      INSERT INTO sst_epi_inspecoes
      (id_ficha_epi_item, data_inspecao, resultado, observacao, id_usuario_responsavel)
      VALUES (?, ?, ?, ?, ?)
      `,
      [idItem, body.dataInspecao, resultado, body.observacao || null, current.id]
    );

    return ok({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}

