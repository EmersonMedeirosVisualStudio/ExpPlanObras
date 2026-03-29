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
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_contraparte),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_doc (tenant_id, documento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

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

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const q = String(req.nextUrl.searchParams.get('q') || '').trim();
    const tipo = normalizeTipo(req.nextUrl.searchParams.get('tipo'));
    const status = normalizeStatus(req.nextUrl.searchParams.get('status'));

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
    if (q) {
      where.push('(nome_razao LIKE ? OR documento LIKE ?)');
      const s = `%${q}%`;
      params.push(s, s);
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
        observacao,
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

    if (!tipo) return fail(422, 'tipo é obrigatório (PJ|PF)');
    if (!nomeRazao) return fail(422, 'nomeRazao é obrigatório');

    await ensureTables();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_contrapartes
        (tenant_id, tipo, nome_razao, documento, email, telefone, status, observacao)
      VALUES
        (?,?,?,?,?,?, 'ATIVO', ?)
      `,
      [current.tenantId, tipo, nomeRazao.slice(0, 255), documento ? documento.slice(0, 32) : null, email ? email.slice(0, 120) : null, telefone ? telefone.slice(0, 40) : null, observacao]
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

