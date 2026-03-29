import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarDocumento } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

async function ensureTables() {
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
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function computeStatus(dataValidade: string | null) {
  if (!dataValidade) return 'SEM_VALIDADE';
  const hoje = new Date();
  const d = new Date(`${dataValidade}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'SEM_VALIDADE';
  const diff = Math.ceil((d.getTime() - hoje.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'VENCIDO';
  if (diff <= 30) return 'A_VENCER';
  return 'VALIDO';
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    await ensureTables();

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const categoria = (req.nextUrl.searchParams.get('categoria') || '').trim().toUpperCase();

    const where: string[] = ['tenant_id = ?', 'ativo = 1'];
    const params: any[] = [current.tenantId];
    if (categoria) {
      where.push('categoria = ?');
      params.push(categoria);
    }
    if (q) {
      where.push('(LOWER(nome) LIKE ? OR LOWER(COALESCE(numero,"")) LIKE ? OR LOWER(COALESCE(orgao_emissor,"")) LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_documento_empresa AS idDocumentoEmpresa,
        categoria,
        nome,
        descricao,
        numero,
        orgao_emissor AS orgaoEmissor,
        data_emissao AS dataEmissao,
        data_validade AS dataValidade,
        id_documento_registro AS idDocumentoRegistro
      FROM engenharia_documentos_empresa
      WHERE ${where.join(' AND ')}
      ORDER BY data_validade IS NULL, data_validade ASC, id_documento_empresa DESC
      LIMIT 1000
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => {
        const dataValidade = r.dataValidade ? String(r.dataValidade) : null;
        return {
          idDocumentoEmpresa: Number(r.idDocumentoEmpresa),
          categoria: String(r.categoria),
          nome: String(r.nome),
          descricao: r.descricao ? String(r.descricao) : null,
          numero: r.numero ? String(r.numero) : null,
          orgaoEmissor: r.orgaoEmissor ? String(r.orgaoEmissor) : null,
          dataEmissao: r.dataEmissao ? String(r.dataEmissao) : null,
          dataValidade,
          status: computeStatus(dataValidade),
          idDocumentoRegistro: Number(r.idDocumentoRegistro),
        };
      })
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const categoria = String(body?.categoria || '').trim().toUpperCase();
    const nome = String(body?.nome || '').trim();
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const numero = body?.numero ? String(body.numero).trim() : null;
    const orgaoEmissor = body?.orgaoEmissor ? String(body.orgaoEmissor).trim() : null;
    const dataEmissao = normalizeDate(body?.dataEmissao);
    const dataValidade = normalizeDate(body?.dataValidade);

    if (!categoria) return fail(422, 'categoria é obrigatória');
    if (!nome) return fail(422, 'nome é obrigatório');

    await conn.beginTransaction();

    const doc = await criarDocumento(current.tenantId, current.id, {
      categoriaDocumento: `LICITACOES_EMPRESA_${categoria}`,
      tituloDocumento: nome,
      descricaoDocumento: descricao,
      entidadeTipo: null,
      entidadeId: null,
    });
    const idDocumentoRegistro = Number((doc as any).id);

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_documentos_empresa
        (tenant_id, categoria, nome, descricao, numero, orgao_emissor, data_emissao, data_validade, id_documento_registro, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, categoria, nome.slice(0, 180), descricao, numero, orgaoEmissor, dataEmissao, dataValidade, idDocumentoRegistro, current.id]
    );

    await conn.commit();
    return ok({ idDocumentoEmpresa: Number(ins.insertId), idDocumentoRegistro });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

