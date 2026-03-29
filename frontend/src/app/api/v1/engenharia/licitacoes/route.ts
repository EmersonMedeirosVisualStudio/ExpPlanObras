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
  await safeEnsure(`ALTER TABLE engenharia_licitacoes ADD COLUMN responsavel_nome VARCHAR(180) NULL AFTER data_encerramento`);
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
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function ensureSaudeTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_licitacoes_checklist_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_licitacao BIGINT UNSIGNED NOT NULL,
      categoria VARCHAR(40) NOT NULL,
      nome VARCHAR(180) NOT NULL,
      obrigatorio TINYINT(1) NOT NULL DEFAULT 1,
      dias_alerta INT NOT NULL DEFAULT 30,
      ordem INT NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_item),
      KEY idx_tenant (tenant_id),
      KEY idx_licitacao (tenant_id, id_licitacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_documentos_empresa (
      id_documento_empresa BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      categoria VARCHAR(40) NOT NULL,
      nome VARCHAR(180) NOT NULL,
      data_validade DATE NULL,
      id_documento_registro BIGINT UNSIGNED NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id_documento_empresa),
      KEY idx_tenant (tenant_id),
      KEY idx_categoria (tenant_id, categoria)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_licitacoes_documentos (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_licitacao BIGINT UNSIGNED NOT NULL,
      id_documento_empresa BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_vinc (tenant_id, id_licitacao, id_documento_empresa),
      KEY idx_tenant (tenant_id),
      KEY idx_licitacao (tenant_id, id_licitacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_licitacoes_andamento_eventos (
      id_evento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_licitacao BIGINT UNSIGNED NOT NULL,
      data_evento DATE NOT NULL,
      tipo VARCHAR(40) NOT NULL,
      titulo VARCHAR(180) NOT NULL,
      descricao TEXT NULL,
      id_documento_registro BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_evento),
      KEY idx_tenant (tenant_id),
      KEY idx_licitacao (tenant_id, id_licitacao, data_evento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
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
      KEY idx_licitacao (tenant_id, id_licitacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function buildInClause(ids: number[]) {
  if (!ids.length) return { clause: '(NULL)', params: [] as any[] };
  return { clause: `(${ids.map(() => '?').join(',')})`, params: ids };
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const incluirSaude = req.nextUrl.searchParams.get('incluirSaude') === '1';
    const diasAlerta = req.nextUrl.searchParams.get('diasAlerta') ? Number(req.nextUrl.searchParams.get('diasAlerta')) : 30;
    const dias = Number.isFinite(diasAlerta) ? Math.max(0, diasAlerta) : 30;

    const [rows]: any = await db.query(
      `
      SELECT id_licitacao AS idLicitacao, titulo, orgao_contratante AS orgao, status, data_abertura AS dataAbertura, id_orcamento AS idOrcamento
      FROM engenharia_licitacoes
      WHERE tenant_id = ? AND ativo = 1
      ORDER BY id_licitacao DESC
      LIMIT 500
      `,
      [current.tenantId]
    );

    const base = (rows as any[]).map((r) => ({
      idLicitacao: Number(r.idLicitacao),
      titulo: String(r.titulo),
      orgao: r.orgao ? String(r.orgao) : null,
      status: String(r.status),
      dataAbertura: r.dataAbertura ? String(r.dataAbertura) : null,
      idOrcamento: r.idOrcamento == null ? null : Number(r.idOrcamento),
    }));

    if (!incluirSaude) return ok(base);

    await ensureSaudeTables();

    const ids = base.map((r) => r.idLicitacao).filter((n) => Number.isFinite(n) && n > 0);
    const saude = new Map<number, { criticos: number; alertas: number; infos: number }>();
    for (const idLicitacao of ids) saude.set(idLicitacao, { criticos: 0, alertas: 0, infos: 0 });

    const { clause: inClause, params: inParams } = buildInClause(ids);

    const [chkRows]: any = await db.query(
      `
      SELECT
        ci.id_licitacao AS idLicitacao,
        ci.obrigatorio,
        ci.dias_alerta AS diasAlerta,
        ci.categoria,
        COUNT(d.id_documento_empresa) AS qtdDocs,
        MAX(CASE WHEN v.id_documento_versao IS NULL THEN 0 ELSE 1 END) AS temArquivo,
        MAX(CASE WHEN d.data_validade IS NOT NULL AND DATEDIFF(d.data_validade, CURDATE()) < 0 THEN 1 ELSE 0 END) AS vencido,
        MAX(CASE WHEN d.data_validade IS NOT NULL AND DATEDIFF(d.data_validade, CURDATE()) BETWEEN 0 AND ci.dias_alerta THEN 1 ELSE 0 END) AS aVencer
      FROM engenharia_licitacoes_checklist_itens ci
      LEFT JOIN engenharia_licitacoes_documentos x
        ON x.tenant_id = ci.tenant_id AND x.id_licitacao = ci.id_licitacao
      LEFT JOIN engenharia_documentos_empresa d
        ON d.tenant_id = x.tenant_id AND d.id_documento_empresa = x.id_documento_empresa AND d.ativo = 1 AND UPPER(d.categoria) = UPPER(ci.categoria)
      LEFT JOIN documentos_registros r
        ON r.tenant_id = d.tenant_id AND r.id_documento_registro = d.id_documento_registro
      LEFT JOIN documentos_versoes v
        ON v.tenant_id = r.tenant_id AND v.id_documento_versao = r.id_versao_atual
        AND (v.conteudo_blob_pdf_carimbado IS NOT NULL OR v.conteudo_blob_original IS NOT NULL)
      WHERE ci.tenant_id = ? AND ci.ativo = 1 AND ci.id_licitacao IN ${inClause}
      GROUP BY ci.id_licitacao, ci.id_item
      `,
      [current.tenantId, ...inParams]
    );

    for (const r of chkRows as any[]) {
      const idLicitacao = Number(r.idLicitacao);
      const s = saude.get(idLicitacao);
      if (!s) continue;
      const obrigatorio = Number(r.obrigatorio || 0) ? true : false;
      const qtdDocs = Number(r.qtdDocs || 0);
      const temArquivo = Number(r.temArquivo || 0) ? true : false;
      const vencido = Number(r.vencido || 0) ? true : false;
      const aVencer = Number(r.aVencer || 0) ? true : false;

      if (!qtdDocs) {
        if (obrigatorio) s.criticos += 1;
        else s.infos += 1;
      } else if (!temArquivo) {
        if (obrigatorio) s.criticos += 1;
        else s.alertas += 1;
      }

      if (vencido) {
        if (obrigatorio) s.criticos += 1;
        else s.alertas += 1;
      } else if (aVencer) {
        s.alertas += 1;
      }
    }

    const [recRows]: any = await db.query(
      `
      SELECT
        id_licitacao AS idLicitacao,
        SUM(CASE WHEN prazo_resposta IS NOT NULL AND DATEDIFF(prazo_resposta, CURDATE()) < 0 THEN 1 ELSE 0 END) AS criticos,
        SUM(CASE WHEN prazo_resposta IS NOT NULL AND DATEDIFF(prazo_resposta, CURDATE()) BETWEEN 0 AND ? THEN 1 ELSE 0 END) AS alertas
      FROM engenharia_licitacoes_recursos
      WHERE tenant_id = ? AND id_licitacao IN ${inClause}
      GROUP BY id_licitacao
      `,
      [dias, current.tenantId, ...inParams]
    );
    for (const r of recRows as any[]) {
      const s = saude.get(Number(r.idLicitacao));
      if (!s) continue;
      s.criticos += Number(r.criticos || 0);
      s.alertas += Number(r.alertas || 0);
    }

    const [evtRows]: any = await db.query(
      `
      SELECT
        id_licitacao AS idLicitacao,
        SUM(CASE WHEN tipo = 'PRAZO' AND DATEDIFF(data_evento, CURDATE()) < 0 THEN 1 ELSE 0 END) AS alertas,
        SUM(CASE WHEN tipo = 'PRAZO' AND DATEDIFF(data_evento, CURDATE()) BETWEEN 0 AND ? THEN 1 ELSE 0 END) AS infos
      FROM engenharia_licitacoes_andamento_eventos
      WHERE tenant_id = ? AND id_licitacao IN ${inClause}
      GROUP BY id_licitacao
      `,
      [dias, current.tenantId, ...inParams]
    );
    for (const r of evtRows as any[]) {
      const s = saude.get(Number(r.idLicitacao));
      if (!s) continue;
      s.alertas += Number(r.alertas || 0);
      s.infos += Number(r.infos || 0);
    }

    const [comRows]: any = await db.query(
      `
      SELECT
        c.id_licitacao AS idLicitacao,
        SUM(CASE WHEN c.id_documento_registro IS NOT NULL AND v.id_documento_versao IS NULL THEN 1 ELSE 0 END) AS alertas
      FROM engenharia_licitacoes_comunicacoes c
      LEFT JOIN documentos_registros r
        ON r.tenant_id = c.tenant_id AND r.id_documento_registro = c.id_documento_registro
      LEFT JOIN documentos_versoes v
        ON v.tenant_id = r.tenant_id AND v.id_documento_versao = r.id_versao_atual
        AND (v.conteudo_blob_pdf_carimbado IS NOT NULL OR v.conteudo_blob_original IS NOT NULL)
      WHERE c.tenant_id = ? AND c.id_licitacao IN ${inClause}
      GROUP BY c.id_licitacao
      `,
      [current.tenantId, ...inParams]
    );
    for (const r of comRows as any[]) {
      const s = saude.get(Number(r.idLicitacao));
      if (!s) continue;
      s.alertas += Number(r.alertas || 0);
    }

    return ok(
      base.map((r) => ({
        ...r,
        saude: saude.get(r.idLicitacao) || { criticos: 0, alertas: 0, infos: 0 },
        diasAlertaSaude: dias,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const titulo = String(body?.titulo || '').trim();
    const orgao = body?.orgao ? String(body.orgao).trim() : null;
    const dataAbertura = normalizeDate(body?.dataAbertura);
    if (!titulo) return fail(422, 'titulo é obrigatório');

    const [ins]: any = await db.query(
      `
      INSERT INTO engenharia_licitacoes (tenant_id, titulo, orgao_contratante, data_abertura, id_usuario_criador)
      VALUES (?,?,?,?,?)
      `,
      [current.tenantId, titulo.slice(0, 220), orgao, dataAbertura, current.id]
    );
    return ok({ idLicitacao: Number(ins.insertId) });
  } catch (e) {
    return handleApiError(e);
  }
}
