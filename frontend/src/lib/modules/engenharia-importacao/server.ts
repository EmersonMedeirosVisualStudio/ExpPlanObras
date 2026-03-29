import { db } from '@/lib/db';

export async function ensureEngenhariaImportTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_materiais (
      id_material BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      grupo VARCHAR(64) NULL,
      categoria VARCHAR(64) NULL,
      preco_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
      estoque_minimo DECIMAL(12,2) NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_material),
      UNIQUE KEY uk_materiais_tenant_codigo (tenant_id, codigo),
      KEY idx_materiais_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_servicos (
      id_servico BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      grupo VARCHAR(64) NULL,
      preco_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_servico),
      UNIQUE KEY uk_servicos_tenant_codigo (tenant_id, codigo),
      KEY idx_servicos_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_composicoes (
      id_composicao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      codigo_servico VARCHAR(64) NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      bdi DECIMAL(8,4) NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_composicao),
      UNIQUE KEY uk_composicoes_tenant_codigo (tenant_id, codigo),
      KEY idx_composicoes_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_composicoes_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_composicao BIGINT UNSIGNED NOT NULL,
      etapa VARCHAR(120) NULL,
      tipo_item VARCHAR(16) NOT NULL,
      codigo_item VARCHAR(64) NOT NULL,
      quantidade DECIMAL(12,4) NOT NULL,
      perda_percentual DECIMAL(8,2) NOT NULL DEFAULT 0,
      codigo_centro_custo VARCHAR(40) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_itens_unique (tenant_id, id_composicao, tipo_item, codigo_item),
      KEY idx_itens_tenant (tenant_id),
      KEY idx_itens_composicao (id_composicao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(`ALTER TABLE engenharia_composicoes ADD COLUMN codigo_servico VARCHAR(64) NULL AFTER codigo`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_composicoes ADD KEY idx_composicoes_servico (tenant_id, codigo_servico)`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_composicoes_itens ADD COLUMN etapa VARCHAR(120) NULL AFTER id_composicao`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_composicoes_itens ADD COLUMN codigo_centro_custo VARCHAR(40) NULL AFTER perda_percentual`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_composicoes_itens ADD KEY idx_itens_cc (tenant_id, codigo_centro_custo)`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_composicoes_itens MODIFY etapa VARCHAR(120) NOT NULL DEFAULT ''`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_composicoes_itens DROP INDEX uk_itens_unique`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_composicoes_itens ADD UNIQUE KEY uk_itens_unique (tenant_id, id_composicao, etapa, tipo_item, codigo_item)`).catch(() => null);

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS auditoria_basica (
      id_auditoria BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_usuario BIGINT UNSIGNED NOT NULL,
      acao VARCHAR(64) NOT NULL,
      entidade VARCHAR(64) NOT NULL,
      resumo_json JSON NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_auditoria),
      KEY idx_auditoria_tenant (tenant_id),
      KEY idx_auditoria_entidade (entidade)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function auditBasica(args: { tenantId: number; userId: number; acao: string; entidade: string; resumo: any }) {
  await ensureEngenhariaImportTables();
  await db.query(`INSERT INTO auditoria_basica (tenant_id, id_usuario, acao, entidade, resumo_json) VALUES (?,?,?,?,?)`, [
    args.tenantId,
    args.userId,
    args.acao,
    args.entidade,
    JSON.stringify(args.resumo ?? null),
  ]);
}

