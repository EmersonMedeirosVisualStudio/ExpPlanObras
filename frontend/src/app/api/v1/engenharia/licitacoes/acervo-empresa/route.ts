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
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'CAT') return 'CAT';
  if (s === 'OBRA_EXECUTADA') return 'OBRA_EXECUTADA';
  return 'ATESTADO';
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    await ensureTables();

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const tipo = (req.nextUrl.searchParams.get('tipo') || '').trim().toUpperCase();

    const where: string[] = ['tenant_id = ?', 'ativo = 1'];
    const params: any[] = [current.tenantId];
    if (tipo && ['CAT', 'ATESTADO', 'OBRA_EXECUTADA'].includes(tipo)) {
      where.push('tipo = ?');
      params.push(tipo);
    }
    if (q) {
      where.push('(LOWER(titulo) LIKE ? OR LOWER(COALESCE(numero_documento,"")) LIKE ? OR LOWER(COALESCE(orgao_emissor,"")) LIKE ? OR LOWER(COALESCE(nome_obra,"")) LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_acervo AS idAcervo,
        titulo,
        descricao,
        tipo,
        numero_documento AS numeroDocumento,
        orgao_emissor AS orgaoEmissor,
        data_emissao AS dataEmissao,
        nome_obra AS nomeObra,
        contratante,
        local_obra AS localObra,
        valor_obra AS valorObra,
        data_inicio AS dataInicio,
        data_fim AS dataFim,
        categoria,
        subcategoria,
        porte_obra AS porteObra,
        id_documento_registro AS idDocumentoRegistro
      FROM engenharia_acervos_empresa
      WHERE ${where.join(' AND ')}
      ORDER BY id_acervo DESC
      LIMIT 1000
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        idAcervo: Number(r.idAcervo),
        titulo: String(r.titulo),
        descricao: r.descricao ? String(r.descricao) : null,
        tipo: String(r.tipo),
        numeroDocumento: r.numeroDocumento ? String(r.numeroDocumento) : null,
        orgaoEmissor: r.orgaoEmissor ? String(r.orgaoEmissor) : null,
        dataEmissao: r.dataEmissao ? String(r.dataEmissao) : null,
        nomeObra: r.nomeObra ? String(r.nomeObra) : null,
        contratante: r.contratante ? String(r.contratante) : null,
        localObra: r.localObra ? String(r.localObra) : null,
        valorObra: r.valorObra == null ? null : Number(r.valorObra),
        dataInicio: r.dataInicio ? String(r.dataInicio) : null,
        dataFim: r.dataFim ? String(r.dataFim) : null,
        categoria: r.categoria ? String(r.categoria) : null,
        subcategoria: r.subcategoria ? String(r.subcategoria) : null,
        porteObra: r.porteObra ? String(r.porteObra) : null,
        idDocumentoRegistro: r.idDocumentoRegistro == null ? null : Number(r.idDocumentoRegistro),
      }))
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
    const titulo = String(body?.titulo || '').trim();
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const tipo = normTipo(body?.tipo);
    const numeroDocumento = body?.numeroDocumento ? String(body.numeroDocumento).trim() : null;
    const orgaoEmissor = body?.orgaoEmissor ? String(body.orgaoEmissor).trim() : null;
    const dataEmissao = normalizeDate(body?.dataEmissao);
    const nomeObra = body?.nomeObra ? String(body.nomeObra).trim() : null;
    const contratante = body?.contratante ? String(body.contratante).trim() : null;
    const localObra = body?.localObra ? String(body.localObra).trim() : null;
    const valorObra = body?.valorObra == null ? null : toNumber(body.valorObra);
    const dataInicio = normalizeDate(body?.dataInicio);
    const dataFim = normalizeDate(body?.dataFim);
    const categoria = body?.categoria ? String(body.categoria).trim() : null;
    const subcategoria = body?.subcategoria ? String(body.subcategoria).trim() : null;
    const porteObra = body?.porteObra ? String(body.porteObra).trim() : null;

    if (!titulo) return fail(422, 'titulo é obrigatório');

    await conn.beginTransaction();

    const doc = await criarDocumento(current.tenantId, current.id, {
      categoriaDocumento: `LICITACOES_ACERVO_${tipo}`,
      tituloDocumento: titulo,
      descricaoDocumento: descricao,
      entidadeTipo: null,
      entidadeId: null,
    });
    const idDocumentoRegistro = Number((doc as any).id);

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_acervos_empresa
        (tenant_id, titulo, descricao, tipo, numero_documento, orgao_emissor, data_emissao, nome_obra, contratante, local_obra,
         valor_obra, data_inicio, data_fim, categoria, subcategoria, porte_obra, id_documento_registro, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        titulo.slice(0, 180),
        descricao,
        tipo,
        numeroDocumento,
        orgaoEmissor,
        dataEmissao,
        nomeObra,
        contratante,
        localObra,
        valorObra == null || Number.isNaN(valorObra) ? null : valorObra,
        dataInicio,
        dataFim,
        categoria,
        subcategoria,
        porteObra,
        idDocumentoRegistro,
        current.id,
      ]
    );

    await conn.commit();
    return ok({ idAcervo: Number(ins.insertId), idDocumentoRegistro });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

