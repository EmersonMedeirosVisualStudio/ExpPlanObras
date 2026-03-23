import { db } from '@/lib/db';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_CRUD);
    const { id } = await context.params;
    const idEpi = Number(id);
    if (!Number.isFinite(idEpi)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();

    const codigo = body?.codigo ? String(body.codigo).trim() : null;
    const nomeEpi = String(body?.nomeEpi || '').trim();
    const categoriaEpi = String(body?.categoriaEpi || '').trim();
    const caNumero = body?.caNumero ? String(body.caNumero).trim() : null;
    const caValidade = body?.caValidade ? String(body.caValidade).trim() : null;
    const fabricante = body?.fabricante ? String(body.fabricante).trim() : null;
    const tamanhoControlado = body?.tamanhoControlado ? 1 : 0;
    const vidaUtilDias = body?.vidaUtilDias === null || body?.vidaUtilDias === undefined ? null : Number(body.vidaUtilDias);
    const periodicidadeInspecaoDias =
      body?.periodicidadeInspecaoDias === null || body?.periodicidadeInspecaoDias === undefined ? null : Number(body.periodicidadeInspecaoDias);
    const ativo = body?.ativo === false ? 0 : 1;

    if (!nomeEpi) throw new ApiError(422, 'nomeEpi é obrigatório');
    if (!categoriaEpi) throw new ApiError(422, 'categoriaEpi é obrigatório');

    const [[before]]: any = await db.query(`SELECT id_epi FROM sst_epi_catalogo WHERE tenant_id = ? AND id_epi = ? LIMIT 1`, [current.tenantId, idEpi]);
    if (!before) throw new ApiError(404, 'EPI não encontrado');

    await db.query(
      `
      UPDATE sst_epi_catalogo
      SET
        codigo = ?,
        nome_epi = ?,
        categoria_epi = ?,
        ca_numero = ?,
        ca_validade = ?,
        fabricante = ?,
        tamanho_controlado = ?,
        vida_util_dias = ?,
        periodicidade_inspecao_dias = ?,
        ativo = ?
      WHERE tenant_id = ? AND id_epi = ?
      `,
      [codigo, nomeEpi, categoriaEpi, caNumero, caValidade, fabricante, tamanhoControlado, vidaUtilDias, periodicidadeInspecaoDias, ativo, current.tenantId, idEpi]
    );

    return ok({ id: idEpi });
  } catch (e) {
    return handleApiError(e);
  }
}

