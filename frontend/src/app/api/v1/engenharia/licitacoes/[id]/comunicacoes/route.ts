import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarDocumento } from '@/lib/modules/documentos/server';

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
    CREATE TABLE IF NOT EXISTS engenharia_licitacoes_comunicacoes (
      id_comunicacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_licitacao BIGINT UNSIGNED NOT NULL,
      direcao ENUM('ENVIADO','RECEBIDO') NOT NULL,
      canal ENUM('EMAIL','PORTAL','OFICIO','WHATSAPP','OUTRO') NOT NULL DEFAULT 'EMAIL',
      data_referencia DATE NOT NULL,
      assunto VARCHAR(220) NOT NULL,
      descricao TEXT NULL,
      id_documento_registro BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_comunicacao),
      KEY idx_tenant (tenant_id),
      KEY idx_licitacao (tenant_id, id_licitacao, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normDirecao(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'RECEBIDO' ? 'RECEBIDO' : s === 'ENVIADO' ? 'ENVIADO' : null;
}

function normCanal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  const allowed = ['EMAIL', 'PORTAL', 'OFICIO', 'WHATSAPP', 'OUTRO'];
  return allowed.includes(s) ? s : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        c.id_comunicacao AS idComunicacao,
        c.direcao,
        c.canal,
        c.data_referencia AS dataReferencia,
        c.assunto,
        c.descricao,
        c.id_documento_registro AS idDocumentoRegistro,
        r.id_versao_atual AS idVersaoAtual
      FROM engenharia_licitacoes_comunicacoes c
      LEFT JOIN documentos_registros r
        ON r.tenant_id = c.tenant_id AND r.id_documento_registro = c.id_documento_registro
      WHERE c.tenant_id = ? AND c.id_licitacao = ?
      ORDER BY c.data_referencia DESC, c.id_comunicacao DESC
      LIMIT 500
      `,
      [current.tenantId, idLicitacao]
    );

    return ok(
      (rows as any[]).map((r) => ({
        idComunicacao: Number(r.idComunicacao),
        direcao: String(r.direcao),
        canal: String(r.canal),
        dataReferencia: String(r.dataReferencia),
        assunto: String(r.assunto),
        descricao: r.descricao ? String(r.descricao) : null,
        idDocumentoRegistro: r.idDocumentoRegistro == null ? null : Number(r.idDocumentoRegistro),
        downloadUrl: r.idVersaoAtual ? `/api/v1/documentos/versoes/${Number(r.idVersaoAtual)}/download?tipo=PDF_FINAL` : null,
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
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const body = await req.json().catch(() => null);
    const direcao = normDirecao(body?.direcao);
    const canal = normCanal(body?.canal) || 'EMAIL';
    const dataReferencia = normalizeDate(body?.dataReferencia);
    const assunto = String(body?.assunto || '').trim();
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const criarDocumentoFlag = body?.criarDocumento === false ? false : true;

    if (!direcao) return fail(422, 'direcao é obrigatória');
    if (!dataReferencia) return fail(422, 'dataReferencia é obrigatória');
    if (!assunto) return fail(422, 'assunto é obrigatório');

    await conn.beginTransaction();

    let idDocumentoRegistro: number | null = null;
    if (criarDocumentoFlag) {
      const doc = await criarDocumento(current.tenantId, current.id, {
        categoriaDocumento: `LICITACAO_${direcao}_${canal}`,
        tituloDocumento: `${assunto}`.slice(0, 180),
        descricaoDocumento: descricao,
        entidadeTipo: 'LICITACAO',
        entidadeId: idLicitacao,
      });
      idDocumentoRegistro = Number((doc as any).id);
    }

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_licitacoes_comunicacoes
        (tenant_id, id_licitacao, direcao, canal, data_referencia, assunto, descricao, id_documento_registro, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, idLicitacao, direcao, canal, dataReferencia, assunto.slice(0, 220), descricao, idDocumentoRegistro, current.id]
    );

    await conn.commit();
    return ok({ idComunicacao: Number(ins.insertId), idDocumentoRegistro });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    const idComunicacao = Number(req.nextUrl.searchParams.get('idComunicacao') || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');
    if (!idComunicacao) return fail(422, 'idComunicacao é obrigatório');

    await ensureTables();
    await db.query(`DELETE FROM engenharia_licitacoes_comunicacoes WHERE tenant_id = ? AND id_licitacao = ? AND id_comunicacao = ?`, [
      current.tenantId,
      idLicitacao,
      idComunicacao,
    ]);
    return ok({ removed: true });
  } catch (e) {
    return handleApiError(e);
  }
}
