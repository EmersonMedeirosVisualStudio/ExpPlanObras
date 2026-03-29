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
    CREATE TABLE IF NOT EXISTS engenharia_licitacoes_recursos (
      id_recurso BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_licitacao BIGINT UNSIGNED NOT NULL,
      tipo ENUM('IMPUGNACAO','ESCLARECIMENTO','RECURSO_ADMINISTRATIVO','CONTRARRAZOES') NOT NULL,
      fase VARCHAR(120) NULL,
      status ENUM('RASCUNHO','ENVIADO','EM_ANALISE','DEFERIDO','INDEFERIDO','ENCERRADO') NOT NULL DEFAULT 'RASCUNHO',
      data_envio DATE NULL,
      prazo_resposta DATE NULL,
      protocolo VARCHAR(120) NULL,
      descricao TEXT NULL,
      id_documento_registro BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_recurso),
      KEY idx_tenant (tenant_id),
      KEY idx_licitacao (tenant_id, id_licitacao),
      KEY idx_status (tenant_id, id_licitacao, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  const allowed = ['IMPUGNACAO', 'ESCLARECIMENTO', 'RECURSO_ADMINISTRATIVO', 'CONTRARRAZOES'];
  return allowed.includes(s) ? s : null;
}

function normStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  const allowed = ['RASCUNHO', 'ENVIADO', 'EM_ANALISE', 'DEFERIDO', 'INDEFERIDO', 'ENCERRADO'];
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
        r.id_recurso AS idRecurso,
        r.tipo,
        r.fase,
        r.status,
        r.data_envio AS dataEnvio,
        r.prazo_resposta AS prazoResposta,
        r.protocolo,
        r.descricao,
        r.id_documento_registro AS idDocumentoRegistro,
        dr.id_versao_atual AS idVersaoAtual
      FROM engenharia_licitacoes_recursos r
      LEFT JOIN documentos_registros dr
        ON dr.tenant_id = r.tenant_id AND dr.id_documento_registro = r.id_documento_registro
      WHERE r.tenant_id = ? AND r.id_licitacao = ?
      ORDER BY r.atualizado_em DESC, r.id_recurso DESC
      LIMIT 500
      `,
      [current.tenantId, idLicitacao]
    );

    return ok(
      (rows as any[]).map((r) => ({
        idRecurso: Number(r.idRecurso),
        tipo: String(r.tipo),
        fase: r.fase ? String(r.fase) : null,
        status: String(r.status),
        dataEnvio: r.dataEnvio ? String(r.dataEnvio) : null,
        prazoResposta: r.prazoResposta ? String(r.prazoResposta) : null,
        protocolo: r.protocolo ? String(r.protocolo) : null,
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
    const tipo = normTipo(body?.tipo);
    const fase = body?.fase ? String(body.fase).trim() : null;
    const status = normStatus(body?.status) || 'RASCUNHO';
    const dataEnvio = normalizeDate(body?.dataEnvio);
    const prazoResposta = normalizeDate(body?.prazoResposta);
    const protocolo = body?.protocolo ? String(body.protocolo).trim() : null;
    const descricao = body?.descricao ? String(body.descricao).trim() : null;

    if (!tipo) return fail(422, 'tipo é obrigatório');

    await conn.beginTransaction();

    const doc = await criarDocumento(current.tenantId, current.id, {
      categoriaDocumento: `LICITACAO_RECURSO_${tipo}`,
      tituloDocumento: `${tipo}${fase ? ` - ${fase}` : ''}`.slice(0, 180),
      descricaoDocumento: descricao,
      entidadeTipo: 'LICITACAO',
      entidadeId: idLicitacao,
    });
    const idDocumentoRegistro = Number((doc as any).id);

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_licitacoes_recursos
        (tenant_id, id_licitacao, tipo, fase, status, data_envio, prazo_resposta, protocolo, descricao, id_documento_registro, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        idLicitacao,
        tipo,
        fase,
        status,
        dataEnvio,
        prazoResposta,
        protocolo,
        descricao,
        idDocumentoRegistro,
        current.id,
      ]
    );

    await conn.commit();
    return ok({ idRecurso: Number(ins.insertId), idDocumentoRegistro });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const body = await req.json().catch(() => null);
    const idRecurso = Number(body?.idRecurso || 0);
    if (!idRecurso) return fail(422, 'idRecurso é obrigatório');

    const status = body?.status != null ? normStatus(body.status) : undefined;
    const dataEnvio = body?.dataEnvio !== undefined ? normalizeDate(body.dataEnvio) : undefined;
    const prazoResposta = body?.prazoResposta !== undefined ? normalizeDate(body.prazoResposta) : undefined;
    const protocolo = body?.protocolo !== undefined ? String(body.protocolo || '').trim() : undefined;
    const fase = body?.fase !== undefined ? String(body.fase || '').trim() : undefined;

    if (status !== undefined && status == null) return fail(422, 'status inválido');

    const sets: string[] = [];
    const paramsSql: any[] = [];
    if (status !== undefined) {
      sets.push('status = ?');
      paramsSql.push(status);
    }
    if (fase !== undefined) {
      sets.push('fase = ?');
      paramsSql.push(fase || null);
    }
    if (dataEnvio !== undefined) {
      sets.push('data_envio = ?');
      paramsSql.push(dataEnvio);
    }
    if (prazoResposta !== undefined) {
      sets.push('prazo_resposta = ?');
      paramsSql.push(prazoResposta);
    }
    if (protocolo !== undefined) {
      sets.push('protocolo = ?');
      paramsSql.push(protocolo || null);
    }
    if (!sets.length) return ok({ updated: false });

    await db.query(
      `
      UPDATE engenharia_licitacoes_recursos
      SET ${sets.join(', ')}, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_licitacao = ? AND id_recurso = ?
      LIMIT 1
      `,
      [...paramsSql, current.tenantId, idLicitacao, idRecurso]
    );

    return ok({ updated: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    const idRecurso = Number(req.nextUrl.searchParams.get('idRecurso') || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');
    if (!idRecurso) return fail(422, 'idRecurso é obrigatório');

    await ensureTables();
    await db.query(`DELETE FROM engenharia_licitacoes_recursos WHERE tenant_id = ? AND id_licitacao = ? AND id_recurso = ?`, [current.tenantId, idLicitacao, idRecurso]);
    return ok({ removed: true });
  } catch (e) {
    return handleApiError(e);
  }
}
