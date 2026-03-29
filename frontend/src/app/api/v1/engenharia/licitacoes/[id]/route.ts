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

  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_tenant (tenant_id)`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_status (tenant_id, status)`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_ativo (tenant_id, ativo)`);
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD INDEX idx_orc (tenant_id, id_orcamento)`);
}

async function ensureOrcamentosTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos (
      id_orcamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      nome VARCHAR(180) NOT NULL,
      tipo ENUM('LICITACAO','CONTRATO_PRIVADO') NOT NULL DEFAULT 'CONTRATO_PRIVADO',
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id_orcamento),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  const allowed = ['PREVISTA', 'EM_ANALISE', 'EM_PREPARACAO', 'PARTICIPANDO', 'AGUARDANDO_RESULTADO', 'ENCERRADA', 'VENCIDA', 'DESISTIDA'];
  return allowed.includes(s) ? s : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const [[l]]: any = await db.query(
      `
      SELECT
        id_licitacao AS idLicitacao,
        titulo,
        orgao_contratante AS orgao,
        objeto,
        status,
        fase,
        data_abertura AS dataAbertura,
        data_encerramento AS dataEncerramento,
        id_orcamento AS idOrcamento,
        responsavel_nome AS responsavelNome,
        portal_url AS portalUrl,
        observacoes
      FROM engenharia_licitacoes
      WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1
      LIMIT 1
      `,
      [current.tenantId, idLicitacao]
    );
    if (!l) return fail(404, 'Licitação não encontrada');

    return ok({
      idLicitacao: Number(l.idLicitacao),
      titulo: String(l.titulo),
      orgao: l.orgao ? String(l.orgao) : null,
      objeto: l.objeto ? String(l.objeto) : null,
      status: String(l.status),
      fase: l.fase ? String(l.fase) : null,
      dataAbertura: l.dataAbertura ? String(l.dataAbertura) : null,
      dataEncerramento: l.dataEncerramento ? String(l.dataEncerramento) : null,
      idOrcamento: l.idOrcamento == null ? null : Number(l.idOrcamento),
      responsavelNome: l.responsavelNome ? String(l.responsavelNome) : null,
      portalUrl: l.portalUrl ? String(l.portalUrl) : null,
      observacoes: l.observacoes ? String(l.observacoes) : null,
    });
  } catch (e) {
    return handleApiError(e);
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
    const patch = {
      titulo: body?.titulo ? String(body.titulo).trim() : null,
      orgao: body?.orgao != null ? String(body.orgao).trim() : undefined,
      objeto: body?.objeto != null ? String(body.objeto).trim() : undefined,
      status: body?.status != null ? normStatus(body.status) : undefined,
      fase: body?.fase != null ? String(body.fase).trim() : undefined,
      dataAbertura: body?.dataAbertura != null ? normalizeDate(body.dataAbertura) : undefined,
      dataEncerramento: body?.dataEncerramento != null ? normalizeDate(body.dataEncerramento) : undefined,
      idOrcamento: body?.idOrcamento !== undefined ? (body.idOrcamento == null || body.idOrcamento === '' ? null : Number(body.idOrcamento)) : undefined,
      responsavelNome: body?.responsavelNome != null ? String(body.responsavelNome).trim() : undefined,
      portalUrl: body?.portalUrl != null ? String(body.portalUrl).trim() : undefined,
      observacoes: body?.observacoes != null ? String(body.observacoes).trim() : undefined,
    };

    if (patch.status !== undefined && patch.status == null) return fail(422, 'status inválido');
    if (patch.titulo != null && !patch.titulo) return fail(422, 'titulo inválido');
    if (patch.idOrcamento !== undefined && patch.idOrcamento != null && (!Number.isFinite(patch.idOrcamento) || patch.idOrcamento <= 0))
      return fail(422, 'idOrcamento inválido');

    if (patch.idOrcamento !== undefined && patch.idOrcamento != null) {
      await ensureOrcamentosTables();
      const [[o]]: any = await db.query(`SELECT tipo FROM engenharia_orcamentos WHERE tenant_id = ? AND id_orcamento = ? AND ativo = 1 LIMIT 1`, [
        current.tenantId,
        patch.idOrcamento,
      ]);
      if (!o) return fail(404, 'Orçamento não encontrado');
      if (String(o.tipo || '').toUpperCase() !== 'LICITACAO') return fail(422, 'Orçamento deve ser do tipo LICITACAO');
    }

    const sets: string[] = [];
    const paramsSql: any[] = [];

    if (patch.titulo != null) {
      sets.push('titulo = ?');
      paramsSql.push(patch.titulo.slice(0, 220));
    }
    if (patch.orgao !== undefined) {
      sets.push('orgao_contratante = ?');
      paramsSql.push(patch.orgao || null);
    }
    if (patch.objeto !== undefined) {
      sets.push('objeto = ?');
      paramsSql.push(patch.objeto || null);
    }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      paramsSql.push(patch.status);
    }
    if (patch.fase !== undefined) {
      sets.push('fase = ?');
      paramsSql.push(patch.fase || null);
    }
    if (patch.dataAbertura !== undefined) {
      sets.push('data_abertura = ?');
      paramsSql.push(patch.dataAbertura);
    }
    if (patch.dataEncerramento !== undefined) {
      sets.push('data_encerramento = ?');
      paramsSql.push(patch.dataEncerramento);
    }
    if (patch.idOrcamento !== undefined) {
      sets.push('id_orcamento = ?');
      paramsSql.push(patch.idOrcamento);
    }
    if (patch.responsavelNome !== undefined) {
      sets.push('responsavel_nome = ?');
      paramsSql.push(patch.responsavelNome || null);
    }
    if (patch.portalUrl !== undefined) {
      sets.push('portal_url = ?');
      paramsSql.push(patch.portalUrl || null);
    }
    if (patch.observacoes !== undefined) {
      sets.push('observacoes = ?');
      paramsSql.push(patch.observacoes || null);
    }

    if (!sets.length) return ok({ updated: false });

    await db.query(
      `
      UPDATE engenharia_licitacoes
      SET ${sets.join(', ')}, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1
      LIMIT 1
      `,
      [...paramsSql, current.tenantId, idLicitacao]
    );

    return ok({ updated: true });
  } catch (e) {
    return handleApiError(e);
  }
}
