import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureOrcamentoTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos (
      id_orcamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      nome VARCHAR(180) NOT NULL,
      tipo ENUM('LICITACAO','CONTRATO_PRIVADO') NOT NULL DEFAULT 'CONTRATO_PRIVADO',
      data_base_label VARCHAR(120) NULL,
      referencia_base VARCHAR(120) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_orcamento),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

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

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_servicos (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      referencia VARCHAR(120) NULL,
      preco_base DECIMAL(14,6) NOT NULL DEFAULT 0,
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

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_composicoes (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      codigo_servico VARCHAR(64) NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      bdi DECIMAL(8,4) NOT NULL DEFAULT 0,
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

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_composicoes_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo_composicao VARCHAR(64) NOT NULL,
      etapa VARCHAR(120) NOT NULL DEFAULT '',
      tipo_item VARCHAR(16) NOT NULL,
      codigo_item VARCHAR(64) NOT NULL,
      quantidade DECIMAL(14,6) NOT NULL DEFAULT 0,
      perda_percentual DECIMAL(8,2) NOT NULL DEFAULT 0,
      codigo_centro_custo VARCHAR(40) NULL,
      origem ENUM('COPIADO','IMPORTADO','MANUAL') NOT NULL DEFAULT 'COPIADO',
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_orcamento, id_versao, codigo_composicao, etapa, tipo_item, codigo_item),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento, id_versao),
      KEY idx_comp (tenant_id, id_orcamento, id_versao, codigo_composicao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idOrcamento = Number(id || 0);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) return fail(422, 'idOrcamento inválido');

    await ensureEngenhariaImportTables();
    await ensureOrcamentoTables();

    const [[orc]]: any = await conn.query(`SELECT id_orcamento AS id FROM engenharia_orcamentos WHERE tenant_id = ? AND id_orcamento = ? AND ativo = 1 LIMIT 1`, [
      current.tenantId,
      idOrcamento,
    ]);
    if (!orc) return fail(404, 'Orçamento não encontrado');

    const [[v]]: any = await conn.query(
      `SELECT id_versao AS idVersao FROM engenharia_orcamentos_versoes WHERE tenant_id = ? AND id_orcamento = ? ORDER BY numero_versao DESC LIMIT 1`,
      [current.tenantId, idOrcamento]
    );
    if (!v?.idVersao) return fail(422, 'Orçamento sem versão');
    const idVersao = Number(v.idVersao);

    await conn.beginTransaction();

    await conn.query(`DELETE FROM engenharia_orcamentos_composicoes_itens WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ?`, [
      current.tenantId,
      idOrcamento,
      idVersao,
    ]);
    await conn.query(`DELETE FROM engenharia_orcamentos_composicoes WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ?`, [
      current.tenantId,
      idOrcamento,
      idVersao,
    ]);
    await conn.query(`DELETE FROM engenharia_orcamentos_servicos WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ?`, [current.tenantId, idOrcamento, idVersao]);
    await conn.query(`DELETE FROM engenharia_orcamentos_insumos WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ?`, [current.tenantId, idOrcamento, idVersao]);

    await conn.query(
      `
      INSERT INTO engenharia_orcamentos_insumos
        (tenant_id, id_orcamento, id_versao, codigo, descricao, unidade, custo_base, preco_atual, origem, id_usuario_atualizador)
      SELECT
        m.tenant_id, ?, ?, m.codigo, m.descricao, m.unidade, m.preco_unitario, m.preco_unitario, 'COPIADO', ?
      FROM engenharia_materiais m
      WHERE m.tenant_id = ? AND m.ativo = 1
      `,
      [idOrcamento, idVersao, current.id, current.tenantId]
    );

    await conn.query(
      `
      INSERT INTO engenharia_orcamentos_servicos
        (tenant_id, id_orcamento, id_versao, codigo, descricao, unidade, referencia, preco_base, preco_atual, origem, id_usuario_atualizador)
      SELECT
        s.tenant_id, ?, ?, s.codigo, s.descricao, s.unidade, NULL, s.preco_unitario, s.preco_unitario, 'COPIADO', ?
      FROM engenharia_servicos s
      WHERE s.tenant_id = ? AND s.ativo = 1
      `,
      [idOrcamento, idVersao, current.id, current.tenantId]
    );

    await conn.query(
      `
      INSERT INTO engenharia_orcamentos_composicoes
        (tenant_id, id_orcamento, id_versao, codigo, codigo_servico, descricao, unidade, bdi, origem, id_usuario_atualizador)
      SELECT
        c.tenant_id, ?, ?, c.codigo, c.codigo_servico, c.descricao, c.unidade, c.bdi, 'COPIADO', ?
      FROM engenharia_composicoes c
      WHERE c.tenant_id = ? AND c.ativo = 1
      `,
      [idOrcamento, idVersao, current.id, current.tenantId]
    );

    await conn.query(
      `
      INSERT INTO engenharia_orcamentos_composicoes_itens
        (tenant_id, id_orcamento, id_versao, codigo_composicao, etapa, tipo_item, codigo_item, quantidade, perda_percentual, codigo_centro_custo, origem, id_usuario_atualizador)
      SELECT
        c.tenant_id,
        ?,
        ?,
        c.codigo,
        i.etapa,
        i.tipo_item,
        i.codigo_item,
        i.quantidade,
        i.perda_percentual,
        i.codigo_centro_custo,
        'COPIADO',
        ?
      FROM engenharia_composicoes c
      INNER JOIN engenharia_composicoes_itens i
        ON i.tenant_id = c.tenant_id AND i.id_composicao = c.id_composicao
      WHERE c.tenant_id = ? AND c.ativo = 1
      `,
      [idOrcamento, idVersao, current.id, current.tenantId]
    );

    await conn.commit();
    return ok({ idOrcamento, idVersao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

