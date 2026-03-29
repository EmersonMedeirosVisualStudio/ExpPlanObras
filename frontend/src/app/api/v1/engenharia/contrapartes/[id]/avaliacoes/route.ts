import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
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

function toIntOrNull(v: unknown) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idContraparte = Number(id || 0);
    if (!Number.isFinite(idContraparte) || idContraparte <= 0) return fail(422, 'idContraparte inválido');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_avaliacao AS idAvaliacao,
        nota,
        comentario,
        criado_em AS criadoEm
      FROM engenharia_contrapartes_avaliacoes
      WHERE tenant_id = ? AND id_contraparte = ?
      ORDER BY id_avaliacao DESC
      LIMIT 200
      `,
      [current.tenantId, idContraparte]
    );
    return ok((rows as any[]).map((r) => ({ ...r, idAvaliacao: Number(r.idAvaliacao), nota: r.nota == null ? null : Number(r.nota) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idContraparte = Number(id || 0);
    if (!Number.isFinite(idContraparte) || idContraparte <= 0) return fail(422, 'idContraparte inválido');

    const body = await req.json().catch(() => null);
    const nota = toIntOrNull(body?.nota);
    const comentario = body?.comentario ? String(body.comentario).trim() : null;

    if (nota != null && (nota < 0 || nota > 10)) return fail(422, 'nota inválida (0 a 10)');
    if (!comentario && nota == null) return fail(422, 'Informe nota ou comentário');

    await ensureTables();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_contrapartes_avaliacoes
        (tenant_id, id_contraparte, nota, comentario, id_usuario_criador)
      VALUES
        (?,?,?,?,?)
      `,
      [current.tenantId, idContraparte, nota, comentario, current.id]
    );
    await conn.commit();
    return ok({ idAvaliacao: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

