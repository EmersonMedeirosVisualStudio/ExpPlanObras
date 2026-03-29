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

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function hasFileFlag(row: any) {
  return Number(row?.temArquivo || 0) ? true : false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const [[l]]: any = await db.query(`SELECT titulo FROM engenharia_licitacoes WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1 LIMIT 1`, [
      current.tenantId,
      idLicitacao,
    ]);
    if (!l) return fail(404, 'Licitação não encontrada');

    const diasAlerta = req.nextUrl.searchParams.get('diasAlerta') ? Number(req.nextUrl.searchParams.get('diasAlerta')) : 30;
    const dias = Number.isFinite(diasAlerta) ? Math.max(0, diasAlerta) : 30;

    const issues: Array<{ nivel: 'CRITICO' | 'ALERTA' | 'INFO'; tipo: string; mensagem: string; referencia?: string | null; link?: string | null }> = [];

    const [checkRows]: any = await db.query(
      `
      SELECT id_item AS idItem, categoria, nome, obrigatorio, dias_alerta AS diasAlerta
      FROM engenharia_licitacoes_checklist_itens
      WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1
      ORDER BY ordem ASC, id_item ASC
      `,
      [current.tenantId, idLicitacao]
    );

    const [docRows]: any = await db.query(
      `
      SELECT
        d.categoria,
        d.nome,
        d.data_validade AS dataValidade,
        d.id_documento_registro AS idDocumentoRegistro,
        r.id_versao_atual AS idVersaoAtual,
        (CASE WHEN v.id_documento_versao IS NULL THEN 0 ELSE 1 END) AS temArquivo
      FROM engenharia_licitacoes_documentos x
      INNER JOIN engenharia_documentos_empresa d
        ON d.tenant_id = x.tenant_id AND d.id_documento_empresa = x.id_documento_empresa
      LEFT JOIN documentos_registros r
        ON r.tenant_id = d.tenant_id AND r.id_documento_registro = d.id_documento_registro
      LEFT JOIN documentos_versoes v
        ON v.tenant_id = r.tenant_id AND v.id_documento_versao = r.id_versao_atual
        AND (v.conteudo_blob_pdf_carimbado IS NOT NULL OR v.conteudo_blob_original IS NOT NULL)
      WHERE x.tenant_id = ? AND x.id_licitacao = ? AND d.ativo = 1
      `,
      [current.tenantId, idLicitacao]
    );
    const docsByCategoria = new Map<string, any[]>();
    for (const r of docRows as any[]) {
      const cat = String(r.categoria || '').trim().toUpperCase();
      const arr = docsByCategoria.get(cat) || [];
      arr.push(r);
      docsByCategoria.set(cat, arr);
    }

    for (const it of checkRows as any[]) {
      const cat = String(it.categoria).toUpperCase();
      const obrigatorio = Number(it.obrigatorio || 0) ? true : false;
      const rel = docsByCategoria.get(cat) || [];
      if (!rel.length) {
        if (obrigatorio) issues.push({ nivel: 'CRITICO', tipo: 'CHECKLIST', mensagem: `Pendente: ${it.nome} (${cat})`, referencia: cat });
        else issues.push({ nivel: 'INFO', tipo: 'CHECKLIST', mensagem: `Pendente (não obrigatório): ${it.nome} (${cat})`, referencia: cat });
        continue;
      }
      const anyFile = rel.some((r) => hasFileFlag(r));
      if (!anyFile) issues.push({ nivel: obrigatorio ? 'CRITICO' : 'ALERTA', tipo: 'CHECKLIST', mensagem: `Sem arquivo: ${it.nome} (${cat})`, referencia: cat });
      for (const r of rel) {
        const dataValidade = r.dataValidade ? String(r.dataValidade) : null;
        const du = daysUntil(dataValidade);
        if (du == null) continue;
        if (du < 0) issues.push({ nivel: obrigatorio ? 'CRITICO' : 'ALERTA', tipo: 'VALIDADE', mensagem: `Documento vencido: ${r.nome} (${cat})`, referencia: dataValidade, link: `/dashboard/documentos/${Number(r.idDocumentoRegistro)}` });
        else if (du <= Math.max(0, Number(it.diasAlerta || dias))) issues.push({ nivel: 'ALERTA', tipo: 'VALIDADE', mensagem: `Documento a vencer (${du}d): ${r.nome} (${cat})`, referencia: dataValidade, link: `/dashboard/documentos/${Number(r.idDocumentoRegistro)}` });
      }
    }

    const [recRows]: any = await db.query(
      `
      SELECT id_recurso AS idRecurso, tipo, status, prazo_resposta AS prazoResposta, id_documento_registro AS idDocumentoRegistro
      FROM engenharia_licitacoes_recursos
      WHERE tenant_id = ? AND id_licitacao = ?
      ORDER BY atualizado_em DESC, id_recurso DESC
      LIMIT 500
      `,
      [current.tenantId, idLicitacao]
    );
    for (const r of recRows as any[]) {
      const prazo = r.prazoResposta ? String(r.prazoResposta) : null;
      const du = daysUntil(prazo);
      if (du == null) continue;
      const ref = `Recurso ${String(r.tipo)} (${String(r.status)})`;
      if (du < 0) issues.push({ nivel: 'CRITICO', tipo: 'PRAZO', mensagem: `Prazo vencido (${Math.abs(du)}d): ${ref}`, referencia: prazo, link: r.idDocumentoRegistro ? `/dashboard/documentos/${Number(r.idDocumentoRegistro)}` : null });
      else if (du <= dias) issues.push({ nivel: 'ALERTA', tipo: 'PRAZO', mensagem: `Prazo próximo (${du}d): ${ref}`, referencia: prazo, link: r.idDocumentoRegistro ? `/dashboard/documentos/${Number(r.idDocumentoRegistro)}` : null });
    }

    const [evtRows]: any = await db.query(
      `
      SELECT data_evento AS dataEvento, tipo, titulo
      FROM engenharia_licitacoes_andamento_eventos
      WHERE tenant_id = ? AND id_licitacao = ?
      ORDER BY data_evento DESC
      LIMIT 300
      `,
      [current.tenantId, idLicitacao]
    );
    for (const e of evtRows as any[]) {
      const tipo = String(e.tipo || '').trim().toUpperCase();
      if (tipo !== 'PRAZO') continue;
      const du = daysUntil(String(e.dataEvento));
      if (du == null) continue;
      if (du < 0) issues.push({ nivel: 'ALERTA', tipo: 'PRAZO', mensagem: `Evento de prazo vencido: ${String(e.titulo)}`, referencia: String(e.dataEvento) });
      else if (du <= dias) issues.push({ nivel: 'INFO', tipo: 'PRAZO', mensagem: `Evento de prazo próximo (${du}d): ${String(e.titulo)}`, referencia: String(e.dataEvento) });
    }

    const [comRows]: any = await db.query(
      `
      SELECT
        c.id_comunicacao AS idComunicacao,
        c.direcao,
        c.canal,
        c.data_referencia AS dataReferencia,
        c.assunto,
        c.id_documento_registro AS idDocumentoRegistro,
        (CASE WHEN v.id_documento_versao IS NULL THEN 0 ELSE 1 END) AS temArquivo
      FROM engenharia_licitacoes_comunicacoes c
      LEFT JOIN documentos_registros r
        ON r.tenant_id = c.tenant_id AND r.id_documento_registro = c.id_documento_registro
      LEFT JOIN documentos_versoes v
        ON v.tenant_id = r.tenant_id AND v.id_documento_versao = r.id_versao_atual
        AND (v.conteudo_blob_pdf_carimbado IS NOT NULL OR v.conteudo_blob_original IS NOT NULL)
      WHERE c.tenant_id = ? AND c.id_licitacao = ?
      ORDER BY c.data_referencia DESC, c.id_comunicacao DESC
      LIMIT 200
      `,
      [current.tenantId, idLicitacao]
    );
    for (const c of comRows as any[]) {
      if (!c.idDocumentoRegistro) continue;
      if (!hasFileFlag(c)) {
        issues.push({
          nivel: 'ALERTA',
          tipo: 'COMUNICACAO',
          mensagem: `Comunicação sem arquivo: ${String(c.assunto)} (${String(c.direcao)}/${String(c.canal)})`,
          referencia: c.dataReferencia ? String(c.dataReferencia) : null,
          link: `/dashboard/documentos/${Number(c.idDocumentoRegistro)}`,
        });
      }
    }

    const resumo = {
      criticos: issues.filter((i) => i.nivel === 'CRITICO').length,
      alertas: issues.filter((i) => i.nivel === 'ALERTA').length,
      infos: issues.filter((i) => i.nivel === 'INFO').length,
    };

    return ok({ idLicitacao, titulo: String(l.titulo), diasAlerta: dias, resumo, issues });
  } catch (e) {
    return handleApiError(e);
  }
}
