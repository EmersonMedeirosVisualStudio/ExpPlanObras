import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarDocumento, criarNovaVersaoDocumento } from '@/lib/modules/documentos/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
    CREATE TABLE IF NOT EXISTS engenharia_documentos_empresa (
      id_documento_empresa BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      categoria VARCHAR(40) NOT NULL,
      nome VARCHAR(180) NOT NULL,
      descricao TEXT NULL,
      numero VARCHAR(80) NULL,
      orgao_emissor VARCHAR(140) NULL,
      data_emissao DATE NULL,
      data_validade DATE NULL,
      id_documento_registro BIGINT UNSIGNED NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_documento_empresa),
      UNIQUE KEY uk_doc_registro (tenant_id, id_documento_registro),
      KEY idx_tenant (tenant_id),
      KEY idx_categoria (tenant_id, categoria),
      KEY idx_validade (tenant_id, data_validade),
      KEY idx_ativo (tenant_id, ativo)
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
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function wrapLines(args: { text: string; font: any; size: number; maxWidth: number }) {
  const raw = String(args.text || '').replace(/\r/g, '');
  const paragraphs = raw.split('\n');
  const lines: string[] = [];
  for (const p of paragraphs) {
    const t = p.trim();
    if (!t) {
      lines.push('');
      continue;
    }
    const words = t.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      const width = args.font.widthOfTextAtSize(next, args.size);
      if (width <= args.maxWidth) {
        cur = next;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

async function renderDeclaracaoPdf(args: { titulo: string; subtitulo: string | null; corpo: string; rodape: string }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 54;
  let y = height - margin;

  page.drawText(String(args.titulo || '').slice(0, 120), { x: margin, y, size: 16, font: fontBold, color: rgb(0.05, 0.1, 0.2) });
  y -= 22;
  if (args.subtitulo) {
    page.drawText(String(args.subtitulo || '').slice(0, 180), { x: margin, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
  }
  y -= 8;

  const bodyLines = wrapLines({ text: args.corpo, font, size: 11, maxWidth: width - margin * 2 });
  for (const line of bodyLines) {
    if (y < margin + 120) break;
    if (!line) {
      y -= 10;
      continue;
    }
    page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
  }

  y = Math.max(y - 10, margin + 90);
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  y -= 18;
  const footLines = wrapLines({ text: args.rodape, font, size: 10, maxWidth: width - margin * 2 });
  for (const line of footLines.slice(0, 6)) {
    page.drawText(line, { x: margin, y, size: 10, font, color: rgb(0.25, 0.25, 0.25) });
    y -= 12;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const body = (await req.json().catch(() => null)) as any;
    const template = String(body?.template || '').trim().toUpperCase();
    const categoriaCustom = body?.categoria ? String(body.categoria).trim().toUpperCase() : null;
    const tituloCustom = body?.titulo ? String(body.titulo).trim() : null;
    const textoCustom = body?.texto ? String(body.texto).trim() : null;
    const cidade = body?.cidade ? String(body.cidade).trim() : null;
    const uf = body?.uf ? String(body.uf).trim().toUpperCase() : null;
    const dataEmissao = body?.dataEmissao ? String(body.dataEmissao).trim() : todayIso();
    const numeroEdital = body?.numeroEdital ? String(body.numeroEdital).trim() : null;

    const [[l]]: any = await db.query(
      `
      SELECT titulo, orgao_contratante AS orgao, portal_url AS portalUrl
      FROM engenharia_licitacoes
      WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1
      LIMIT 1
      `,
      [current.tenantId, idLicitacao]
    );
    if (!l) return fail(404, 'Licitação não encontrada');

    let empresaNome = `Tenant #${current.tenantId}`;
    let empresaCnpj: string | null = null;
    try {
      const [[t]]: any = await db.query(
        `SELECT COALESCE(nome_fantasia, razao_social, nome) AS nome, cnpj FROM tenants WHERE id_tenant = ? LIMIT 1`,
        [current.tenantId]
      );
      if (t?.nome) empresaNome = String(t.nome);
      if (t?.cnpj) empresaCnpj = String(t.cnpj);
    } catch {}

    const licTitulo = String(l.titulo);
    const licOrgao = l.orgao ? String(l.orgao) : null;
    const portalUrl = l.portalUrl ? String(l.portalUrl) : null;

    const localData = [cidade, uf].filter(Boolean).join('/') || null;
    const localPrefix = localData ? `${localData}, ` : '';

    let categoria = 'DECLARACOES';
    let tituloPdf = 'Declaração';
    let corpo = '';

    if (template === 'CUSTOM') {
      categoria = categoriaCustom || 'DECLARACOES';
      tituloPdf = tituloCustom ? tituloCustom : 'Declaração';
      corpo = textoCustom ? textoCustom : '';
      if (!tituloPdf.trim()) return fail(422, 'titulo é obrigatório');
      if (!corpo.trim()) return fail(422, 'texto é obrigatório');
    } else if (template === 'FATO_IMPEDITIVO') {
      tituloPdf = 'Declaração de Inexistência de Fato Impeditivo';
      corpo =
        `Declaramos, para os devidos fins, que a empresa ${empresaNome}${empresaCnpj ? `, inscrita no CNPJ ${empresaCnpj}` : ''}, ` +
        `não possui fato impeditivo para participar do certame e contratar com a Administração Pública, nos termos da legislação aplicável.\n\n` +
        `Esta declaração refere-se à licitação: ${licTitulo}${licOrgao ? `, órgão/contratante: ${licOrgao}` : ''}${numeroEdital ? `, edital: ${numeroEdital}` : ''}.` +
        `${portalUrl ? `\nPortal/Referência: ${portalUrl}` : ''}`;
    } else if (template === 'ART7') {
      tituloPdf = 'Declaração (Art. 7º, XXXIII, CF)';
      corpo =
        `Declaramos, sob as penas da lei, que a empresa ${empresaNome}${empresaCnpj ? `, inscrita no CNPJ ${empresaCnpj}` : ''}, ` +
        `não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 (dezesseis) anos, ` +
        `salvo na condição de aprendiz, a partir de 14 (quatorze) anos, conforme Art. 7º, XXXIII, da Constituição Federal.\n\n` +
        `Esta declaração refere-se à licitação: ${licTitulo}${licOrgao ? `, órgão/contratante: ${licOrgao}` : ''}${numeroEdital ? `, edital: ${numeroEdital}` : ''}.`;
    } else if (template === 'VISITA_TECNICA') {
      categoria = 'VISITA_TECNICA';
      tituloPdf = 'Declaração de Visita Técnica';
      corpo =
        `Declaramos que a empresa ${empresaNome}${empresaCnpj ? `, inscrita no CNPJ ${empresaCnpj}` : ''}, ` +
        `realizou visita técnica e/ou vistoria no local relacionado ao objeto da licitação, tendo pleno conhecimento das condições ` +
        `necessárias para execução, conforme exigências do edital.\n\n` +
        `Licitação: ${licTitulo}${licOrgao ? `, órgão/contratante: ${licOrgao}` : ''}${numeroEdital ? `, edital: ${numeroEdital}` : ''}.`;
    } else if (template === 'ME_EPP') {
      tituloPdf = 'Declaração de Enquadramento ME/EPP';
      corpo =
        `Declaramos, para os devidos fins, que a empresa ${empresaNome}${empresaCnpj ? `, inscrita no CNPJ ${empresaCnpj}` : ''}, ` +
        `enquadra-se como Microempresa (ME) ou Empresa de Pequeno Porte (EPP), nos termos da legislação vigente, quando aplicável.\n\n` +
        `Licitação: ${licTitulo}${licOrgao ? `, órgão/contratante: ${licOrgao}` : ''}${numeroEdital ? `, edital: ${numeroEdital}` : ''}.`;
    } else {
      return fail(422, 'template inválido');
    }

    const docTitulo = `Licitação #${idLicitacao} — ${tituloPdf}`;
    const rodape =
      `${localPrefix}${dataEmissao}\n` +
      `${empresaNome}${empresaCnpj ? ` — CNPJ ${empresaCnpj}` : ''}\n` +
      `Assinatura/Responsável: ______________________________`;

    const pdf = await renderDeclaracaoPdf({ titulo: tituloPdf, subtitulo: licOrgao ? `${licOrgao} — ${licTitulo}` : licTitulo, corpo, rodape });

    await conn.beginTransaction();

    const created = await criarDocumento(current.tenantId, current.id, {
      categoriaDocumento: `LICITACAO:${categoria}`,
      tituloDocumento: docTitulo,
      entidadeTipo: 'ENGENHARIA_LICITACAO',
      entidadeId: idLicitacao,
      descricaoDocumento: numeroEdital ? `Edital: ${numeroEdital}` : null,
    } as any);

    const versao = await criarNovaVersaoDocumento({
      tenantId: current.tenantId,
      documentoId: Number(created.id),
      userId: current.id,
      nomeArquivoOriginal: `${tituloPdf.replace(/[^\w\d]+/g, '-').replace(/-+/g, '-').toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdf,
    });

    const [insDocEmpresa]: any = await conn.query(
      `
      INSERT INTO engenharia_documentos_empresa
        (tenant_id, categoria, nome, descricao, numero, orgao_emissor, data_emissao, data_validade, id_documento_registro, ativo, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,1,?)
      `,
      [
        current.tenantId,
        categoria,
        docTitulo.slice(0, 180),
        numeroEdital ? `Edital: ${numeroEdital}` : null,
        numeroEdital ? numeroEdital.slice(0, 80) : null,
        licOrgao ? licOrgao.slice(0, 140) : null,
        /^\d{4}-\d{2}-\d{2}$/.test(dataEmissao) ? dataEmissao : null,
        null,
        Number(created.id),
        current.id,
      ]
    );
    const idDocumentoEmpresa = Number(insDocEmpresa.insertId);

    await conn.query(
      `
      INSERT INTO engenharia_licitacoes_documentos (tenant_id, id_licitacao, id_documento_empresa, id_usuario_criador)
      VALUES (?,?,?,?)
      `,
      [current.tenantId, idLicitacao, idDocumentoEmpresa, current.id]
    );

    await conn.commit();

    return ok({
      idDocumentoRegistro: Number(created.id),
      idDocumentoEmpresa,
      idVersao: Number(versao.id),
      abrirUrl: `/dashboard/documentos/${Number(created.id)}`,
      downloadUrl: `/api/v1/documentos/versoes/${Number(versao.id)}/download?tipo=ORIGINAL`,
    });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
