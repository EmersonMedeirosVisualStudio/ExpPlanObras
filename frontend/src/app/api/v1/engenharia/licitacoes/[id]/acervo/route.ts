import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function safeEnsure(sql: string) {
  try {
    await db.query(sql);
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || code === 'ER_DUP_KEYNAME') return;
    if (msg.includes('Duplicate column name') || msg.includes('Duplicate key name')) return;
    throw e;
  }
}

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_licitacoes (
      id_licitacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      titulo VARCHAR(220) NOT NULL,
      orgao_contratante VARCHAR(180) NULL,
      objeto TEXT NULL,
      status ENUM('PREVISTA','EM_ANALISE','EM_PREPARACAO','PARTICIPANDO','AGUARDANDO_RESULTADO','ENCERRADA','VENCIDA','DESISTIDA') NOT NULL DEFAULT 'EM_ANALISE',
      fase VARCHAR(120) NULL,
      data_abertura DATE NULL,
      data_encerramento DATE NULL,
      id_orcamento BIGINT UNSIGNED NULL,
      responsavel_nome VARCHAR(180) NULL,
      portal_url VARCHAR(500) NULL,
      observacoes TEXT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_licitacao),
      KEY idx_tenant (tenant_id),
      KEY idx_status (tenant_id, status),
      KEY idx_ativo (tenant_id, ativo),
      KEY idx_orc (tenant_id, id_orcamento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN orgao_contratante VARCHAR(180) NULL AFTER titulo`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN objeto TEXT NULL AFTER orgao_contratante`);
  await safeEnsure(
    `ALTER TABLE engenharia_licitacoes ADD COLUMN status ENUM('PREVISTA','EM_ANALISE','EM_PREPARACAO','PARTICIPANDO','AGUARDANDO_RESULTADO','ENCERRADA','VENCIDA','DESISTIDA') NOT NULL DEFAULT 'EM_ANALISE' AFTER objeto`
  );
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN fase VARCHAR(120) NULL AFTER status`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN data_abertura DATE NULL AFTER fase`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN data_encerramento DATE NULL AFTER data_abertura`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN id_orcamento BIGINT UNSIGNED NULL AFTER data_encerramento`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN responsavel_nome VARCHAR(180) NULL AFTER id_orcamento`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN portal_url VARCHAR(500) NULL AFTER responsavel_nome`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN observacoes TEXT NULL AFTER portal_url`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER observacoes`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER ativo`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER criado_em`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN id_usuario_criador BIGINT UNSIGNED NOT NULL AFTER atualizado_em`);

  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_tenant (tenant_id)`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_status (tenant_id, status)`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_ativo (tenant_id, ativo)`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_orc (tenant_id, id_orcamento)`);

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_acervos_empresa (
      id_acervo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      titulo VARCHAR(180) NOT NULL,
      descricao TEXT NULL,
      tipo ENUM('CAT','ATESTADO','OBRA_EXECUTADA') NOT NULL DEFAULT 'ATESTADO',
      numero_documento VARCHAR(80) NULL,
      orgao_emissor VARCHAR(140) NULL,
      data_emissao DATE NULL,
      nome_obra VARCHAR(180) NULL,
      contratante VARCHAR(180) NULL,
      local_obra VARCHAR(180) NULL,
      valor_obra DECIMAL(14,2) NULL,
      data_inicio DATE NULL,
      data_fim DATE NULL,
      categoria VARCHAR(80) NULL,
      subcategoria VARCHAR(80) NULL,
      porte_obra VARCHAR(40) NULL,
      id_documento_registro BIGINT UNSIGNED NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_acervo),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_licitacoes_acervos (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_licitacao BIGINT UNSIGNED NOT NULL,
      id_acervo BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_vinc (tenant_id, id_licitacao, id_acervo),
      KEY idx_tenant (tenant_id),
      KEY idx_licitacao (tenant_id, id_licitacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const [[l]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_licitacoes WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1 LIMIT 1`, [
      current.tenantId,
      idLicitacao,
    ]);
    if (!l) return fail(404, 'Licitação não encontrada');

    const [rows]: any = await db.query(
      `
      SELECT
        a.id_acervo AS idAcervo,
        a.titulo,
        a.tipo,
        a.numero_documento AS numeroDocumento,
        a.orgao_emissor AS orgaoEmissor,
        a.data_emissao AS dataEmissao,
        a.nome_obra AS nomeObra,
        a.categoria,
        a.id_documento_registro AS idDocumentoRegistro
      FROM engenharia_licitacoes_acervos v
      INNER JOIN engenharia_acervos_empresa a
        ON a.tenant_id = v.tenant_id AND a.id_acervo = v.id_acervo
      WHERE v.tenant_id = ? AND v.id_licitacao = ? AND a.ativo = 1
      ORDER BY a.tipo ASC, a.titulo ASC
      `,
      [current.tenantId, idLicitacao]
    );

    return ok(
      (rows as any[]).map((r) => ({
        idAcervo: Number(r.idAcervo),
        titulo: String(r.titulo),
        tipo: String(r.tipo),
        numeroDocumento: r.numeroDocumento ? String(r.numeroDocumento) : null,
        orgaoEmissor: r.orgaoEmissor ? String(r.orgaoEmissor) : null,
        dataEmissao: r.dataEmissao ? String(r.dataEmissao) : null,
        nomeObra: r.nomeObra ? String(r.nomeObra) : null,
        categoria: r.categoria ? String(r.categoria) : null,
        idDocumentoRegistro: r.idDocumentoRegistro == null ? null : Number(r.idDocumentoRegistro),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const body = await req.json().catch(() => null);
    const idAcervo = Number(body?.idAcervo || 0);
    if (!idAcervo) return fail(422, 'idAcervo é obrigatório');

    const [[l]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_licitacoes WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1 LIMIT 1`, [
      current.tenantId,
      idLicitacao,
    ]);
    if (!l) return fail(404, 'Licitação não encontrada');

    const [[a]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_acervos_empresa WHERE tenant_id = ? AND id_acervo = ? AND ativo = 1 LIMIT 1`, [
      current.tenantId,
      idAcervo,
    ]);
    if (!a) return fail(404, 'Acervo não encontrado');

    await db.query(
      `
      INSERT INTO engenharia_licitacoes_acervos (tenant_id, id_licitacao, id_acervo, id_usuario_criador)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE id_usuario_criador = id_usuario_criador
      `,
      [current.tenantId, idLicitacao, idAcervo, current.id]
    );

    return ok({ idAcervo });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    const idAcervo = Number(req.nextUrl.searchParams.get('idAcervo') || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');
    if (!idAcervo) return fail(422, 'idAcervo é obrigatório');

    await ensureTables();

    await db.query(`DELETE FROM engenharia_licitacoes_acervos WHERE tenant_id = ? AND id_licitacao = ? AND id_acervo = ?`, [current.tenantId, idLicitacao, idAcervo]);
    return ok({ removed: true });
  } catch (e) {
    return handleApiError(e);
  }
}
