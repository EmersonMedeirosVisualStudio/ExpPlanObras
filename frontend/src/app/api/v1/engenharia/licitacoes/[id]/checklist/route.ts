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
      KEY idx_licitacao (tenant_id, id_licitacao),
      KEY idx_categoria (tenant_id, id_licitacao, categoria)
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
}

function computeValidadeStatus(dataValidade: string | null, diasAlerta: number) {
  if (!dataValidade) return 'SEM_VALIDADE';
  const hoje = new Date();
  const d = new Date(`${dataValidade}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'SEM_VALIDADE';
  const diff = Math.ceil((d.getTime() - hoje.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'VENCIDO';
  if (diff <= Math.max(0, Number(diasAlerta || 0))) return 'A_VENCER';
  return 'VALIDO';
}

function bestStatus(statuses: Array<{ status: string; temArquivo: boolean }>) {
  if (!statuses.length) return { status: 'PENDENTE', temArquivo: false };
  const anyArquivo = statuses.some((s) => s.temArquivo);
  if (!anyArquivo) return { status: 'SEM_ARQUIVO', temArquivo: false };
  if (statuses.some((s) => s.temArquivo && s.status === 'VALIDO')) return { status: 'OK', temArquivo: true };
  if (statuses.some((s) => s.temArquivo && s.status === 'A_VENCER')) return { status: 'A_VENCER', temArquivo: true };
  if (statuses.some((s) => s.temArquivo && s.status === 'SEM_VALIDADE')) return { status: 'SEM_VALIDADE', temArquivo: true };
  return { status: 'VENCIDO', temArquivo: true };
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

    const [itens]: any = await db.query(
      `
      SELECT id_item AS idItem, categoria, nome, obrigatorio, dias_alerta AS diasAlerta, ordem
      FROM engenharia_licitacoes_checklist_itens
      WHERE tenant_id = ? AND id_licitacao = ? AND ativo = 1
      ORDER BY ordem ASC, id_item ASC
      `,
      [current.tenantId, idLicitacao]
    );

    const [docs]: any = await db.query(
      `
      SELECT
        d.categoria,
        d.id_documento_registro AS idDocumentoRegistro,
        d.data_validade AS dataValidade,
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

    const grouped = new Map<string, any[]>();
    for (const r of docs as any[]) {
      const cat = String(r.categoria || '').trim().toUpperCase();
      const arr = grouped.get(cat) || [];
      arr.push(r);
      grouped.set(cat, arr);
    }

    const out = (itens as any[]).map((i) => {
      const categoria = String(i.categoria).toUpperCase();
      const related = grouped.get(categoria) || [];
      const statuses = related.map((r) => ({
        status: computeValidadeStatus(r.dataValidade ? String(r.dataValidade) : null, Number(i.diasAlerta || 30)),
        temArquivo: Number(r.temArquivo || 0) ? true : false,
        idDocumentoRegistro: r.idDocumentoRegistro == null ? null : Number(r.idDocumentoRegistro),
        idVersaoAtual: r.idVersaoAtual == null ? null : Number(r.idVersaoAtual),
      }));
      const best = bestStatus(statuses);
      const bestDoc = statuses.find((s) => s.temArquivo && (best.status === 'OK' ? s.status === 'VALIDO' : s.status === best.status)) || statuses[0] || null;
      const idVersaoAtual = bestDoc?.idVersaoAtual ?? null;
      return {
        idItem: Number(i.idItem),
        categoria,
        nome: String(i.nome),
        obrigatorio: Number(i.obrigatorio || 0) ? true : false,
        diasAlerta: Number(i.diasAlerta || 30),
        status: best.status,
        idDocumentoRegistro: bestDoc?.idDocumentoRegistro ?? null,
        downloadUrl: idVersaoAtual ? `/api/v1/documentos/versoes/${idVersaoAtual}/download?tipo=PDF_FINAL` : null,
      };
    });

    const resumo = {
      total: out.length,
      ok: out.filter((x) => x.status === 'OK').length,
      pendente: out.filter((x) => x.status === 'PENDENTE').length,
      vencido: out.filter((x) => x.status === 'VENCIDO').length,
      aVencer: out.filter((x) => x.status === 'A_VENCER').length,
      semArquivo: out.filter((x) => x.status === 'SEM_ARQUIVO').length,
    };

    return ok({ resumo, itens: out });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');

    await ensureTables();

    const body = await req.json().catch(() => null);
    const preset = body?.preset ? String(body.preset).trim().toUpperCase() : null;

    await conn.beginTransaction();

    if (preset === 'PADRAO') {
      const defaults = [
        { categoria: 'JURIDICO', nome: 'Documentos jurídicos (contrato social, procurações, representantes)', ordem: 10 },
        { categoria: 'FISCAL', nome: 'Certidões fiscais (federal/estadual/municipal)', ordem: 20 },
        { categoria: 'TRABALHISTA', nome: 'Certidões trabalhistas (CNDT)', ordem: 30 },
        { categoria: 'FGTS', nome: 'Regularidade FGTS', ordem: 35 },
        { categoria: 'ECONOMICO', nome: 'Econômico-financeiro (balanço, índices, capital social)', ordem: 40 },
        { categoria: 'DECLARACOES', nome: 'Declarações padrão (fato impeditivo, art. 7º, etc.)', ordem: 45 },
        { categoria: 'VISITA_TECNICA', nome: 'Visita técnica / declarações específicas do edital', ordem: 47 },
        { categoria: 'TECNICO', nome: 'Documentos técnicos (acervo, equipe, atestados)', ordem: 50 },
        { categoria: 'PROPOSTA', nome: 'Proposta e anexos finais (planilha orçamentária, cronograma, BDI)', ordem: 60 },
      ];
      for (const d of defaults) {
        await conn.query(
          `
          INSERT INTO engenharia_licitacoes_checklist_itens
          VALUES (?,?,?,?,1,30,?,?)
          `,
          [current.tenantId, idLicitacao, d.categoria, d.nome, d.ordem, current.id]
        );
      }
      await conn.commit();
      return ok({ created: defaults.length });
    }

    const categoria = String(body?.categoria || '').trim().toUpperCase();
    const nome = String(body?.nome || '').trim();
    const obrigatorio = body?.obrigatorio === false ? 0 : 1;
    const diasAlerta = body?.diasAlerta != null ? Number(body.diasAlerta) : 30;
    const ordem = body?.ordem != null ? Number(body.ordem) : 0;

    if (!categoria) return fail(422, 'categoria é obrigatória');
    if (!nome) return fail(422, 'nome é obrigatório');

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_licitacoes_checklist_itens
        (tenant_id, id_licitacao, categoria, nome, obrigatorio, dias_alerta, ordem, id_usuario_criador)
      VALUES (?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, idLicitacao, categoria, nome.slice(0, 180), obrigatorio, Math.max(0, diasAlerta), ordem, current.id]
    );

    await conn.commit();
    return ok({ idItem: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await params;
    const idLicitacao = Number(id || 0);
    const idItem = Number(req.nextUrl.searchParams.get('idItem') || 0);
    if (!Number.isFinite(idLicitacao) || idLicitacao <= 0) return fail(422, 'idLicitacao inválido');
    if (!idItem) return fail(422, 'idItem é obrigatório');

    await ensureTables();

    await db.query(
      `UPDATE engenharia_licitacoes_checklist_itens SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id_licitacao = ? AND id_item = ? LIMIT 1`,
      [current.tenantId, idLicitacao, idItem]
    );

    return ok({ removed: true });
  } catch (e) {
    return handleApiError(e);
  }
}
