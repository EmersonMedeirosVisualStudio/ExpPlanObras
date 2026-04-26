import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api/http";
import { requireApiPermission } from "@/lib/api/authz";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_projetos (
      id_projeto BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      endereco VARCHAR(255) NULL,
      descricao TEXT NULL,
      tipo VARCHAR(80) NULL,
      numero_projeto VARCHAR(80) NULL,
      revisao VARCHAR(30) NULL,
      status VARCHAR(30) NULL,
      data_projeto DATE NULL,
      data_aprovacao DATE NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_projeto),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_obras_projetos (
      id_obra_projeto BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_projeto BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_obra_projeto),
      UNIQUE KEY uq_obra_projeto (tenant_id, id_obra, id_projeto),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_projeto (tenant_id, id_projeto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function parseId(v: unknown) {
  const n = Number(v || 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const idObra = parseId(req.nextUrl.searchParams.get("idObra"));
    if (!idObra) return fail(400, "idObra inválido.");

    const [rows]: any = await db.query(
      `
      SELECT
        p.id_projeto AS idProjeto,
        p.titulo,
        p.endereco,
        p.descricao,
        p.tipo,
        p.numero_projeto AS numeroProjeto,
        p.revisao,
        p.status,
        p.data_projeto AS dataProjeto,
        p.data_aprovacao AS dataAprovacao,
        op.criado_em AS vinculadoEm
      FROM engenharia_obras_projetos op
      INNER JOIN engenharia_projetos p
        ON p.tenant_id = op.tenant_id AND p.id_projeto = op.id_projeto
      WHERE op.tenant_id = ? AND op.id_obra = ?
      ORDER BY p.atualizado_em DESC, p.id_projeto DESC
      `,
      [current.tenantId, idObra]
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idProjeto: Number(r.idProjeto),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const idObra = parseId(body?.idObra);
    const idProjeto = parseId(body?.idProjeto);
    if (!idObra) return fail(422, "idObra inválido.");
    if (!idProjeto) return fail(422, "idProjeto inválido.");

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT IGNORE INTO engenharia_obras_projetos
        (tenant_id, id_obra, id_projeto)
      VALUES
        (?,?,?)
      `,
      [current.tenantId, idObra, idProjeto]
    );
    await conn.commit();
    return ok({ ok: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

export async function DELETE(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const idObra = parseId(req.nextUrl.searchParams.get("idObra"));
    const idProjeto = parseId(req.nextUrl.searchParams.get("idProjeto"));
    if (!idObra) return fail(422, "idObra inválido.");
    if (!idProjeto) return fail(422, "idProjeto inválido.");

    await conn.beginTransaction();
    const [del]: any = await conn.query(
      `
      DELETE FROM engenharia_obras_projetos
      WHERE tenant_id = ? AND id_obra = ? AND id_projeto = ?
      LIMIT 1
      `,
      [current.tenantId, idObra, idProjeto]
    );
    await conn.commit();
    if (!del.affectedRows) return fail(404, "Vínculo não encontrado.");
    return ok({ ok: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

