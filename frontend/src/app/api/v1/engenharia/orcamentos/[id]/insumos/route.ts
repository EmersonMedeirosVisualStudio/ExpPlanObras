import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_versoes (
      id_versao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      numero_versao INT NOT NULL,
      titulo_versao VARCHAR(180) NULL,
      status ENUM('RASCUNHO','CONGELADO') NOT NULL DEFAULT 'RASCUNHO',
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_versao),
      UNIQUE KEY uk_orcamento_versao (tenant_id, id_orcamento, numero_versao),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_insumos (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      custo_base DECIMAL(14,6) NOT NULL DEFAULT 0,
      preco_compra_min DECIMAL(14,6) NULL,
      preco_compra_max DECIMAL(14,6) NULL,
      preco_venda_min DECIMAL(14,6) NULL,
      preco_venda_max DECIMAL(14,6) NULL,
      preco_atual DECIMAL(14,6) NOT NULL DEFAULT 0,
      origem ENUM('COPIADO','IMPORTADO','MANUAL') NOT NULL DEFAULT 'COPIADO',
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_orcamento, id_versao, codigo),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento, id_versao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idOrcamento = Number(id || 0);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) return fail(422, 'idOrcamento inválido');

    await ensureTables();

    const idVersao = req.nextUrl.searchParams.get('idVersao') ? Number(req.nextUrl.searchParams.get('idVersao')) : null;
    const [[v]]: any = idVersao
      ? await db.query(
          `SELECT id_versao AS idVersao FROM engenharia_orcamentos_versoes WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ? LIMIT 1`,
          [current.tenantId, idOrcamento, idVersao]
        )
      : await db.query(
          `SELECT id_versao AS idVersao FROM engenharia_orcamentos_versoes WHERE tenant_id = ? AND id_orcamento = ? ORDER BY numero_versao DESC LIMIT 1`,
          [current.tenantId, idOrcamento]
        );
    if (!v?.idVersao) return ok([]);

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const where: string[] = ['tenant_id = ?', 'id_orcamento = ?', 'id_versao = ?'];
    const paramsSql: any[] = [current.tenantId, idOrcamento, Number(v.idVersao)];
    if (q) {
      where.push('(LOWER(codigo) LIKE ? OR LOWER(descricao) LIKE ?)');
      paramsSql.push(`%${q}%`, `%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        codigo,
        descricao,
        unidade,
        custo_base AS custoBase,
        preco_compra_min AS precoCompraMin,
        preco_compra_max AS precoCompraMax,
        preco_venda_min AS precoVendaMin,
        preco_venda_max AS precoVendaMax,
        preco_atual AS precoAtual
      FROM engenharia_orcamentos_insumos
      WHERE ${where.join(' AND ')}
      ORDER BY codigo ASC
      LIMIT 2000
      `,
      paramsSql
    );

    return ok(
      (rows as any[]).map((r) => ({
        codigo: String(r.codigo),
        descricao: String(r.descricao),
        unidade: String(r.unidade),
        custoBase: r.custoBase == null ? 0 : Number(r.custoBase),
        precoCompraMin: r.precoCompraMin == null ? null : Number(r.precoCompraMin),
        precoCompraMax: r.precoCompraMax == null ? null : Number(r.precoCompraMax),
        precoVendaMin: r.precoVendaMin == null ? null : Number(r.precoVendaMin),
        precoVendaMax: r.precoVendaMax == null ? null : Number(r.precoVendaMax),
        precoAtual: r.precoAtual == null ? 0 : Number(r.precoAtual),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idOrcamento = Number(id || 0);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) return fail(422, 'idOrcamento inválido');

    await ensureTables();

    const body = await req.json().catch(() => null);
    const idVersao = Number(body?.idVersao || 0);
    const codigo = String(body?.codigo || '').trim().toUpperCase();
    if (!idVersao) return fail(422, 'idVersao é obrigatório');
    if (!codigo) return fail(422, 'codigo é obrigatório');

    const patch = {
      precoCompraMin: body?.precoCompraMin == null ? null : toNumber(body.precoCompraMin),
      precoCompraMax: body?.precoCompraMax == null ? null : toNumber(body.precoCompraMax),
      precoVendaMin: body?.precoVendaMin == null ? null : toNumber(body.precoVendaMin),
      precoVendaMax: body?.precoVendaMax == null ? null : toNumber(body.precoVendaMax),
      precoAtual: body?.precoAtual == null ? null : toNumber(body.precoAtual),
    };

    await conn.query(
      `
      UPDATE engenharia_orcamentos_insumos
      SET
        preco_compra_min = ?,
        preco_compra_max = ?,
        preco_venda_min = ?,
        preco_venda_max = ?,
        preco_atual = COALESCE(?, preco_atual),
        origem = 'MANUAL',
        id_usuario_atualizador = ?
      WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ? AND codigo = ?
      LIMIT 1
      `,
      [
        patch.precoCompraMin == null || Number.isNaN(patch.precoCompraMin) ? null : patch.precoCompraMin,
        patch.precoCompraMax == null || Number.isNaN(patch.precoCompraMax) ? null : patch.precoCompraMax,
        patch.precoVendaMin == null || Number.isNaN(patch.precoVendaMin) ? null : patch.precoVendaMin,
        patch.precoVendaMax == null || Number.isNaN(patch.precoVendaMax) ? null : patch.precoVendaMax,
        patch.precoAtual == null || Number.isNaN(patch.precoAtual) ? null : patch.precoAtual,
        current.id,
        current.tenantId,
        idOrcamento,
        idVersao,
        codigo,
      ]
    );

    return ok({ codigo });
  } catch (e) {
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

