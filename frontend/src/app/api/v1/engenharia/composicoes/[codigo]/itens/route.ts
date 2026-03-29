import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function norm(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { codigo } = await params;
    const codigoComposicao = norm(codigo);
    if (!codigoComposicao) return fail(422, 'codigoComposicao inválido');

    await ensureEngenhariaImportTables();

    const [[comp]]: any = await db.query(`SELECT id_composicao AS idComposicao, codigo, codigo_servico AS codigoServico, descricao, unidade, bdi FROM engenharia_composicoes WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [
      current.tenantId,
      codigoComposicao,
    ]);
    if (!comp) return fail(404, 'Composição não encontrada');

    const [rows]: any = await db.query(
      `
      SELECT
        id_item AS idItem,
        etapa,
        tipo_item AS tipoItem,
        codigo_item AS codigoItem,
        quantidade,
        perda_percentual AS perdaPercentual,
        codigo_centro_custo AS codigoCentroCusto
      FROM engenharia_composicoes_itens
      WHERE tenant_id = ? AND id_composicao = ?
      ORDER BY etapa ASC, tipo_item ASC, codigo_item ASC
      `,
      [current.tenantId, Number(comp.idComposicao)]
    );

    return ok({
      composicao: {
        codigo: String(comp.codigo),
        codigoServico: comp.codigoServico ? String(comp.codigoServico) : null,
        descricao: String(comp.descricao),
        unidade: String(comp.unidade),
        bdi: comp.bdi == null ? 0 : Number(comp.bdi),
      },
      itens: (rows as any[]).map((r) => ({
        idItem: Number(r.idItem),
        etapa: r.etapa ? String(r.etapa) : '',
        tipoItem: String(r.tipoItem),
        codigoItem: String(r.codigoItem),
        quantidade: r.quantidade == null ? null : Number(r.quantidade),
        perdaPercentual: r.perdaPercentual == null ? 0 : Number(r.perdaPercentual),
        codigoCentroCusto: r.codigoCentroCusto ? String(r.codigoCentroCusto) : null,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { codigo } = await params;
    const codigoComposicao = norm(codigo);
    if (!codigoComposicao) return fail(422, 'codigoComposicao inválido');

    await ensureEngenhariaImportTables();

    const [[comp]]: any = await conn.query(`SELECT id_composicao AS idComposicao FROM engenharia_composicoes WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [
      current.tenantId,
      codigoComposicao,
    ]);
    if (!comp) return fail(404, 'Composição não encontrada');

    const body = await req.json().catch(() => null);
    const itens = Array.isArray(body?.itens) ? body.itens : [];
    if (!itens.length) return fail(422, 'itens é obrigatório');

    await conn.beginTransaction();
    for (const it of itens) {
      const etapa = String(it?.etapa || '').trim();
      const tipoItem = norm(it?.tipoItem);
      const codigoItem = norm(it?.codigoItem);
      const quantidade = toNumber(it?.quantidade);
      const perdaPercentual = it?.perdaPercentual == null ? 0 : toNumber(it.perdaPercentual);
      const codigoCentroCusto = it?.codigoCentroCusto == null ? null : norm(it.codigoCentroCusto);
      if (!tipoItem || !codigoItem) continue;
      if (!Number.isFinite(quantidade) || quantidade < 0) continue;

      await conn.query(
        `
        INSERT INTO engenharia_composicoes_itens
          (tenant_id, id_composicao, etapa, tipo_item, codigo_item, quantidade, perda_percentual, codigo_centro_custo)
        VALUES
          (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          quantidade = VALUES(quantidade),
          perda_percentual = VALUES(perda_percentual),
          codigo_centro_custo = VALUES(codigo_centro_custo),
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          current.tenantId,
          Number(comp.idComposicao),
          etapa,
          tipoItem,
          codigoItem,
          quantidade,
          Number.isNaN(perdaPercentual) ? 0 : perdaPercentual,
          codigoCentroCusto,
        ]
      );
    }
    await conn.commit();

    return ok({ codigoComposicao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

