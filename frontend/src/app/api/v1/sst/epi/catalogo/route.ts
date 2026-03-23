import { db } from '@/lib/db';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_VIEW);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const where: string[] = ['tenant_id = ?'];
    const params: any[] = [current.tenantId];

    if (q) {
      where.push(`(nome_epi LIKE ? OR categoria_epi LIKE ? OR codigo LIKE ? OR ca_numero LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_epi id,
        codigo,
        nome_epi nomeEpi,
        categoria_epi categoriaEpi,
        ca_numero caNumero,
        ca_validade caValidade,
        fabricante,
        tamanho_controlado tamanhoControlado,
        vida_util_dias vidaUtilDias,
        periodicidade_inspecao_dias periodicidadeInspecaoDias,
        ativo
      FROM sst_epi_catalogo
      WHERE ${where.join(' AND ')}
      ORDER BY nome_epi
      LIMIT 500
      `,
      params
    );

    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_CRUD);
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

    const [result]: any = await db.query(
      `
      INSERT INTO sst_epi_catalogo
        (tenant_id, codigo, nome_epi, categoria_epi, ca_numero, ca_validade, fabricante, tamanho_controlado, vida_util_dias, periodicidade_inspecao_dias, ativo)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [current.tenantId, codigo, nomeEpi, categoriaEpi, caNumero, caValidade, fabricante, tamanhoControlado, vidaUtilDias, periodicidadeInspecaoDias, ativo]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}

