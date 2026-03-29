import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      descricao_servico VARCHAR(220) NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade_contratada DECIMAL(14,4) NULL,
      preco_unitario DECIMAL(14,6) NULL,
      valor_total DECIMAL(14,6) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_obra, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE obras_planilhas_itens ADD COLUMN codigo_composicao VARCHAR(64) NULL AFTER codigo_servico`).catch(() => null);

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NOT NULL,
      origem ENUM('SUGERIDO','MANUAL') NOT NULL DEFAULT 'SUGERIDO',
      justificativa TEXT NULL,
      id_usuario_criador BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, id_obra, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_servico (tenant_id, id_obra, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NOT NULL,
      id_equipe_padrao BIGINT UNSIGNED NULL,
      produtividade_prevista DECIMAL(14,6) NULL,
      custo_unitario_previsto DECIMAL(14,6) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      justificativa TEXT NULL,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico),
      KEY idx_cc (tenant_id, codigo_centro_custo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idObra = Number(id || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureEngenhariaImportTables();
    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_item AS idItem,
        codigo_servico AS codigoServico,
        codigo_composicao AS codigoComposicao,
        descricao_servico AS descricaoServico,
        unidade_medida AS unidadeMedida,
        quantidade_contratada AS quantidadeContratada,
        preco_unitario AS precoUnitario,
        valor_total AS valorTotal
      FROM obras_planilhas_itens
      WHERE tenant_id = ? AND id_obra = ?
      ORDER BY codigo_servico ASC
      `,
      [current.tenantId, idObra]
    );

    return ok(
      (rows as any[]).map((r) => ({
        idItem: Number(r.idItem),
        codigoServico: String(r.codigoServico),
        codigoComposicao: r.codigoComposicao ? String(r.codigoComposicao) : null,
        descricaoServico: r.descricaoServico ? String(r.descricaoServico) : null,
        unidadeMedida: r.unidadeMedida ? String(r.unidadeMedida) : null,
        quantidadeContratada: r.quantidadeContratada == null ? null : Number(r.quantidadeContratada),
        precoUnitario: r.precoUnitario == null ? null : Number(r.precoUnitario),
        valorTotal: r.valorTotal == null ? null : Number(r.valorTotal),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idObra = Number(id || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureEngenhariaImportTables();
    await ensureTables();

    const body = await req.json().catch(() => null);
    const codigoServico = normServico(body?.codigoServico);
    const descricaoServico = body?.descricaoServico ? String(body.descricaoServico).trim() : null;
    const unidadeMedida = body?.unidadeMedida ? String(body.unidadeMedida).trim() : null;
    const quantidadeContratada = body?.quantidadeContratada == null ? null : toNumber(body.quantidadeContratada);
    const precoUnitario = body?.precoUnitario == null ? null : toNumber(body.precoUnitario);
    const valorTotal =
      quantidadeContratada != null && precoUnitario != null && Number.isFinite(quantidadeContratada) && Number.isFinite(precoUnitario)
        ? Number((quantidadeContratada * precoUnitario).toFixed(6))
        : body?.valorTotal == null
          ? null
          : toNumber(body.valorTotal);

    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');

    await conn.beginTransaction();

    const [[comp]]: any = await conn.query(
      `
      SELECT codigo
      FROM engenharia_composicoes
      WHERE tenant_id = ? AND codigo_servico = ? AND ativo = 1
      ORDER BY codigo
      LIMIT 1
      `,
      [current.tenantId, codigoServico]
    );
    const codigoComposicao = comp?.codigo ? String(comp.codigo) : null;

    const [ins]: any = await conn.query(
      `
      INSERT INTO obras_planilhas_itens
        (tenant_id, id_obra, codigo_servico, codigo_composicao, descricao_servico, unidade_medida, quantidade_contratada, preco_unitario, valor_total, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        codigo_composicao = VALUES(codigo_composicao),
        descricao_servico = VALUES(descricao_servico),
        unidade_medida = VALUES(unidade_medida),
        quantidade_contratada = VALUES(quantidade_contratada),
        preco_unitario = VALUES(preco_unitario),
        valor_total = VALUES(valor_total),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [
        current.tenantId,
        idObra,
        codigoServico,
        codigoComposicao,
        descricaoServico,
        unidadeMedida,
        quantidadeContratada == null || Number.isNaN(quantidadeContratada) ? null : quantidadeContratada,
        precoUnitario == null || Number.isNaN(precoUnitario) ? null : precoUnitario,
        valorTotal == null || Number.isNaN(valorTotal) ? null : valorTotal,
        current.id,
      ]
    );

    await conn.commit();

    return ok({ idItem: Number(ins.insertId || 0), codigoServico, codigoComposicao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
