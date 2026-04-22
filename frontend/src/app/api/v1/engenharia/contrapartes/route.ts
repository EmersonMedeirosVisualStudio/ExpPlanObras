import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contrapartes (
      id_contraparte BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('PJ','PF') NOT NULL,
      nome_razao VARCHAR(255) NOT NULL,
      documento VARCHAR(32) NULL,
      email VARCHAR(120) NULL,
      telefone VARCHAR(40) NULL,
      status ENUM('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
      classificacao_status VARCHAR(32) NOT NULL DEFAULT 'EM_AVALIACAO',
      observacao TEXT NULL,
      cep VARCHAR(16) NULL,
      logradouro VARCHAR(255) NULL,
      numero VARCHAR(64) NULL,
      complemento VARCHAR(255) NULL,
      bairro VARCHAR(120) NULL,
      cidade VARCHAR(120) NULL,
      uf VARCHAR(8) NULL,
      latitude VARCHAR(32) NULL,
      longitude VARCHAR(32) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_contraparte),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_doc (tenant_id, documento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS classificacao_status VARCHAR(32) NOT NULL DEFAULT 'EM_AVALIACAO'`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS cep VARCHAR(16) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS numero VARCHAR(64) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS complemento VARCHAR(255) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS bairro VARCHAR(120) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS cidade VARCHAR(120) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS uf VARCHAR(8) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS latitude VARCHAR(32) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS longitude VARCHAR(32) NULL`);

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contrapartes_avaliacoes (
      id_avaliacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_contraparte BIGINT UNSIGNED NOT NULL,
      nota INT NULL,
      comentario TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_avaliacao),
      KEY idx_contraparte (tenant_id, id_contraparte)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'PJ' || s === 'PF' ? s : null;
}

function normalizeStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ATIVO' || s === 'INATIVO' ? s : null;
}

const CLASSIFICACOES = ['EXCELENTE', 'BOA', 'REGULAR', 'EM_AVALIACAO', 'NAO_RECOMENDADO'] as const;

function normalizeClassificacao(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return (CLASSIFICACOES as readonly string[]).includes(s) ? s : null;
}

function normalizeClassificacoesList(v: unknown) {
  const raw = String(v ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((x) => normalizeClassificacao(x))
    .filter((x): x is (typeof CLASSIFICACOES)[number] => Boolean(x));
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const q = String(req.nextUrl.searchParams.get('q') || '').trim();
    const tipo = normalizeTipo(req.nextUrl.searchParams.get('tipo'));
    const status = normalizeStatus(req.nextUrl.searchParams.get('status'));
    const classificacoes = normalizeClassificacoesList(req.nextUrl.searchParams.get('classificacaoStatus'));
    const cidade = String(req.nextUrl.searchParams.get('cidade') || '').trim();
    const uf = String(req.nextUrl.searchParams.get('uf') || '').trim().toUpperCase();

    await ensureTables();

    const where: string[] = ['tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (tipo) {
      where.push('tipo = ?');
      params.push(tipo);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (classificacoes.length) {
      where.push(`classificacao_status IN (${classificacoes.map(() => '?').join(',')})`);
      params.push(...classificacoes);
    }
    if (cidade) {
      where.push('cidade = ?');
      params.push(cidade);
    }
    if (uf) {
      where.push('uf = ?');
      params.push(uf);
    }
    if (q) {
      where.push('(nome_razao LIKE ? OR documento LIKE ? OR email LIKE ? OR telefone LIKE ?)');
      const s = `%${q}%`;
      params.push(s, s, s, s);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_contraparte AS idContraparte,
        tipo,
        nome_razao AS nomeRazao,
        documento,
        email,
        telefone,
        status,
        classificacao_status AS classificacaoStatus,
        observacao,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        latitude,
        longitude,
        criado_em AS criadoEm
      FROM engenharia_contrapartes
      WHERE ${where.join(' AND ')}
      ORDER BY nome_razao
      LIMIT 500
      `,
      params
    );
    return ok((rows as any[]).map((r) => ({ ...r, idContraparte: Number(r.idContraparte) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);

    const tipo = normalizeTipo(body?.tipo);
    const nomeRazao = String(body?.nomeRazao || '').trim();
    const documento = body?.documento ? String(body.documento).trim() : null;
    const email = body?.email ? String(body.email).trim() : null;
    const telefone = body?.telefone ? String(body.telefone).trim() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;
    const classificacaoStatus = body?.classificacaoStatus ? normalizeClassificacao(body.classificacaoStatus) : null;
    const cep = body?.cep ? String(body.cep).trim() : null;
    const logradouro = body?.logradouro ? String(body.logradouro).trim() : null;
    const numero = body?.numero ? String(body.numero).trim() : null;
    const complemento = body?.complemento ? String(body.complemento).trim() : null;
    const bairro = body?.bairro ? String(body.bairro).trim() : null;
    const cidade = body?.cidade ? String(body.cidade).trim() : null;
    const uf = body?.uf ? String(body.uf).trim().toUpperCase() : null;
    const latitude = body?.latitude ? String(body.latitude).trim() : null;
    const longitude = body?.longitude ? String(body.longitude).trim() : null;

    if (!tipo) return fail(422, 'tipo é obrigatório (PJ|PF)');
    if (!nomeRazao) return fail(422, 'nomeRazao é obrigatório');
    if (body?.classificacaoStatus && !classificacaoStatus) return fail(422, 'classificacaoStatus inválido');

    await ensureTables();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_contrapartes
        (tenant_id, tipo, nome_razao, documento, email, telefone, status, classificacao_status, observacao, cep, logradouro, numero, complemento, bairro, cidade, uf, latitude, longitude)
      VALUES
        (?,?,?,?,?,?, 'ATIVO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        tipo,
        nomeRazao.slice(0, 255),
        documento ? documento.slice(0, 32) : null,
        email ? email.slice(0, 120) : null,
        telefone ? telefone.slice(0, 40) : null,
        classificacaoStatus || 'EM_AVALIACAO',
        observacao,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        latitude,
        longitude,
      ]
    );
    await conn.commit();
    return ok({ idContraparte: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
